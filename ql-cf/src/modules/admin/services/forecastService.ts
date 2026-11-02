import { apiRequest } from "@/shared/lib/apiClient";
import { supabaseClient } from "@/shared/lib/supabaseClient";

export interface HourlyForecast {
  hour: number;
  movingAverage: number;
  linearRegression: number;
  hybrid: number;
}

export interface HybridForecast {
  method: string;
  source: string;
  hourly: HourlyForecast[];
  slope: number;
  intercept: number;
  ewtMinutes: number;
  waitingCount: number;
  remainingMinutes: number;
  activeStaff: number;
  crowdAlert: boolean;
}

export interface AnalyticsSnapshot {
  waiting: number;
  inService: number;
  completedToday: number;
  scheduledToday: number;
  activeStaff: number;
}

export interface MonthlyForecast {
  history: { month: string; count: number }[];
  forecast: { month: string; movingAverage: number; linearRegression: number; hybrid: number }[];
}

export interface StaffingRecommendation {
  hour: number;
  forecastCustomers: number;
  activeStaff: number;
  recommendedStaff: number;
  staffingGap: number;
}

export interface ForecastScenario {
  staffCount: number;
  baselineStaffCount: number;
  demandMultiplier: number;
  serviceDurationMultiplier: number;
  eventMultiplier: number;
  eventAdjustmentAvailable: boolean;
  combinedMultiplier: number;
  baselineProjectedWaitMinutes: number;
  projectedWaitMinutes: number;
  waitChangeMinutes: number;
  averageServiceMinutes: number;
  scenarioAverageServiceMinutes: number;
  hourly: {
    hour: number;
    baselineForecastCustomers: number;
    forecastCustomers: number;
    baselineRecommendedStaff: number;
    baselineStaffingGap: number;
    recommendedStaff: number;
    staffingGap: number;
  }[];
}

export interface ServiceDurationSummary {
  serviceId: string;
  serviceName: string;
  sampleCount: number;
  averageEstimatedMinutes: number;
  averageActualMinutes: number;
  averageDifferenceMinutes: number;
  meanAbsoluteErrorMinutes: number;
}

export interface ForecastAccuracy {
  available: boolean;
  sampleCount: number;
  waitMeanAbsoluteErrorMinutes: number | null;
  noShowBrierScore: number | null;
  message: string;
  observedOutcomes: {
    completedCount: number;
    noShowCount: number;
    noShowRate: number | null;
    actualWaitSampleCount: number;
    averageActualWaitMinutes: number | null;
  };
}

export interface EwtModel {
  slope: number;
  intercept: number;
  r2: number | null;
  n: number;
  valid: boolean;
  fitted_at: string | null;
}

export interface EwtRollupLog {
  created_at: string;
  payload: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEwtModel(value: unknown): EwtModel | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)
    || typeof value.slope !== "number"
    || typeof value.intercept !== "number"
    || (typeof value.r2 !== "number" && value.r2 !== null)
    || typeof value.n !== "number"
    || typeof value.valid !== "boolean"
    || (typeof value.fitted_at !== "string" && value.fitted_at !== null)) {
    throw new Error("The stored EWT model has an unexpected format.");
  }

  return {
    slope: value.slope,
    intercept: value.intercept,
    r2: value.r2,
    n: value.n,
    valid: value.valid,
    fitted_at: value.fitted_at,
  };
}

export async function fetchEwtAnalytics(): Promise<{
  model: EwtModel | null;
  dailyAccuracy: EwtRollupLog[];
}> {
  const [modelResult, logsResult] = await Promise.all([
    supabaseClient
      .from("system_settings")
      .select("value")
      .eq("key", "ewt_model")
      .maybeSingle(),
    supabaseClient
      .from("forecast_logs")
      .select("created_at, payload")
      .contains("payload", { source: "ewt_rollup" })
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  if (modelResult.error) throw new Error(modelResult.error.message);
  if (logsResult.error) throw new Error(logsResult.error.message);

  const dailyAccuracy = (logsResult.data ?? []).map((row): EwtRollupLog => {
    if (!isRecord(row.payload)) {
      throw new Error("A daily EWT accuracy row has an unexpected payload.");
    }
    return { created_at: row.created_at, payload: row.payload };
  });

  return {
    model: parseEwtModel(modelResult.data?.value),
    dailyAccuracy,
  };
}

export async function fetchAnalyticsForecast(period: "day" | "week" | "month" | "year", date: string) {
  const search = new URLSearchParams({ period, date });
  return apiRequest<{
    snapshot: AnalyticsSnapshot;
    forecast: HybridForecast;
    staffingRecommendations: StaffingRecommendation[];
    averageServiceMinutes: number;
    serviceDurationReport: ServiceDurationSummary[];
    forecastAccuracy: ForecastAccuracy;
    reportRange: { period: string; from: string; to: string };
    monthlyForecast: MonthlyForecast;
    eventAdjustment: {
      date: string;
      demandMultiplier: number;
      events: { title: string; event_type: string; demand_multiplier: number }[];
      available: boolean;
    };
  }>(
    `/api/forecast/analytics?${search.toString()}`
  );
}

export async function simulateForecastScenario(
  staffCount: number,
  demandMultiplier: number,
  serviceDurationMultiplier: number,
) {
  const { scenario } = await apiRequest<{ scenario: ForecastScenario }>("/api/forecast/simulate", {
    method: "POST",
    body: JSON.stringify({ staffCount, demandMultiplier, serviceDurationMultiplier }),
  });
  return scenario;
}
