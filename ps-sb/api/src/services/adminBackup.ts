import { randomUUID } from "node:crypto";
import { access, mkdir, open, rename, unlink, type FileHandle, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { getSupabaseAdmin } from "../lib/supabase.js";

export const BACKUP_FORMAT = "lynq-admin-backup-v1";
const BACKUP_TABLES = [
  "customer_records",
  "customer_tags",
  "customer_tag_assignments",
  "promotions",
  "pos_transactions",
  "pos_transaction_items",
] as const;

export type BackupRecordCounts = Record<(typeof BACKUP_TABLES)[number], number>;

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
  lastRunAt: string | null;
  lastRunStatus: "success" | "skipped" | "error" | null;
  lastRunMessage: string | null;
  lastFileName: string | null;
}

const scheduledStatus: ScheduledBackupStatus = {
  enabled: Boolean(config.backupDirectory),
  directoryConfigured: Boolean(config.backupDirectory),
  time: config.backupTime,
  timeZone: config.backupTimeZone,
  lastRunAt: null,
  lastRunStatus: null,
  lastRunMessage: null,
  lastFileName: null,
};

function getTimeParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.backupTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

export async function createAdminBackup(): Promise<AdminBackupPayload> {
  const supabase = getSupabaseAdmin();
  const responses = await Promise.all(BACKUP_TABLES.map((table) =>
    supabase.from(table).select("*").range(0, 49_999)
  ));
  const failed = responses.find((response) => response.error);
  if (failed?.error) throw failed.error;

  const tables = Object.fromEntries(BACKUP_TABLES.map((table, index) => [
    table,
    responses[index].data ?? [],
  ]));
  const recordCounts = Object.fromEntries(BACKUP_TABLES.map((table) => [
    table,
    (tables[table] as unknown[]).length,
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

async function writeScheduledBackup(dateKey: string) {
  scheduledStatus.lastFileName = null;
  const directory = config.backupDirectory;
  const fileName = `lynq-admin-backup-daily-${dateKey}.json`;
  const targetPath = path.join(directory, fileName);
  const temporaryPath = `${targetPath}.${randomUUID()}.tmp`;
  const lockPath = path.join(directory, ".lynq-backup-schedule.lock");

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
      scheduledStatus.lastRunMessage = "Another API process is already creating the scheduled backup.";
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
    try {
      await access(targetPath);
      scheduledStatus.lastRunAt = new Date().toISOString();
      scheduledStatus.lastRunStatus = "skipped";
      scheduledStatus.lastRunMessage = "A scheduled backup already exists for today; existing backups are never overwritten.";
      scheduledStatus.lastFileName = fileName;
      return;
    } catch (error) {
      if (getErrorCode(error) !== "ENOENT") throw error;
    }

    const backup = await createAdminBackup();
    await writeFile(temporaryPath, JSON.stringify(backup, null, 2), { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, targetPath);
    scheduledStatus.lastRunAt = new Date().toISOString();
    scheduledStatus.lastRunStatus = "success";
    scheduledStatus.lastRunMessage = "Scheduled backup saved to the configured flash-drive folder.";
    scheduledStatus.lastFileName = fileName;
    console.info(`Scheduled backup created: ${targetPath}`);
  } catch (error) {
    await unlink(temporaryPath).catch((cleanupError: unknown) => {
      if (getErrorCode(cleanupError) !== "ENOENT") {
        console.error("Unable to clean up temporary scheduled backup:", cleanupError);
      }
    });
    const code = getErrorCode(error);
    scheduledStatus.lastRunAt = new Date().toISOString();
    scheduledStatus.lastRunStatus = code === "ENOENT" || code === "ENODEV" || code === "EIO" ? "skipped" : "error";
    scheduledStatus.lastRunMessage = scheduledStatus.lastRunStatus === "skipped"
      ? "Scheduled backup skipped because the configured flash drive or folder is unavailable."
      : error instanceof Error ? error.message : "Scheduled backup failed.";
    console.error("Scheduled backup failed:", error);
  } finally {
    await lock.close();
    await unlink(lockPath).catch((error: unknown) => {
      if (getErrorCode(error) !== "ENOENT") {
        console.error("Unable to release scheduled backup lock:", error);
      }
    });
  }
}

export function startScheduledAdminBackups() {
  if (!config.backupDirectory) {
    console.warn("Scheduled backups are disabled. Set LYNQ_BACKUP_DIR to a folder on the connected flash drive.");
  } else {
    console.info(`Daily backups are scheduled for ${config.backupTime} ${config.backupTimeZone}.`);
  }

  let lastAttemptedDate = "";
  const checkSchedule = () => {
    if (!config.backupDirectory) return;
    const now = getTimeParts(new Date());
    if (now.time < config.backupTime || lastAttemptedDate === now.date) return;
    lastAttemptedDate = now.date;
    void writeScheduledBackup(now.date).catch((error: unknown) => {
      scheduledStatus.lastRunAt = new Date().toISOString();
      scheduledStatus.lastRunStatus = "error";
      scheduledStatus.lastRunMessage = error instanceof Error ? error.message : "Scheduled backup failed unexpectedly.";
      console.error("Scheduled backup failed unexpectedly:", error);
    });
  };

  checkSchedule();
  return setInterval(checkSchedule, 30_000);
}
