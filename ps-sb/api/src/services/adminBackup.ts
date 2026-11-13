import { randomUUID } from "node:crypto";
import { access, lstat, mkdir, open, readdir, rename, unlink, type FileHandle, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import {
  BACKUP_RETENTION,
  BACKUP_TABLES,
  getBackupFilesToPrune,
  getDueBackupPeriods,
  type BackupCadence,
  type BackupDateParts,
  type BackupPeriod,
  type BackupRecordCounts,
} from "./adminBackupManifest.js";

export const BACKUP_FORMAT = "lynq-admin-backup-v2";
export { BACKUP_RETENTION, BACKUP_TABLES };

export interface AdminBackupPayload {
  format: string;
  exportedAt: string;
  recordCounts: BackupRecordCounts;
  [table: string]: unknown;
}

export interface ScheduledBackupStatus {
  enabled: boolean;
  directoryConfigured: boolean;
  time: string;
  timeZone: string;
  retention: typeof BACKUP_RETENTION;
  lastRunAt: string | null;
  lastRunStatus: "success" | "skipped" | "error" | null;
  lastRunMessage: string | null;
  lastFileName: string | null;
}

export interface ScheduledBackupFile {
  fileName: string;
  cadence: BackupCadence;
  size: number;
  createdAt: string;
}

export interface ScheduledBackupFiles {
  backups: ScheduledBackupFile[];
  available: boolean;
  message: string | null;
}

const scheduledStatus: ScheduledBackupStatus = {
  enabled: Boolean(config.backupDirectory),
  directoryConfigured: Boolean(config.backupDirectory),
  time: config.backupTime,
  timeZone: config.backupTimeZone,
  retention: BACKUP_RETENTION,
  lastRunAt: null,
  lastRunStatus: null,
  lastRunMessage: null,
  lastFileName: null,
};

const PAGE_SIZE = 1_000;
const RETRY_DELAY_MS = 5 * 60 * 1_000;

function getTimeParts(date: Date): BackupDateParts & { time: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: config.backupTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    year: values.year,
    month: values.month,
    day: values.day,
    weekday: values.weekday,
    time: `${values.hour}:${values.minute}`,
  };
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

export async function createAdminBackup(): Promise<AdminBackupPayload> {
  const supabase = getSupabaseAdmin();
  const tables: Record<string, unknown[]> = {};

  for (const table of BACKUP_TABLES) {
    const records: unknown[] = [];
    let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw new Error(`Unable to back up ${table}: ${error.message}`);
      const page = data ?? [];
      records.push(...page);
      if (page.length < PAGE_SIZE) break;
      offset += page.length;
    }
    tables[table] = records;
  }

  const recordCounts = Object.fromEntries(BACKUP_TABLES.map((table) => [
    table,
    tables[table].length,
  ])) as BackupRecordCounts;

  return {
    format: BACKUP_FORMAT,
    exportedAt: new Date().toISOString(),
    recordCounts,
    ...tables,
  };
}

export function getScheduledBackupStatus(): ScheduledBackupStatus {
  return { ...scheduledStatus };
}

function getPeriodFileName(period: BackupPeriod) {
  return `lynq-operational-backup-${period.cadence}-${period.periodKey}.json`;
}

function getBackupCadence(fileName: string): BackupCadence | null {
  const match = /^lynq-operational-backup-(daily|weekly|monthly|yearly)-(.+)\.json$/.exec(fileName);
  if (!match) return null;
  const cadence = match[1];
  const period = match[2];
  if (cadence === "daily" || cadence === "weekly") {
    return /^\d{4}-\d{2}-\d{2}$/.test(period) ? cadence : null;
  }
  if (cadence === "monthly") return /^\d{4}-\d{2}$/.test(period) ? cadence : null;
  if (cadence === "yearly") return /^\d{4}$/.test(period) ? cadence : null;
  return null;
}

export async function listScheduledAdminBackups(): Promise<ScheduledBackupFiles> {
  if (!config.backupDirectory) {
    return { backups: [], available: false, message: "Automatic backup destination is not configured." };
  }
  let fileNames: string[];
  try {
    fileNames = await readdir(config.backupDirectory);
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "ENOENT" || code === "ENODEV" || code === "EIO") {
      return {
        backups: [],
        available: false,
        message: "The configured backup drive or folder is currently unavailable.",
      };
    }
    throw error;
  }
  const backups: ScheduledBackupFile[] = [];
  for (const fileName of fileNames) {
    const cadence = getBackupCadence(fileName);
    if (!cadence) continue;
    const filePath = path.join(config.backupDirectory, fileName);
    const fileInfo = await lstat(filePath);
    if (!fileInfo.isFile()) continue;
    backups.push({
      fileName,
      cadence,
      size: fileInfo.size,
      createdAt: fileInfo.mtime.toISOString(),
    });
  }
  return {
    backups: backups.sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt) || right.fileName.localeCompare(left.fileName)
    ),
    available: true,
    message: null,
  };
}

export async function getScheduledAdminBackupPath(fileName: string): Promise<string | null> {
  if (!config.backupDirectory || getBackupCadence(fileName) === null) return null;
  const filePath = path.join(config.backupDirectory, fileName);
  try {
    const fileInfo = await lstat(filePath);
    return fileInfo.isFile() ? filePath : null;
  } catch (error) {
    if (getErrorCode(error) === "ENOENT") return null;
    throw error;
  }
}

async function writeScheduledBackups(periods: BackupPeriod[]) {
  scheduledStatus.lastFileName = null;
  const directory = config.backupDirectory;
  const lockPath = path.join(directory, ".lynq-backup-schedule.lock");
  let temporaryPath: string | null = null;

  try {
    await mkdir(directory, { recursive: true });
  } catch (error) {
    const code = getErrorCode(error);
    scheduledStatus.lastRunAt = new Date().toISOString();
    scheduledStatus.lastRunStatus = code === "ENOENT" || code === "ENODEV" || code === "EIO" ? "skipped" : "error";
    scheduledStatus.lastRunMessage = scheduledStatus.lastRunStatus === "skipped"
      ? "Scheduled backup skipped because the configured flash drive or folder is unavailable."
      : error instanceof Error ? error.message : "Scheduled backup failed.";
    console.error("Scheduled backup failed:", error);
    return;
  }

  let lock: FileHandle;
  try {
    lock = await open(lockPath, "wx");
  } catch (error) {
    if (getErrorCode(error) === "EEXIST") {
      scheduledStatus.lastRunAt = new Date().toISOString();
      scheduledStatus.lastRunStatus = "skipped";
      scheduledStatus.lastRunMessage = "Another API process is already creating a scheduled backup.";
      console.warn(scheduledStatus.lastRunMessage);
      return;
    }
    const code = getErrorCode(error);
    scheduledStatus.lastRunAt = new Date().toISOString();
    scheduledStatus.lastRunStatus = code === "ENOENT" || code === "ENODEV" || code === "EIO" ? "skipped" : "error";
    scheduledStatus.lastRunMessage = scheduledStatus.lastRunStatus === "skipped"
      ? "Scheduled backup skipped because the configured flash drive or folder is unavailable."
      : error instanceof Error ? error.message : "Scheduled backup failed.";
    console.error("Scheduled backup failed:", error);
    return;
  }

  try {
    const targets: { cadence: BackupCadence; fileName: string; targetPath: string }[] = [];
    for (const period of periods) {
      const fileName = getPeriodFileName(period);
      const targetPath = path.join(directory, fileName);
      try {
        await access(targetPath);
      } catch (error) {
        if (getErrorCode(error) !== "ENOENT") throw error;
        targets.push({ cadence: period.cadence, fileName, targetPath });
      }
    }

    if (targets.length === 0) {
      for (const { cadence } of periods) {
        await pruneScheduledBackups(directory, cadence);
      }
      scheduledStatus.lastRunAt = new Date().toISOString();
      scheduledStatus.lastRunStatus = "skipped";
      scheduledStatus.lastRunMessage = "All scheduled backups for this period already exist; existing files are never overwritten.";
      return;
    }

    const backup = await createAdminBackup();
    for (const target of targets) {
      temporaryPath = `${target.targetPath}.${randomUUID()}.tmp`;
      await writeFile(temporaryPath, JSON.stringify(backup, null, 2), { encoding: "utf8", flag: "wx" });
      await rename(temporaryPath, target.targetPath);
      temporaryPath = null;
      scheduledStatus.lastFileName = target.fileName;
    }
    for (const { cadence } of periods) {
      await pruneScheduledBackups(directory, cadence);
    }

    scheduledStatus.lastRunAt = new Date().toISOString();
    scheduledStatus.lastRunStatus = "success";
    scheduledStatus.lastRunMessage = `Scheduled ${targets.map(({ cadence }) => cadence).join(", ")} backup saved to the configured flash-drive folder.`;
    console.info(`Scheduled backups created: ${targets.map(({ targetPath }) => targetPath).join(", ")}`);
  } catch (error) {
    if (temporaryPath) {
      await unlink(temporaryPath).catch((cleanupError: unknown) => {
        if (getErrorCode(cleanupError) !== "ENOENT") {
          console.error("Unable to clean up temporary scheduled backup:", cleanupError);
        }
      });
    }
    const code = getErrorCode(error);
    scheduledStatus.lastRunAt = new Date().toISOString();
    scheduledStatus.lastRunStatus = code === "ENOENT" || code === "ENODEV" || code === "EIO" ? "skipped" : "error";
    scheduledStatus.lastRunMessage = scheduledStatus.lastRunStatus === "skipped"
      ? "Scheduled backup skipped because the configured flash drive or folder is unavailable."
      : error instanceof Error ? error.message : "Scheduled backup failed.";
    console.error("Scheduled backup failed:", error);
  } finally {
    try {
      await lock.close();
    } catch (error) {
      console.error("Unable to close scheduled backup lock:", error);
    } finally {
      await unlink(lockPath).catch((error: unknown) => {
        if (getErrorCode(error) !== "ENOENT") {
          console.error("Unable to release scheduled backup lock:", error);
        }
      });
    }
  }
}

async function pruneScheduledBackups(directory: string, cadence: BackupCadence) {
  const fileNames = await readdir(directory);
  for (const fileName of getBackupFilesToPrune(fileNames, cadence)) {
    await unlink(path.join(directory, fileName));
    console.info(`Expired ${cadence} backup removed: ${fileName}`);
  }
}

export function startScheduledAdminBackups() {
  if (!config.backupDirectory) {
    console.warn("Scheduled backups are disabled. Set LYNQ_BACKUP_DIR to a folder on the connected flash drive.");
  } else {
    console.info(`Daily, weekly, monthly, and yearly backups are scheduled for ${config.backupTime} ${config.backupTimeZone}.`);
  }

  let lastAttemptKey = "";
  let lastAttemptAt = 0;
  let isRunning = false;
  const checkSchedule = () => {
    if (!config.backupDirectory || isRunning) return;
    const now = getTimeParts(new Date());
    if (now.time < config.backupTime) return;
    const periods = getDueBackupPeriods(now);
    const attemptKey = periods.map(({ cadence, periodKey }) => `${cadence}:${periodKey}`).join("|");
    if (attemptKey === lastAttemptKey && Date.now() - lastAttemptAt < RETRY_DELAY_MS) return;
    lastAttemptKey = attemptKey;
    lastAttemptAt = Date.now();
    isRunning = true;
    void writeScheduledBackups(periods)
      .catch((error: unknown) => {
        scheduledStatus.lastRunAt = new Date().toISOString();
        scheduledStatus.lastRunStatus = "error";
        scheduledStatus.lastRunMessage = error instanceof Error ? error.message : "Scheduled backup failed unexpectedly.";
        console.error("Scheduled backup failed unexpectedly:", error);
      })
      .finally(() => {
        isRunning = false;
      });
  };

  checkSchedule();
  return setInterval(checkSchedule, 30_000);
}
