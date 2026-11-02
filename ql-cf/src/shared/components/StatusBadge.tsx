import type { ReactNode } from "react";

export type StatusTone = "success" | "danger" | "warning" | "info" | "neutral";

const STATUS_TONES: Record<string, StatusTone> = {
  active: "success",
  available: "success",
  completed: "success",
  live: "success",
  paid: "success",
  success: "success",
  approved: "success",
  enabled: "success",
  online: "success",
  open: "success",
  in_service: "info",
  "in service": "info",
  in_use: "info",
  "in use": "info",
  scheduled: "info",
  called: "warning",
  reserved: "warning",
  waiting: "warning",
  inactive: "warning",
  pending: "warning",
  paused: "warning",
  retired: "neutral",
  disabled: "neutral",
  hidden: "warning",
  cancelled: "danger",
  canceled: "danger",
  no_show: "danger",
  unavailable: "danger",
  offline: "danger",
  closed: "danger",
  removed: "danger",
  deleted: "danger",
  out_of_service: "danger",
  "out of service": "danger",
  failed: "danger",
  failure: "danger",
  rejected: "danger",
  unpaid: "warning",
  draft: "neutral",
  error: "danger",
};

function statusToneFor(status: string): StatusTone {
  return STATUS_TONES[status.trim().toLowerCase()] ?? "neutral";
}

const TONE_CLASSES: Record<StatusTone, string> = {
  success: "border-success/20 bg-success-soft text-success",
  danger: "border-danger/20 bg-danger-soft text-danger",
  warning: "border-warning/20 bg-warning-soft text-warning",
  info: "border-info/20 bg-info-soft text-info",
  neutral: "border-mist bg-porcelain text-ink/65",
};

export function StatusBadge({
  children,
  tone,
  status,
  className = "",
}: {
  children: ReactNode;
  tone?: StatusTone;
  status?: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold leading-4 ${TONE_CLASSES[tone ?? (status ? statusToneFor(status) : "neutral")]} ${className}`}>
      {children}
    </span>
  );
}
