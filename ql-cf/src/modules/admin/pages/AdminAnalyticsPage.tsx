import { useEffect, useState } from "react";
import {
  fetchAnalyticsForecast,
  type AnalyticsSnapshot,
  type HybridForecast,
} from "../services/forecastService";

export function AdminAnalyticsPage() {
  const [stats, setStats] = useState<AnalyticsSnapshot | null>(null);
  const [forecast, setForecast] = useState<HybridForecast | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadAnalytics() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const data = await fetchAnalyticsForecast();
        setStats(data.snapshot);
        setForecast(data.forecast);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to load analytics.");
      } finally {
        setIsLoading(false);
      }
    }

    loadAnalytics();
  }, []);

  const maxHybrid = Math.max(1, ...(forecast?.hourly.map((h) => h.hybrid) ?? [1]));

  return (
    <main className="min-h-screen bg-[#eef1ed] p-4 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 border-b border-[#cfd7d0] pb-4">
          <h1 className="mt-1 font-display text-2xl text-ink">Analytics &amp; Forecasting</h1>
          <p className="mt-1 text-xs text-ink/45">
            Hybrid model: moving average + linear regression
            {forecast ? ` · source ${forecast.source.replaceAll("_", " ")}` : ""}
          </p>
        </div>
        {errorMessage && (
          <p role="alert" className="mb-4 text-sm text-clay">
            {errorMessage}
          </p>
        )}

        {forecast?.crowdAlert && (
          <p className="mb-4 rounded-xl border border-clay/20 bg-clay/5 px-4 py-3 text-sm text-clay">
            Crowd threshold reached. {forecast.waitingCount} customers are waiting.
          </p>
        )}

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-white" />
            ))}
          </div>
        ) : stats ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Waiting" value={stats.waiting} hint="Customers in queue" />
            <StatCard label="In service" value={stats.inService} hint="Currently being served" />
            <StatCard label="Completed today" value={stats.completedToday} hint="Finished visits" />
            <StatCard label="Appointments today" value={stats.scheduledToday} hint="Scheduled arrivals" />
            <StatCard label="Active staff" value={stats.activeStaff} hint="Staff on duty" />
            <StatCard
              label="Predicted wait"
              value={forecast?.ewtMinutes ?? 0}
              hint="Minutes (hybrid EWT)"
              suffix=" min"
            />
          </div>
        ) : null}

        <section className="mt-8 rounded-2xl border border-mist bg-white p-6">
          <h2 className="font-display text-base font-semibold text-ink">Peak-hour forecast</h2>
          <p className="mt-1 text-xs text-ink/45">
            Moving average smooths arrivals; linear regression projects volume by hour of day.
            {forecast ? ` Slope ${forecast.slope}, intercept ${forecast.intercept}.` : ""}
          </p>

          {forecast && (
            <div className="mt-6 flex h-48 items-end gap-2">
              {forecast.hourly.map((hour) => (
                <div key={hour.hour} className="flex flex-1 flex-col items-center gap-2">
                  <div
                    className="w-full rounded-t bg-sage-deep/80"
                    style={{ height: `${Math.max(8, (hour.hybrid / maxHybrid) * 100)}%` }}
                    title={`MA ${hour.movingAverage} · LR ${hour.linearRegression} · hybrid ${hour.hybrid}`}
                  />
                  <span className="text-[10px] text-ink/45">{hour.hour}:00</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  hint,
  suffix = "",
}: {
  label: string;
  value: number;
  hint: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-2xl border border-mist bg-white p-6 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-ink/45">{label}</p>
      <p className="mt-2 font-display text-2xl font-semibold text-ink">
        {value}
        {suffix}
      </p>
      <p className="mt-1 text-xs text-ink/40">{hint}</p>
    </div>
  );
}
