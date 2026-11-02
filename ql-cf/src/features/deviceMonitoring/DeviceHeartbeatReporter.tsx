import { useEffect } from "react";

export type DeviceHeartbeatStatus = "online" | "needs_attention";

const API_BASE = import.meta.env.VITE_API_URL ?? "";
const HEARTBEAT_INTERVAL_MS = 20_000;

export function DeviceHeartbeatReporter({
  kind,
  deviceId,
  status,
}: {
  kind: "kiosk" | "tv";
  deviceId: string;
  status: DeviceHeartbeatStatus;
}) {
  useEffect(() => {
    let active = true;
    let requestInFlight = false;

    const report = async () => {
      if (!active || requestInFlight) return;
      requestInFlight = true;
      try {
        await fetch(`${API_BASE}/api/devices/heartbeat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, deviceId, status }),
        });
      } catch {
        // A missing heartbeat is detected as offline by the monitoring view.
      } finally {
        requestInFlight = false;
      }
    };

    void report();
    const timer = window.setInterval(() => void report(), HEARTBEAT_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [deviceId, kind, status]);

  return null;
}
