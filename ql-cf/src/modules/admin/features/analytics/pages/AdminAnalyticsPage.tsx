import { useCallback, useEffect, useState } from "react";
import { calculateHybridForecast } from "@/modules/admin/features/analytics/forecasting/forecastMath";
import { downloadCsvReport } from "@/modules/admin/features/reports/services/reportExporter";
import {
  fetchAnalyticsForecast,
  type AnalyticsSnapshot,
  type HybridForecast,
  type MonthlyForecast,
  type ForecastAccuracy,
  type StaffingRecommendation,
} from "../services/forecastService";
import { AdminPageLayout } from "../../../components/AdminPageLayout";
import { DashboardMetricCard } from "@/shared/components/DashboardMetricCard";
import { DashboardSkeletonGrid } from "@/shared/components/DashboardSkeletonGrid";
import { DownloadFeedback, type DownloadFeedbackState } from "../../../components/DownloadFeedback";
import { PaginationControls } from "@/shared/components/PaginationControls";
import { paginateItems } from "@/shared/lib/pagination";
import { ForecastDatasetImportPanel } from "../components/ForecastDatasetImportPanel";
import { ForecastEventsPanel } from "../components/ForecastEventsPanel";
import { useFeedback } from "@/shared/components/FeedbackContext";

type AnalyticsTab = "overview" | "demand" | "events" | "staffing" | "accuracy" | "training";

const analyticsTabs: { id: AnalyticsTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "demand", label: "Demand forecast" },
  { id: "events", label: "Seasonal events" },
  { id: "staffing", label: "Staffing" },
  { id: "accuracy", label: "Accuracy" },
  { id: "training", label: "Model data" },
];

const analyticsGroups: { label: string; tabs: AnalyticsTab[] }[] = [
  { label: "Analytics", tabs: ["overview", "accuracy"] },
  { label: "Forecast", tabs: ["demand", "events", "staffing", "training"] },
];

export function AdminAnalyticsPage() {
  const { confirm } = useFeedback();
  const [stats, setStats] = useState<AnalyticsSnapshot | null>(null);
  const [forecast, setForecast] = useState<HybridForecast | null>(null);
  const [staffingRecommendations, setStaffingRecommendations] = useState<StaffingRecommendation[]>([]);
  const [monthlyForecast, setMonthlyForecast] = useState<MonthlyForecast | null>(null);
  const [averageServiceMinutes, setAverageServiceMinutes] = useState(30);
  const [forecastAccuracy, setForecastAccuracy] = useState<ForecastAccuracy | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [analyticsPeriod, setAnalyticsPeriod] = useState<"day" | "week" | "month" | "year">("day");
  const [analyticsDate, setAnalyticsDate] = useState(() => new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()));
  const [reportRange, setReportRange] = useState<{ from: string; to: string } | null>(null);
  const [eventCalendarAvailable, setEventCalendarAvailable] = useState(true);
  const [downloadState, setDownloadState] = useState<DownloadFeedbackState>({ status: "idle" });
  const [staffingPage, setStaffingPage] = useState(1);
  const [monthlyForecastPage, setMonthlyForecastPage] = useState(1);
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("overview");
  const activeTabLabel = analyticsTabs.find((tab) => tab.id === activeTab)?.label ?? "Overview";
  const loadAnalytics = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const data = await fetchAnalyticsForecast(analyticsPeriod, analyticsDate);
      setStats(data.snapshot);
      setForecast(data.forecast);
      setStaffingRecommendations(data.staffingRecommendations);
      setMonthlyForecast(data.monthlyForecast);
      setAverageServiceMinutes(data.averageServiceMinutes);
      setForecastAccuracy(data.forecastAccuracy);
      setReportRange(data.reportRange);
      setEventCalendarAvailable(data.eventAdjustment.available);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load analytics.");
    } finally {
      setIsLoading(false);
    }
  }, [analyticsDate, analyticsPeriod]);

  useEffect(() => {
    // Load the selected reporting window when it changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAnalytics();
  }, [loadAnalytics]);

  const maxHybrid = Math.max(1, ...(forecast?.hourly.map((h) => h.hybrid) ?? [1]));
  const paginatedStaffing = paginateItems(staffingRecommendations, staffingPage, 5);
  const paginatedMonthlyForecast = paginateItems(monthlyForecast?.forecast ?? [], monthlyForecastPage);
  const staffingByHour = new Map(staffingRecommendations.map((item) => [item.hour, item.recommendedStaff]));
  const demandTrend = forecast?.hourly.map((hour) => ({
    label: `${hour.hour}:00`,
    demand: hour.hybrid,
    staff: staffingByHour.get(hour.hour) ?? 0,
  })) ?? [];
  const maxDemand = Math.max(1, ...demandTrend.map((point) => point.demand));
  const maxStaff = Math.max(1, ...demandTrend.map((point) => point.staff));
  const hybridSummary = forecast ? calculateHybridForecast(forecast.hourly.map((hour) => hour.hybrid), {
    windowSize: 3,
    trendWeight: 0.6,
    minimumDataPoints: 4,
  }) : null;

  async function handleExportCsv() {
    if (!forecast || !stats) {
      return;
    }
    if (!await confirm({
      title: "Export forecast report",
      message: "Prepare and download the forecast report as a CSV file?",
      confirmLabel: "Download CSV",
    })) return;
    setDownloadState({ status: "running", message: "Preparing forecast report…" });

    const rows = forecast.hourly.map((hour) => ({
      hour: `${hour.hour}:00`,
      movingAverage: Number(hour.movingAverage.toFixed(1)),
      linearRegression: Number(hour.linearRegression.toFixed(1)),
      hybrid: Number(hour.hybrid.toFixed(1)),
      predictedWaitMinutes: forecast.ewtMinutes,
      waitingCount: stats.waiting,
    }));

    downloadCsvReport(
      `lynq-forecast-report-${new Date().toISOString().slice(0, 10)}.csv`,
      "LynQ Forecast Summary",
      rows,
    );
    setDownloadState({
      status: "success",
      message: "Forecast report prepared and sent to your browser. Check your browser downloads for transfer progress.",
      progressPercent: 100,
    });
  }

  return (
    <AdminPageLayout fullHeight ariaBusy={isLoading}>
      <div className="analytics-workspace flex h-full min-h-0 flex-col gap-2 font-sans">
        <DownloadFeedback state={downloadState} />
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-neutral-200 pb-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight text-[var(--color-ink)]">Forecasts &amp; Analytics</h1>
              {hybridSummary && (
                <span className="rounded-full border border-neutral-200 px-2.5 py-1 text-[10px] font-medium text-neutral-600">
                  <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-neutral-900" />
                  {hybridSummary.confidence === "sufficient" ? "Sufficient data" : "Limited data"}
                  <span className="mx-1.5 text-neutral-300">·</span>
                  Next demand: {Number(hybridSummary.forecastValue.toFixed(1))}
                </span>
              )}
            </div>
            {reportRange && (
              <p className="mt-0.5 text-[11px] text-neutral-500">
                Showing {reportRange.from} through {reportRange.to} (end exclusive)
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex rounded-lg border border-neutral-200 bg-white p-0.5" role="group" aria-label="Reporting period">
              {(["day", "week", "month", "year"] as const).map((period) => (
                <button
                  key={period}
                  type="button"
                  aria-pressed={analyticsPeriod === period}
                  onClick={() => setAnalyticsPeriod(period)}
                  className={`min-h-8 rounded-md px-2.5 text-xs font-medium capitalize transition ${
                    analyticsPeriod === period ? "bg-black text-white" : "text-neutral-600 hover:bg-neutral-100"
                  }`}
                >
                  {period}
                </button>
              ))}
            </div>
            <label htmlFor="analytics-date" className="sr-only">Anchor date</label>
            <input
              id="analytics-date"
              type="date"
              value={analyticsDate}
              onChange={(event) => setAnalyticsDate(event.target.value)}
              className="min-h-9 rounded-lg border border-neutral-200 bg-white px-2.5 text-xs text-neutral-800"
            />
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!forecast || !stats}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-black px-3 text-xs font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Export CSV
            </button>
          </div>
        </header>

        {errorMessage && (
          <div role="alert" className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-red-700">
            <span>{errorMessage}</span>
            <button type="button" onClick={() => void loadAnalytics()} className="min-h-8 rounded-md px-3 font-semibold">Retry</button>
          </div>
        )}

        {forecast?.crowdAlert && (
          <p className="shrink-0 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-700">
            Crowd threshold reached. {forecast.waitingCount} customers are waiting.
          </p>
        )}
        {!eventCalendarAvailable && (
          <p role="status" className="shrink-0 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-600">
            Forecasts are running without event adjustments. Apply the forecast-events database migration to include scheduled holidays and promotions.
          </p>
        )}

        {isLoading ? (
          <DashboardSkeletonGrid count={6} label="Loading analytics and forecast metrics" className="shrink-0 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6" />
        ) : stats ? (
          <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Waiting" value={stats.waiting} />
            <StatCard label="In service" value={stats.inService} />
            <StatCard label={`Completed (${analyticsPeriod})`} value={stats.completedToday} />
            <StatCard label={`Appointments (${analyticsPeriod})`} value={stats.scheduledToday} />
            <StatCard label="Active staff" value={stats.activeStaff} />
            <StatCard
              label="Predicted wait"
              value={forecast?.ewtMinutes ?? 0}
              hint="min"
              suffix=" min"
            />
          </div>
        ) : null}

        <nav aria-label="Analytics and forecast sections" className="shrink-0 overflow-x-auto rounded-lg border border-neutral-200 bg-white p-2">
          <div className="flex min-w-max gap-3">
            {analyticsGroups.map((group) => (
              <div key={group.label} className="flex items-center gap-1 border-r border-neutral-200 pr-3 last:border-0 last:pr-0">
                <span className="mr-1 px-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">{group.label}</span>
                {group.tabs.map((tabId) => {
                  const tab = analyticsTabs.find((item) => item.id === tabId)!;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      aria-current={activeTab === tab.id ? "page" : undefined}
                      onClick={() => setActiveTab(tab.id)}
                      className={`min-h-9 rounded-md px-3 text-xs font-semibold transition ${
                        activeTab === tab.id
                          ? "bg-black text-white"
                          : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </nav>

        <div id={`analytics-page-${activeTab}`} role="region" aria-label={activeTabLabel} className="min-h-0 flex-1 overflow-y-auto pr-1">
          {isLoading && (
            <DashboardSkeletonGrid count={2} variant="panel" label="Loading forecast charts" className="xl:grid-cols-2" />
          )}

        {activeTab === "overview" && <section>
          <h2 className="mb-3 font-display text-lg font-semibold text-[var(--color-ink)]">Overview</h2>
          <div className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-base font-semibold text-[var(--color-ink)]">Peak-hour forecast</h2>
              <span className="rounded-full bg-[var(--app-accent-soft)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--app-ink-muted)]">
                Demand
              </span>
            </div>
            {forecast && (
              <div className="mt-3 overflow-hidden pb-1" role="img" aria-label="Hourly arrival volume forecast">
                <div className="flex h-36 items-end gap-1">
                  {forecast.hourly.map((hour) => (
                    <div key={hour.hour} className="flex flex-1 flex-col items-center gap-2">
                      <div
                        className="w-full rounded-t-xl bg-gradient-to-t from-[var(--app-accent)] to-[var(--color-sage)] shadow-[0_8px_18px_rgba(0,0,0,0.12)]"
                        style={{ height: `${Math.max(12, (hour.hybrid / maxHybrid) * 100)}%` }}
                        title={`MA ${hour.movingAverage} · LR ${hour.linearRegression} · hybrid ${hour.hybrid}`}
                      />
                      <span className="text-[8px] text-[var(--app-ink-muted)]">{hour.hour}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-base font-semibold text-[var(--color-ink)]">Staffing vs demand</h2>
              <span className="rounded-full bg-[var(--app-accent-soft)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--app-ink-muted)]">
                Forecast
              </span>
            </div>

            {demandTrend.length > 0 && (
              <div className="mt-3 h-40 w-full">
                <svg viewBox="0 0 320 180" className="h-full w-full" role="img" aria-label="Demand and staffing trend">
                  <defs>
                    <linearGradient id="demandLine" x1="0" x2="1">
                      <stop offset="0%" stopColor="var(--app-accent)" />
                      <stop offset="100%" stopColor="var(--color-sage)" />
                    </linearGradient>
                    <linearGradient id="staffLine" x1="0" x2="1">
                      <stop offset="0%" stopColor="var(--color-sage)" />
                      <stop offset="100%" stopColor="var(--app-accent-soft)" />
                    </linearGradient>
                  </defs>
                  {[0, 1, 2, 3].map((tick) => (
                    <line key={tick} x1="24" x2="296" y1={24 + tick * 36} y2={24 + tick * 36} stroke="#e5e5e5" strokeDasharray="4 6" />
                  ))}
                  {demandTrend.map((point, index) => {
                    const x = 24 + (index * 268) / Math.max(1, demandTrend.length - 1);
                    const demandY = 150 - (point.demand / maxDemand) * 110;
                    const staffY = 150 - (point.staff / maxStaff) * 110;
                    return (
                      <g key={point.label}>
                        <circle cx={x} cy={demandY} r="3.5" fill="var(--app-accent)" />
                        <circle cx={x} cy={staffY} r="3" fill="var(--color-sage)" />
                        {index < demandTrend.length - 1 && (
                          <>
                            <line x1={x} x2={24 + ((index + 1) * 268) / Math.max(1, demandTrend.length - 1)} y1={demandY} y2={150 - (demandTrend[index + 1].demand / maxDemand) * 110} stroke="url(#demandLine)" strokeWidth="2.5" fill="none" />
                            <line x1={x} x2={24 + ((index + 1) * 268) / Math.max(1, demandTrend.length - 1)} y1={staffY} y2={150 - (demandTrend[index + 1].staff / maxStaff) * 110} stroke="url(#staffLine)" strokeWidth="2" fill="none" />
                          </>
                        )}
                      </g>
                    );
                  })}
                  {demandTrend.map((point, index) => {
                    const x = 24 + (index * 268) / Math.max(1, demandTrend.length - 1);
                    return <text key={`${point.label}-label`} x={x} y="170" textAnchor="middle" fontSize="8" fill="var(--app-ink-muted)">{index % 2 === 0 ? point.label.split(":")[0] : ""}</text>;
                  })}
                </svg>
              </div>
            )}
          </div>
          </div>
        </section>}

        {activeTab === "demand" && monthlyForecast && (
          <section className="min-h-full rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-[var(--color-ink)]">Peak-month forecast</h2>
                <p className="mt-1 text-xs text-[var(--app-ink-muted)]">Monthly queue arrivals. Forecast combines a 3-month moving average with linear regression.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[var(--app-accent-soft)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--app-ink-muted)]">12-month history</span>
                <button type="button" onClick={() => setActiveTab("events")} className="dashboard-primary-action min-h-8 rounded-lg px-3 text-[10px] font-semibold">
                  Plan seasonal demand
                </button>
              </div>
            </div>
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <div>
                <h3 className="text-xs font-semibold text-[var(--app-ink-muted)]">Monthly arrivals</h3>
                <div className="mt-3 flex h-32 items-end gap-1 overflow-hidden border-b border-neutral-200 pb-1" role="img" aria-label="Monthly historical queue arrivals">
                  {monthlyForecast.history.map((month) => {
                    const maxCount = Math.max(1, ...monthlyForecast.history.map((item) => item.count));
                    const height = Math.max(3, (month.count / maxCount) * 100);
                    return <div key={month.month} title={`${month.month}: ${month.count} visits`} className="flex h-full min-w-5 flex-1 items-end"><div className="w-full rounded-t bg-[var(--app-accent)]/75" style={{ height: `${height}%` }} /></div>;
                  })}
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-[var(--app-ink-muted)]">
                  <span>{monthlyForecast.history[0]?.month}</span><span>{monthlyForecast.history.at(-1)?.month}</span>
                </div>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-[var(--app-ink-muted)]">Next 3 months</h3>
                <div className="mt-3">
                  <table className="admin-responsive-table w-full table-fixed text-left text-xs">
                    <thead className="text-[var(--app-ink-muted)]"><tr><th className="py-2">Month</th><th className="py-2">Moving avg.</th><th className="py-2">Regression</th><th className="py-2">Hybrid</th></tr></thead>
                    <tbody>{paginatedMonthlyForecast.items.map((month) => (
                      <tr key={month.month} className="border-t border-neutral-200 text-[var(--color-ink)]">
                        <td data-label="Month" className="py-2">{month.month}</td><td data-label="Moving average">{month.movingAverage}</td><td data-label="Regression">{month.linearRegression}</td><td data-label="Hybrid" className="font-semibold">{month.hybrid}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                  <PaginationControls
                    page={paginatedMonthlyForecast.page}
                    totalPages={paginatedMonthlyForecast.totalPages}
                    firstItem={paginatedMonthlyForecast.firstItem}
                    lastItem={paginatedMonthlyForecast.lastItem}
                    totalItems={monthlyForecast.forecast.length}
                    onPageChange={setMonthlyForecastPage}
                    label="Monthly forecast"
                  />
                </div>
              </div>
            </div>
          </section>
        )}

        {activeTab === "staffing" && <section className="min-h-full rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
            <div>
              <h2 className="font-display text-base font-semibold text-[var(--color-ink)]">Staffing recommendations</h2>
              <p className="mt-1 text-xs text-[var(--app-ink-muted)]">Based on hourly demand and an average service duration of {averageServiceMinutes} minutes.</p>
              <div className="mt-4 overflow-x-hidden">
                <table className="admin-responsive-table w-full table-fixed text-left text-xs">
                  <thead className="bg-[var(--app-surface)] text-[var(--app-ink-muted)]">
                    <tr><th className="py-2">Hour</th><th>Forecast</th><th>Staff needed</th><th>Gap</th></tr>
                  </thead>
                  <tbody>
                    {paginatedStaffing.items.map((item) => (
                      <tr key={item.hour} className="border-t border-neutral-200">
                        <td data-label="Hour" className="py-2">{item.hour}:00</td>
                        <td data-label="Forecast">{item.forecastCustomers}</td>
                        <td data-label="Staff needed">{item.recommendedStaff}</td>
                        <td data-label="Gap" className={item.staffingGap > 0 ? "font-semibold" : "text-[var(--app-ink-muted)]"}>
                          {item.staffingGap > 0 ? `+${item.staffingGap} short` : "Covered"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <PaginationControls
                  page={paginatedStaffing.page}
                  totalPages={paginatedStaffing.totalPages}
                  firstItem={paginatedStaffing.firstItem}
                  lastItem={paginatedStaffing.lastItem}
                  totalItems={staffingRecommendations.length}
                  onPageChange={setStaffingPage}
                  label="Staffing recommendations"
                />
              </div>
            </div>
        </section>}

        {activeTab === "accuracy" && <section className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
          <div>
            <h2 className="font-display text-base font-semibold text-[var(--color-ink)]">Wait and no-show forecast accuracy</h2>
            <p className="mt-1 text-xs text-[var(--app-ink-muted)]">Historical forecast accuracy is reported only when predictions can be matched to observed visits.</p>
            {forecastAccuracy && (
              <>
                <p role="status" className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-[var(--app-ink-muted)]">
                  {forecastAccuracy.available
                    ? `Wait MAE uses ${forecastAccuracy.sampleCount} completed visits; predictions are linked to ${forecastAccuracy.linkedOutcomeCount} completed/no-show outcomes.`
                    : forecastAccuracy.message}
                </p>
                {forecastAccuracy.available && (
                  <p className="mt-2 text-xs text-[var(--app-ink-muted)]">{forecastAccuracy.message}</p>
                )}
                <div className="mt-4 grid gap-3">
                  <AnalyticsMetric
                    label="Observed no-show rate"
                    value={forecastAccuracy.observedOutcomes.noShowRate === null
                      ? "No data"
                      : `${forecastAccuracy.observedOutcomes.noShowRate}%`}
                    detail={`${forecastAccuracy.observedOutcomes.noShowCount} no-shows / ${forecastAccuracy.observedOutcomes.completedCount + forecastAccuracy.observedOutcomes.noShowCount} completed or no-show visits`}
                  />
                </div>
                {forecastAccuracy.available && (
                  <p className="mt-3 text-xs text-[var(--app-ink-muted)]">
                    Wait MAE: {forecastAccuracy.waitMeanAbsoluteErrorMinutes ?? "—"} min · No-show Brier score: {forecastAccuracy.noShowBrierScore ?? "—"}
                  </p>
                )}
              </>
            )}
          </div>
        </section>}

        {activeTab === "training" && <ForecastDatasetImportPanel />}
        {activeTab === "events" && <ForecastEventsPanel />}
        </div>
      </div>
    </AdminPageLayout>
  );
}

function AnalyticsMetric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--app-ink-muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold text-[var(--color-ink)]">{value}</p>
      {detail && <p className="mt-1 text-xs text-[var(--app-ink-muted)]">{detail}</p>}
    </div>
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
  hint?: string;
  suffix?: string;
}) {
  return (
    <DashboardMetricCard label={label} value={value} suffix={suffix || hint} />
  );
}
