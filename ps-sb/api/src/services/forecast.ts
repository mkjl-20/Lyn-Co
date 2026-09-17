import { getSupabase } from "../lib/supabase.js";

export interface HourlyForecast {
  hour: number;
  movingAverage: number;
  linearRegression: number;
  hybrid: number;
}

export interface HybridForecast {
  method: "hybrid_ma_linear_regression";
  source: "supabase_rpc" | "application_fallback";
  hourly: HourlyForecast[];
  slope: number;
  intercept: number;
  ewtMinutes: number;
  waitingCount: number;
  remainingMinutes: number;
  activeStaff: number;
  crowdAlert: boolean;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function linearRegression(xs: number[], ys: number[]) {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0 };
  const sx = xs.reduce((a, b) => a + b, 0);
  const sy = ys.reduce((a, b) => a + b, 0);
  const sxy = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const sxx = xs.reduce((a, x) => a + x * x, 0);
  const denom = n * sxx - sx * sx;
  if (denom === 0) return { slope: 0, intercept: sy / n };
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = sy / n - slope * (sx / n);
  return { slope, intercept };
}

export function movingAverage(values: number[], window: number) {
  return values.map((_, index) => {
    const start = Math.max(0, index - window + 1);
    const slice = values.slice(start, index + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

function emptyHourly(slope: number, intercept: number): HourlyForecast[] {
  return Array.from({ length: 11 }, (_, i) => {
    const hour = 9 + i;
    const lr = intercept + slope * hour;
    return {
      hour,
      movingAverage: 0,
      linearRegression: round(lr),
      hybrid: round(Math.max(0, lr * 0.4)),
    };
  });
}

async function computeLocalForecast(crowdThreshold: number): Promise<HybridForecast> {
  const supabase = getSupabase();
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [historyRes, waitingRes, staffRes] = await Promise.all([
    supabase
      .from("queue_entries")
      .select("created_at, estimated_duration, status")
      .gte("created_at", since)
      .neq("status", "cancelled"),
    supabase
      .from("queue_entries")
      .select("estimated_duration, status")
      .in("status", ["waiting", "in_service"]),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("account_role", "staff")
      .eq("is_active", true),
  ]);

  if (historyRes.error) throw new Error(historyRes.error.message);
  if (waitingRes.error) throw new Error(waitingRes.error.message);
  if (staffRes.error) throw new Error(staffRes.error.message);

  const dailyHourCounts: Record<number, number[]> = {};
  const bucketCounts = new Map<string, number>();

  for (const row of historyRes.data ?? []) {
    const created = new Date(row.created_at);
    const hour = created.getHours();
    const day = created.toISOString().slice(0, 10);
    const key = `${day}-${hour}`;
    bucketCounts.set(key, (bucketCounts.get(key) ?? 0) + 1);
    dailyHourCounts[hour] ??= [];
  }

  const xs: number[] = [];
  const ys: number[] = [];
  for (const [key, count] of bucketCounts.entries()) {
    const hour = Number(key.split("-").at(-1));
    xs.push(hour);
    ys.push(count);
    dailyHourCounts[hour] ??= [];
    dailyHourCounts[hour].push(count);
  }

  const { slope, intercept } = linearRegression(xs, ys);

  const hourly = Array.from({ length: 11 }, (_, i) => {
    const hour = 9 + i;
    const series = dailyHourCounts[hour] ?? [0];
    const windowed = movingAverage(series, 7);
    const ma = windowed.at(-1) ?? 0;
    const lr = intercept + slope * hour;
    const hybrid = 0.6 * ma + 0.4 * Math.max(0, lr);
    return {
      hour,
      movingAverage: round(ma),
      linearRegression: round(Math.max(0, lr)),
      hybrid: round(Math.max(0, hybrid)),
    };
  });

  const remainingMinutes = (waitingRes.data ?? []).reduce(
    (sum, row) => sum + Number(row.estimated_duration || 0),
    0
  );
  const waitingCount = (waitingRes.data ?? []).filter((row) => row.status === "waiting").length;
  const activeStaff = Math.max(staffRes.count ?? 0, 1);
  const ewtMinutes = round(remainingMinutes / activeStaff, 1);

  return {
    method: "hybrid_ma_linear_regression",
    source: "application_fallback",
    hourly,
    slope: round(slope, 4),
    intercept: round(intercept, 4),
    ewtMinutes,
    waitingCount,
    remainingMinutes,
    activeStaff,
    crowdAlert: waitingCount >= crowdThreshold,
  };
}

export async function computeHybridForecast(crowdThreshold: number): Promise<HybridForecast> {
  const supabase = getSupabase();
  const rpc = await supabase.rpc("compute_hybrid_forecast", { p_window: 7 });

  if (!rpc.error && rpc.data) {
    const data = rpc.data as Omit<HybridForecast, "source" | "crowdAlert">;
    return {
      ...data,
      method: "hybrid_ma_linear_regression",
      source: "supabase_rpc",
      crowdAlert: (data.waitingCount ?? 0) >= crowdThreshold,
      hourly: data.hourly?.length ? data.hourly : emptyHourly(data.slope, data.intercept),
    };
  }

  return computeLocalForecast(crowdThreshold);
}

export async function estimateEntryWait(entryId: string, crowdThreshold: number) {
  const supabase = getSupabase();
  const rpc = await supabase.rpc("estimate_entry_wait", { p_entry_id: entryId });
  if (!rpc.error && rpc.data != null) {
    return {
      ewtMinutes: Number(rpc.data),
      source: "supabase_rpc" as const,
    };
  }

  const forecast = await computeHybridForecast(crowdThreshold);
  const { data: entry, error } = await supabase
    .from("queue_entries")
    .select("id, status, position, estimated_duration")
    .eq("id", entryId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!entry) throw new Error("Queue entry not found.");
  if (entry.status !== "waiting" || entry.position == null) {
    return { ewtMinutes: 0, source: "application_fallback" as const };
  }

  const { count, error: aheadError } = await supabase
    .from("queue_entries")
    .select("id", { count: "exact", head: true })
    .eq("status", "waiting")
    .lt("position", entry.position);

  if (aheadError) throw new Error(aheadError.message);

  const peopleAhead = count ?? 0;
  const perCustomer = forecast.activeStaff > 0
    ? Math.max(15, forecast.remainingMinutes / Math.max(forecast.waitingCount, 1))
    : 30;
  return {
    ewtMinutes: round(peopleAhead * (perCustomer / forecast.activeStaff), 1),
    source: "application_fallback" as const,
    peopleAhead,
  };
}

export async function persistForecastLog(forecast: HybridForecast) {
  const supabase = getSupabase();
  const { error } = await supabase.from("forecast_logs").insert({
    method: forecast.method,
    source: forecast.source,
    slope: forecast.slope,
    intercept: forecast.intercept,
    ewt_minutes: forecast.ewtMinutes,
    waiting_count: forecast.waitingCount,
    payload: forecast,
  });
  if (error) {
    console.warn("forecast_logs insert skipped:", error.message);
  }
}
