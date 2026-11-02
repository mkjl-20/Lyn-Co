export const MONITORED_DEVICES = [
  { kind: "kiosk", deviceId: "kiosk-main", name: "Front desk kiosk" },
  { kind: "tv", deviceId: "tv-main", name: "Salon TV display" },
] as const;

export type DeviceKind = (typeof MONITORED_DEVICES)[number]["kind"];
export type DeviceReportStatus = "online" | "needs_attention";
export type DeviceStatus = DeviceReportStatus | "offline";

export interface DeviceHeartbeatRecord {
  last_seen_at: string | null;
  reported_status: DeviceReportStatus;
}

export function isAllowlistedDevice(kind: unknown, deviceId: unknown): boolean {
  return MONITORED_DEVICES.some((device) => device.kind === kind && device.deviceId === deviceId);
}

export function getDeviceStatus(
  device: DeviceHeartbeatRecord,
  now = Date.now(),
): DeviceStatus {
  if (!device.last_seen_at) return "offline";
  const lastSeenAt = Date.parse(device.last_seen_at);
  if (!Number.isFinite(lastSeenAt) || now - lastSeenAt > 90_000) return "offline";
  return device.reported_status === "needs_attention" ? "needs_attention" : "online";
}
