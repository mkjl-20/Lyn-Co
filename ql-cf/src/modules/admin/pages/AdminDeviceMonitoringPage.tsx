import { useCallback, useEffect, useState } from "react";
import { Activity, CircleAlert, Monitor, RefreshCw, Tablet } from "lucide-react";
import { apiRequest } from "@/shared/lib/apiClient";
import { AdminPageLayout } from "../components/AdminPageLayout";

type DeviceStatus = "online" | "offline" | "needs_attention";

interface MonitoredDevice {
  id: string;
  kind: "kiosk" | "tv";
  name: string;
  status: DeviceStatus;
  lastSeenAt: string | null;
}

interface DeviceListResponse {
  devices: MonitoredDevice[];
  checkedAt: string;
}

const STATUS_STYLES: Record<DeviceStatus, string> = {
  online: "bg-sage-light text-sage-deep",
  offline: "bg-clay/15 text-clay",
  needs_attention: "bg-gold-light text-ink",
};

const STATUS_LABELS: Record<DeviceStatus, string> = {
  online: "Online",
  offline: "Offline",
  needs_attention: "Needs attention",
};

function formatLastSeen(value: string | null) {
  if (!value) return "Never connected";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

export function AdminDeviceMonitoringPage() {
  const [devices, setDevices] = useState<MonitoredDevice[]>([]);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await apiRequest<DeviceListResponse>("/api/admin/devices");
      setDevices(response.devices);
      setCheckedAt(response.checkedAt);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load device status.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialRequest = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 20_000);
    return () => {
      window.clearTimeout(initialRequest);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const counts = devices.reduce<Record<DeviceStatus, number>>((summary, device) => {
    summary[device.status] += 1;
    return summary;
  }, { online: 0, offline: 0, needs_attention: 0 });

  return (
    <AdminPageLayout
      title="Device monitoring"
      eyebrow="Operations"
      actions={
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={isLoading}
          className="dashboard-icon-control inline-flex min-h-10 items-center gap-2 px-3 text-sm font-medium text-sage-deep disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} aria-hidden="true" />
          Refresh
        </button>
      }
      ariaBusy={isLoading}
    >
      <section className="mt-2 grid gap-3 sm:grid-cols-3" aria-label="Device status summary">
        {(["online", "offline", "needs_attention"] as const).map((status) => (
          <div key={status} className="rounded-xl border border-mist bg-white/80 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/55">{STATUS_LABELS[status]}</p>
            <p className="mt-1 font-display text-3xl font-semibold text-ink">{counts[status]}</p>
          </div>
        ))}
      </section>

      <section className="mt-5 rounded-xl border border-mist bg-white/80 p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-semibold text-ink">Registered devices</h2>
          <p className="text-xs text-ink/55">
            {checkedAt ? `Checked ${new Date(checkedAt).toLocaleTimeString()}` : "Updates every 20 seconds"}
          </p>
        </div>

        {errorMessage && (
          <p role="alert" className="mt-4 flex items-center gap-2 rounded-lg bg-clay/10 px-3 py-2.5 text-sm text-clay">
            <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            {errorMessage}
          </p>
        )}

        {isLoading && devices.length === 0 ? (
          <p className="mt-5 text-sm text-ink/55">Loading device status…</p>
        ) : devices.length === 0 ? (
          <p className="mt-5 text-sm text-ink/55">No devices are registered for monitoring.</p>
        ) : (
          <ul className="mt-4 divide-y divide-mist">
            {devices.map((device) => (
              <li key={`${device.kind}:${device.id}`} className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sage-light/60 text-sage-deep">
                    {device.kind === "kiosk"
                      ? <Tablet className="h-5 w-5" aria-hidden="true" />
                      : <Monitor className="h-5 w-5" aria-hidden="true" />}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">{device.name}</p>
                    <p className="mt-0.5 text-xs text-ink/55">
                      {device.kind === "kiosk" ? "Kiosk" : "TV display"} · Last heartbeat: {formatLastSeen(device.lastSeenAt)}
                    </p>
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${STATUS_STYLES[device.status]}`}>
                  <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                  {STATUS_LABELS[device.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-ink/50">
          A device is offline when no heartbeat has arrived in 90 seconds. TV display errors are marked as needing attention.
        </p>
      </section>
    </AdminPageLayout>
  );
}
