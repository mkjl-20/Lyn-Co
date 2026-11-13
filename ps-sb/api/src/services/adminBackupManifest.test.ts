import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BACKUP_RETENTION, BACKUP_TABLES, getBackupFilesToPrune, getDueBackupPeriods } from "./adminBackupManifest.js";

test("the operational backup manifest covers its tables without auth credentials", () => {
  assert.equal(new Set(BACKUP_TABLES).size, BACKUP_TABLES.length);
  assert.ok(BACKUP_TABLES.includes("customer_accounts"));
  assert.ok(BACKUP_TABLES.includes("customer_tag_assignments"));
  assert.ok(BACKUP_TABLES.includes("queue_entries"));
  assert.ok(BACKUP_TABLES.includes("pos_transaction_adjustments"));
  assert.ok(!new Set<string>(BACKUP_TABLES).has("auth.users"));
});

test("daily backups are always due, with weekly, monthly, and yearly periods on their boundaries", () => {
  assert.deepEqual(
    getDueBackupPeriods({ date: "2026-11-06", year: "2026", month: "11", day: "06", weekday: "Fri" }),
    [{ cadence: "daily", periodKey: "2026-11-06" }],
  );
  assert.deepEqual(
    getDueBackupPeriods({ date: "2026-11-01", year: "2026", month: "11", day: "01", weekday: "Sun" }),
    [
      { cadence: "daily", periodKey: "2026-11-01" },
      { cadence: "weekly", periodKey: "2026-11-01" },
      { cadence: "monthly", periodKey: "2026-11" },
    ],
  );
  assert.deepEqual(
    getDueBackupPeriods({ date: "2023-01-01", year: "2023", month: "01", day: "01", weekday: "Sun" }),
    [
      { cadence: "daily", periodKey: "2023-01-01" },
      { cadence: "weekly", periodKey: "2023-01-01" },
      { cadence: "monthly", periodKey: "2023-01" },
      { cadence: "yearly", periodKey: "2023" },
    ],
  );
});

test("backup pruning enforces retention independently for every cadence", () => {
  const examples = {
    daily: Array.from({ length: 10 }, (_, index) => `2026-11-${String(index + 1).padStart(2, "0")}`),
    weekly: ["2026-10-25", "2026-11-01", "2026-11-08", "2026-11-15", "2026-11-22", "2026-11-29"],
    monthly: Array.from({ length: 14 }, (_, index) =>
      `${2025 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`
    ),
    yearly: Array.from({ length: 7 }, (_, index) => String(2020 + index)),
  };

  for (const [cadence, periodKeys] of Object.entries(examples) as [keyof typeof BACKUP_RETENTION, string[]][]) {
    const fileNames = periodKeys.map((key) => `lynq-operational-backup-${cadence}-${key}.json`);
    const otherCadence = cadence === "daily" ? "weekly" : "daily";
    const filesToPrune = getBackupFilesToPrune(
      [...fileNames, `lynq-operational-backup-${otherCadence}-2026-11-08.json`, "notes.json"],
      cadence,
    );
    assert.equal(filesToPrune.length, Math.max(0, periodKeys.length - BACKUP_RETENTION[cadence]));
  }

  assert.deepEqual(
    getBackupFilesToPrune(
      Array.from({ length: 10 }, (_, index) => `lynq-operational-backup-daily-2026-11-${String(index + 1).padStart(2, "0")}.json`),
      "daily",
    ),
    [
      "lynq-operational-backup-daily-2026-11-03.json",
      "lynq-operational-backup-daily-2026-11-02.json",
      "lynq-operational-backup-daily-2026-11-01.json",
    ],
  );
});

test("the restore migration requires complete v2 input and restricts execution to the API role", async () => {
  const migration = new URL("../../../supabase/migrations/20261103100000_full_operational_admin_backups.sql", import.meta.url);
  const sql = await readFile(migration, "utf8");

  assert.match(sql, /lynq-admin-backup-v2/);
  assert.match(sql, /jsonb_populate_recordset/);
  assert.match(sql, /Cannot restore operational backup: required table/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.restore_lynq_admin_backup/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.restore_lynq_admin_backup\(jsonb\) TO service_role/);
  for (const table of BACKUP_TABLES) {
    assert.ok(sql.includes(`'${table}'`), `restore migration is missing ${table}`);
  }
});
