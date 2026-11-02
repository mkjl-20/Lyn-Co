import { useCallback, useEffect, useState, type FormEvent } from "react";
import { calculateHybridForecast } from "@/features/analytics/forecasting/forecastMath";
import { downloadCsvReport } from "@/features/reports/reportExporter";
import {
  fetchAnalyticsForecast,
  simulateForecastScenario,
  type ForecastScenario,
  type AnalyticsSnapshot,
  type HybridForecast,
  type MonthlyForecast,
  type ForecastAccuracy,
  type ServiceDurationSummary,
  type StaffingRecommendation,
} from "../services/forecastService";
import { AdminPageLayout } from "../components/AdminPageLayout";
import { DashboardMetricCard } from "@/shared/components/DashboardMetricCard";
import { DashboardSkeletonGrid } from "@/shared/components/DashboardSkeletonGrid";
import { DownloadFeedback, type DownloadFeedbackState } from "../components/DownloadFeedback";
import { PaginationControls } from "@/shared/components/PaginationControls";
import { paginateItems } from "@/shared/lib/pagination";
import { ForecastDatasetImportPanel } from "../components/ForecastDatasetImportPanel";

export function AdminAnalyticsPage() {
  const [stats, setStats] = useState<AnalyticsSnapshot | null>(null);
  const [forecast, setForecast] = useState<HybridForecast | null>(null);
  const [staffingRecommendations, setStaffingRecommendations] = useState<StaffingRecommendation[]>([]);
  const [monthlyForecast, setMonthlyForecast] = useState<MonthlyForecast | null>(null);
  const [averageServiceMinutes, setAverageServiceMinutes] = useState(30);
  const [serviceDurationReport, setServiceDurationReport] = useState<ServiceDurationSummary[]>([]);
  const [forecastAccuracy, setForecastAccuracy] = useState<ForecastAccuracy | null>(null);
  const [scenarioStaffCount, setScenarioStaffCount] = useState("1");
  const [scenarioDemandMultiplier, setScenarioDemandMultiplier] = useState("1");
  const [scenarioServiceDurationMultiplier, setScenarioServiceDurationMultiplier] = useState("1");
  const [scenario, setScenario] = useState<ForecastScenario | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
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
      setServiceDurationReport(data.serviceDurationReport);
      setForecastAccuracy(data.forecastAccuracy);
      setScenarioStaffCount(String(Math.max(data.snapshot.activeStaff, 1)));
      setReportRange(data.reportRange);
      setEventCalendarAvailable(data.eventAdjustment.available);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load analytics.");
    } finally {
      setIsLoading(false);
    }
  }, [analyticsDate, analyticsPeriod]);

  async function handleRunScenario(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSimulating(true);
    setErrorMessage(null);
    try {
      const result = await simulateForecastScenario(
        Number(scenarioStaffCount),
        Number(scenarioDemandMultiplier),
        Number(scenarioServiceDurationMultiplier),
      );
      setScenario(result);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to run the what-if simulation.");
    } finally {
      setIsSimulating(false);
    }
  }

  useEffect(() => {
    // Load the selected reporting window when it changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAnalytics();
  }, [loadAnalytics]);

  const maxHybrid = Math.max(1, ...(forecast?.hourly.map((h) => h.hybrid) ?? [1]));
  const paginatedStaffing = paginateItems(staffingRecommendations, staffingPage);
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

  function handleExportCsv() {
    if (!forecast || !stats) {
      return;
    }
    if (!window.confirm("Prepare and download the forecast report as a CSV file?")) return;
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
    <AdminPageLayout
      actions={
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={!forecast || !stats}
          className="min-h-10 shrink-0 rounded-lg bg-sage-deep px-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Export CSV
        </button>
      }
      ariaBusy={isLoading}
    >
      <DownloadFeedback state={downloadState} />
      <div className="space-y-5 pt-2">
        {errorMessage && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-clay/20 bg-clay-light px-4 py-3 text-sm text-clay">
            <span>{errorMessage}</span>
            <button type="button" onClick={() => void loadAnalytics()} className="min-h-11 rounded-md px-3 font-semibold">Retry</button>
          </div>
        )}

        {forecast?.crowdAlert && (
          <p className="rounded-xl border border-clay/20 bg-clay/5 px-4 py-3 text-sm text-clay">
            Crowd threshold reached. {forecast.waitingCount} customers are waiting.
          </p>
        )}
        {!eventCalendarAvailable && (
          <p role="status" className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-3 text-sm text-[var(--app-ink-muted)]">
            Forecasts are running without event adjustments. Apply the forecast-events database migration to include scheduled holidays and promotions.
          </p>
        )}

        {hybridSummary && (
          <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4 text-sm text-[var(--color-ink)] shadow-[var(--app-shadow)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--app-ink-muted)]">Forecast confidence</p>
                <p className="mt-1 font-semibold text-[var(--color-ink)]">{hybridSummary.confidence === "sufficient" ? "Sufficient data" : "Cold start - limited sample"}</p>
              </div>
              <div className="rounded-full bg-[var(--app-accent-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--app-ink-muted)]">
                Next predicted demand: {Number(hybridSummary.forecastValue.toFixed(1))}
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4">
            <div>
              <label htmlFor="analytics-period" className="mb-1 block text-xs font-semibold text-[var(--app-ink-muted)]">Reporting period</label>
              <select id="analytics-period" value={analyticsPeriod} onChange={(event) => setAnalyticsPeriod(event.target.value as typeof analyticsPeriod)} className="min-h-11 rounded-lg border border-[var(--app-border)] bg-white px-3 text-sm text-[var(--color-ink)]">
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
                <option value="year">Year</option>
              </select>
            </div>
            <label htmlFor="analytics-date" className="text-xs font-semibold text-[var(--app-ink-muted)]">
              Anchor date
              <input id="analytics-date" type="date" value={analyticsDate} onChange={(event) => setAnalyticsDate(event.target.value)} className="mt-1 block min-h-11 rounded-lg border border-[var(--app-border)] bg-white px-3 text-sm text-[var(--color-ink)]" />
            </label>
            {reportRange && <p className="text-xs text-[var(--app-ink-muted)]">Showing {reportRange.from} through {reportRange.to} (end exclusive).</p>}
          </div>

        {isLoading ? (
          <DashboardSkeletonGrid count={6} label="Loading analytics and forecast metrics" className="sm:grid-cols-2 lg:grid-cols-3" />
        ) : stats ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

        {isLoading && (
          <DashboardSkeletonGrid count={2} variant="panel" label="Loading forecast charts" className="xl:grid-cols-2" />
        )}

        <section>
          <h2 className="mb-3 font-display text-lg font-semibold text-[var(--color-ink)]">Demand forecasting</h2>
          <div className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
          <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-[var(--app-shadow)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-base font-semibold text-[var(--color-ink)]">Peak-hour forecast</h2>
              <span className="rounded-full bg-[var(--app-accent-soft)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--app-ink-muted)]">
                Demand
              </span>
            </div>
            {forecast && (
              <div className="mt-6 overflow-x-auto pb-2" role="img" aria-label="Hourly arrival volume forecast">
                <div className="flex h-52 min-w-[620px] items-end gap-2">
                  {forecast.hourly.map((hour) => (
                    <div key={hour.hour} className="flex flex-1 flex-col items-center gap-2">
                      <div
                        className="w-full rounded-t-xl bg-gradient-to-t from-[var(--app-accent)] to-[var(--color-sage)] shadow-[0_8px_18px_rgba(0,0,0,0.12)]"
                        style={{ height: `${Math.max(12, (hour.hybrid / maxHybrid) * 100)}%` }}
                        title={`MA ${hour.movingAverage} · LR ${hour.linearRegression} · hybrid ${hour.hybrid}`}
                      />
                      <span className="text-[10px] text-[var(--app-ink-muted)]">{hour.hour}:00</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-[var(--app-shadow)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-base font-semibold text-[var(--color-ink)]">Staffing vs demand</h2>
              <span className="rounded-full bg-[var(--app-accent-soft)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--app-ink-muted)]">
                Forecast
              </span>
            </div>

            {demandTrend.length > 0 && (
              <div className="mt-6 h-52 w-full">
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
                    <line key={tick} x1="24" x2="296" y1={24 + tick * 36} y2={24 + tick * 36} stroke="var(--app-border)" strokeDasharray="4 6" />
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
        </section>

        {monthlyForecast && (
          <section className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-[var(--app-shadow)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-[var(--color-ink)]">Peak-month forecast</h2>
                <p className="mt-1 text-xs text-[var(--app-ink-muted)]">Monthly queue arrivals. Forecast combines a 3-month moving average with linear regression.</p>
              </div>
              <span className="rounded-full bg-[var(--app-accent-soft)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--app-ink-muted)]">12-month history</span>
            </div>
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <div>
                <h3 className="text-xs font-semibold text-[var(--app-ink-muted)]">Monthly arrivals</h3>
                <div className="mt-3 flex h-40 items-end gap-1 overflow-x-auto border-b border-[var(--app-border)] pb-1" role="img" aria-label="Monthly historical queue arrivals">
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
                      <tr key={month.month} className="border-t border-[var(--app-border)] text-[var(--color-ink)]">
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

        <section className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-[var(--app-shadow)]">
              <h2 className="font-display text-base font-semibold text-[var(--color-ink)]">Staffing recommendations</h2>
              <p className="mt-1 text-xs text-[var(--app-ink-muted)]">Based on hourly demand and an average service duration of {averageServiceMinutes} minutes.</p>
              <div className="mt-4 overflow-x-hidden">
                <table className="admin-responsive-table w-full table-fixed text-left text-xs">
                  <thead className="bg-[var(--app-surface)] text-[var(--app-ink-muted)]">
                    <tr><th className="py-2">Hour</th><th>Forecast</th><th>Staff needed</th><th>Gap</th></tr>
                  </thead>
                  <tbody>
                    {paginatedStaffing.items.map((item) => (
                      <tr key={item.hour} className="border-t border-[var(--app-border)]">
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
            <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-[var(--app-shadow)]">
              <h2 className="font-display text-base font-semibold text-[var(--color-ink)]">What-if simulation</h2>
              <p className="mt-1 text-xs text-[var(--app-ink-muted)]">Estimate how staffing and demand changes affect forecasted wait time.</p>
              <form onSubmit={(event) => void handleRunScenario(event)} className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-[var(--app-ink-muted)]">Available staff
                  <input required type="number" min="1" max="100" step="1" value={scenarioStaffCount} onChange={(event) => setScenarioStaffCount(event.target.value)} className="dashboard-filter-control mt-1 block w-full text-ink" />
                </label>
                <label className="text-xs font-medium text-[var(--app-ink-muted)]">Demand multiplier
                  <input required type="number" min="0.1" max="5" step="0.1" value={scenarioDemandMultiplier} onChange={(event) => setScenarioDemandMultiplier(event.target.value)} className="dashboard-filter-control mt-1 block w-full text-ink" />
                </label>
                <label className="text-xs font-medium text-[var(--app-ink-muted)]">Service duration multiplier
                  <input required type="number" min="0.5" max="2" step="0.1" value={scenarioServiceDurationMultiplier} onChange={(event) => setScenarioServiceDurationMultiplier(event.target.value)} className="dashboard-filter-control mt-1 block w-full text-ink" />
                </label>
                <button type="submit" disabled={isSimulating} className="min-h-10 rounded-lg bg-sage-deep px-4 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2">
                  {isSimulating ? "Simulating…" : "Run simulation"}
                </button>
              </form>
              {scenario && (
                <div className="mt-4 rounded-xl bg-[var(--app-surface-soft)] p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ScenarioMetric label="Baseline predicted wait" value={`${scenario.baselineProjectedWaitMinutes} min`} />
                    <ScenarioMetric
                      label="What-if predicted wait"
                      value={`${scenario.projectedWaitMinutes} min`}
                      detail={`${scenario.waitChangeMinutes > 0 ? "+" : ""}${scenario.waitChangeMinutes} min vs baseline`}
                    />
                  </div>
                  <p className="mt-1 text-xs text-[var(--app-ink-muted)]">
                    {scenario.baselineStaffCount} baseline staff → {scenario.staffCount} scenario staff · ×{scenario.demandMultiplier.toFixed(1)} demand · ×{scenario.serviceDurationMultiplier.toFixed(1)} service duration · ×{scenario.eventMultiplier.toFixed(1)} flagged event adjustment
                  </p>
                  {!scenario.eventAdjustmentAvailable && (
                    <p className="mt-1 text-xs text-[var(--app-ink-muted)]">Scheduled event adjustments are unavailable until the forecast-events migration is applied.</p>
                  )}
                  <p className="mt-1 text-xs text-[var(--app-ink-muted)]">Average service duration: {scenario.averageServiceMinutes} min baseline → {scenario.scenarioAverageServiceMinutes} min scenario.</p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="admin-responsive-table w-full table-fixed text-left text-xs">
                      <thead className="text-[var(--app-ink-muted)]"><tr><th className="py-2">Hour</th><th>Customers</th><th>Staff needed</th><th>Scenario gap</th></tr></thead>
                      <tbody>{scenario.hourly.map((hour) => (
                        <tr key={hour.hour} className="border-t border-[var(--app-border)]">
                          <td data-label="Hour" className="py-2">{hour.hour}:00</td>
                          <td data-label="Customers">{hour.baselineForecastCustomers} → {hour.forecastCustomers}</td>
                          <td data-label="Staff needed">{hour.baselineRecommendedStaff} → {hour.recommendedStaff}</td>
                          <td data-label="Scenario gap">{hour.staffingGap > 0 ? `${hour.staffingGap} short` : "Covered"}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
        </section>
        <section className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-[var(--app-shadow)]">
            <h2 className="font-display text-base font-semibold text-[var(--color-ink)]">Service duration: estimated vs actual</h2>
            <p className="mt-1 text-xs text-[var(--app-ink-muted)]">Completed services in the selected reporting period, measured from persisted start and completion timestamps.</p>
            {serviceDurationReport.length > 0 ? (
              <div className="mt-4 overflow-x-auto">
                <table className="admin-responsive-table w-full table-fixed text-left text-xs">
                  <thead className="text-[var(--app-ink-muted)]"><tr><th className="py-2">Service</th><th>Samples</th><th>Estimate</th><th>Actual</th><th>Δ actual−est.</th><th>MAE</th></tr></thead>
                  <tbody>{serviceDurationReport.map((service) => (
                    <tr key={service.serviceId} className="border-t border-[var(--app-border)]">
                      <td data-label="Service" className="py-2">{service.serviceName}</td>
                      <td data-label="Samples">{service.sampleCount}</td>
                      <td data-label="Estimate">{service.averageEstimatedMinutes} min</td>
                      <td data-label="Actual">{service.averageActualMinutes} min</td>
                      <td data-label="Δ actual−est.">{service.averageDifferenceMinutes > 0 ? "+" : ""}{service.averageDifferenceMinutes} min</td>
                      <td data-label="MAE">{service.meanAbsoluteErrorMinutes} min</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : (
              <p className="mt-4 rounded-lg bg-[var(--app-surface-soft)] p-3 text-sm text-[var(--app-ink-muted)]">
                No completed services in this period have both a valid estimate and recorded start/completion times.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-[var(--app-shadow)]">
            <h2 className="font-display text-base font-semibold text-[var(--color-ink)]">Wait and no-show forecast accuracy</h2>
            <p className="mt-1 text-xs text-[var(--app-ink-muted)]">Historical forecast accuracy is reported only when predictions can be matched to observed visits.</p>
            {forecastAccuracy && (
              <>
                <p role="status" className="mt-4 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-soft)] p-3 text-sm text-[var(--app-ink-muted)]">
                  {forecastAccuracy.available
                    ? `Accuracy calculated from ${forecastAccuracy.sampleCount} matched visits.`
                    : forecastAccuracy.message}
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <ScenarioMetric
                    label="Observed no-show rate"
                    value={forecastAccuracy.observedOutcomes.noShowRate === null
                      ? "No data"
                      : `${forecastAccuracy.observedOutcomes.noShowRate}%`}
                    detail={`${forecastAccuracy.observedOutcomes.noShowCount} no-shows / ${forecastAccuracy.observedOutcomes.completedCount + forecastAccuracy.observedOutcomes.noShowCount} completed or no-show visits`}
                  />
                  <ScenarioMetric
                    label="Observed average wait"
                    value={forecastAccuracy.observedOutcomes.averageActualWaitMinutes === null
                      ? "No data"
                      : `${forecastAccuracy.observedOutcomes.averageActualWaitMinutes} min`}
                    detail={forecastAccuracy.observedOutcomes.actualWaitSampleCount > 0
                      ? `${forecastAccuracy.observedOutcomes.actualWaitSampleCount} completed visits with valid wait times`
                      : "No reliable per-visit actual wait samples are available"}
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
        </section>
      </div>
      <div className="mt-5">
        <ForecastDatasetImportPanel />
      </div>
    </AdminPageLayout>
  );
}

function ScenarioMetric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg bg-[var(--app-surface)] p-3">
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
