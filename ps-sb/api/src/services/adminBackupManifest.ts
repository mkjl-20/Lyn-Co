export const BACKUP_TABLES = [
  "admin_backup_log",
  "audit_logs",
  "customer_accounts",
  "customer_package_balances",
  "customer_records",
  "customer_service_seats",
  "customer_tag_assignments",
  "customer_tags",
  "device_heartbeats",
  "forecast_events",
  "forecast_logs",
  "mlr_models",
  "pos_transaction_adjustments",
  "pos_transaction_items",
  "pos_transactions",
  "profiles",
  "promotion_redemptions",
  "promotions",
  "queue_entries",
  "queue_entry_services",
  "queue_parties",
  "queue_sms_outbox",
  "service_history",
  "service_package_items",
  "service_packages",
  "services",
  "staff_availability",
  "staff_rebalance_requests",
  "staff_role_catalog",
  "stations",
  "system_settings",
] as const;

export const BACKUP_RETENTION = {
  daily: 7,
  weekly: 4,
  monthly: 12,
  yearly: 5,
} as const;

export type BackupCadence = keyof typeof BACKUP_RETENTION;
export type BackupRecordCounts = Record<(typeof BACKUP_TABLES)[number], number>;

export interface BackupDateParts {
  date: string;
  year: string;
  month: string;
  day: string;
  weekday: string;
}

export interface BackupPeriod {
  cadence: BackupCadence;
  periodKey: string;
}

export function getDueBackupPeriods(parts: BackupDateParts): BackupPeriod[] {
  const periods: BackupPeriod[] = [{ cadence: "daily", periodKey: parts.date }];
  if (parts.weekday === "Sun") periods.push({ cadence: "weekly", periodKey: parts.date });
  if (parts.day === "01") periods.push({ cadence: "monthly", periodKey: `${parts.year}-${parts.month}` });
  if (parts.month === "01" && parts.day === "01") periods.push({ cadence: "yearly", periodKey: parts.year });
  return periods;
}

export function getBackupFilesToPrune(fileNames: string[], cadence: BackupCadence): string[] {
  const periodPattern = cadence === "yearly" ? "\\d{4}" : cadence === "monthly" ? "\\d{4}-\\d{2}" : "\\d{4}-\\d{2}-\\d{2}";
  const pattern = new RegExp(`^lynq-operational-backup-${cadence}-(${periodPattern})\\.json$`);
  const matching = fileNames
    .map((fileName) => ({ fileName, match: pattern.exec(fileName) }))
    .filter((entry): entry is { fileName: string; match: RegExpExecArray } => entry.match !== null)
    .sort((left, right) => right.match[1].localeCompare(left.match[1]));
  return matching.slice(BACKUP_RETENTION[cadence]).map(({ fileName }) => fileName);
}
