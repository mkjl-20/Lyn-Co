import { getSupabase, getSupabaseAdmin } from "../lib/supabase.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceLane } from "./queueRules.js";
import { loadUnavailableStaffIds } from "./staffAvailability.js";

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

// Fixed staff_role -> service lane mapping.
// Replaces the old staff_role_catalog table lookup now that roles are
// a plain enum again (hairstylist, nail_technician, receptionist).
const STAFF_ROLE_LANES: Record<string, string> = {
  hairstylist: "hair",
  nail_technician: "nails",
  manicurist: "nails",
  pedicurist: "nails",
  receptionist: "other",
};

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

async function computeLocalForecast(
  crowdThreshold: number,
  supabase: SupabaseClient
): Promise<HybridForecast> {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [historyRes, waitingRes, staffRes, availability] = await Promise.all([
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
      .select("id")
      .eq("account_role", "staff")
      .eq("is_active", true),
    loadUnavailableStaffIds(getSupabaseAdmin()),
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
  const activeStaff = (staffRes.data ?? []).filter((staff) => !availability.staffIds.has(staff.id)).length;
  const ewtMinutes = round(remainingMinutes / Math.max(activeStaff, 1), 1);

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

export async function computeHybridForecast(
  crowdThreshold: number,
  supabase: SupabaseClient = getSupabase()
): Promise<HybridForecast> {
  const availability = await loadUnavailableStaffIds(getSupabaseAdmin());
  if (availability.staffIds.size > 0) {
    return computeLocalForecast(crowdThreshold, supabase);
  }

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

  return computeLocalForecast(crowdThreshold, supabase);
}

export async function estimateEntryWait(entryId: string, crowdThreshold: number) {
  const supabase = getSupabase();
  const availability = await loadUnavailableStaffIds(getSupabaseAdmin());
  const rpc = availability.staffIds.size === 0
    ? await supabase.rpc("estimate_entry_wait", { p_entry_id: entryId })
    : null;
  if (rpc && !rpc.error && rpc.data != null) {
    return {
      ewtMinutes: Number(rpc.data),
      source: "supabase_rpc" as const,
    };
  }

  const { data: target, error: targetError } = await supabase
    .from("queue_entries")
    .select("id, status, position")
    .eq("id", entryId)
    .maybeSingle();

  if (targetError) throw new Error(targetError.message);
  if (!target) throw new Error("Queue entry not found.");
  if (target.status !== "waiting" || target.position == null) {
    return { ewtMinutes: 0, source: "application_fallback" as const };
  }

  // NOTE: staff_role_catalog is no longer queried here.
  // Role -> lane mapping now comes from the fixed STAFF_ROLE_LANES map above.
  const [entriesRes, serviceItemsRes, historyRes, staffRes, stationsRes] = await Promise.all([
    supabase
      .from("queue_entries")
      .select("id, status, position")
      .in("status", ["waiting", "in_service"]),
    supabase
      .from("queue_entry_services")
      .select("queue_entry_id, service_id, estimated_duration, status, started_at, services ( category )")
      .in("status", ["pending", "in_service"]),
    supabase
      .from("queue_entry_services")
      .select("service_id, started_at, completed_at")
      .eq("status", "completed")
      .not("started_at", "is", null)
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(5000),
    supabase
      .from("profiles")
      .select("id, staff_role")
      .eq("account_role", "staff")
      .eq("is_active", true),
    supabase
      .from("stations")
      .select("category")
      .eq("is_active", true),
  ]);

  for (const result of [entriesRes, serviceItemsRes, historyRes, staffRes, stationsRes]) {
    if (result.error) throw new Error(result.error.message);
  }

  const activeEntries = new Map((entriesRes.data ?? []).map((entry) => [entry.id, entry]));
  const historyByService = new Map<string, number[]>();
  for (const row of historyRes.data ?? []) {
    if (!row.service_id || !row.started_at || !row.completed_at) continue;
    const minutes = (Date.parse(row.completed_at) - Date.parse(row.started_at)) / 60_000;
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 720) continue;
    const values = historyByService.get(row.service_id) ?? [];
    values.push(minutes);
    historyByService.set(row.service_id, values);
  }
  for (const history of historyByService.values()) history.reverse();

  const targetLanes = new Map<string, string>();
  for (const item of serviceItemsRes.data ?? []) {
    if (item.queue_entry_id !== target.id) continue;
    const service = Array.isArray(item.services) ? item.services[0] : item.services;
    if (service?.category) targetLanes.set(serviceLane(service.category), service.category);
  }

  const laneWorkload = new Map<string, number>();
  for (const item of serviceItemsRes.data ?? []) {
    const parent = activeEntries.get(item.queue_entry_id);
    if (!parent) continue;
    const isAhead = parent.status === "in_service"
      || (parent.status === "waiting" && parent.position !== null && parent.position < target.position);
    if (!isAhead) continue;

    const service = Array.isArray(item.services) ? item.services[0] : item.services;
    const lane = serviceLane(service?.category);
    if (!targetLanes.has(lane)) continue;

    const history = historyByService.get(item.service_id) ?? [];
    const serviceMinutes = estimateFromServiceHistory(history, Number(item.estimated_duration || 0));
    const elapsedMinutes = item.status === "in_service" && item.started_at
      ? Math.max(0, (Date.now() - Date.parse(item.started_at)) / 60_000)
      : 0;
    laneWorkload.set(lane, (laneWorkload.get(lane) ?? 0) + Math.max(0, serviceMinutes - elapsedMinutes));
  }

  let ewtMinutes = 0;
  for (const [lane, category] of targetLanes) {
    const eligibleLane = serviceLane(category);
    const eligibleStaff = (staffRes.data ?? []).filter(
      (member) => !availability.staffIds.has(member.id)
        && STAFF_ROLE_LANES[member.staff_role ?? ""] === eligibleLane
    ).length;
    const activeStations = (stationsRes.data ?? []).filter((station) => serviceLane(station.category) === lane).length;
    const capacity = Math.max(1, Math.min(
      Math.max(eligibleStaff, 1),
      activeStations > 0 ? activeStations : Math.max(eligibleStaff, 1)
    ));
    ewtMinutes = Math.max(ewtMinutes, (laneWorkload.get(lane) ?? 0) / capacity);
  }

  return {
    ewtMinutes: round(ewtMinutes, 1),
    source: "application_fallback" as const,
    peopleAhead: [...activeEntries.values()].filter(
      (entry) => entry.status === "waiting" && entry.position !== null && entry.position < target.position!
    ).length,
  };
}

function estimateFromServiceHistory(history: number[], fallbackMinutes: number) {
  if (history.length === 0) return Math.max(fallbackMinutes, 0);

  const candidates = [3, 5, 10, 20, 50];
  let selectedWindow = history.length;
  let bestMae = Number.POSITIVE_INFINITY;

  for (const window of candidates) {
    const errors: number[] = [];
    for (let index = 3; index < history.length; index += 1) {
      const previous = history.slice(Math.max(0, index - window), index);
      if (previous.length === 0) continue;
      const predicted = previous.reduce((sum, value) => sum + value, 0) / previous.length;
      errors.push(Math.abs(history[index] - predicted));
    }

    const mae = errors.length >= 5
      ? errors.reduce((sum, error) => sum + error, 0) / errors.length
      : Number.POSITIVE_INFINITY;
    if (mae < bestMae) {
      bestMae = mae;
      selectedWindow = window;
    }
  }

  const selectedHistory = history.slice(-selectedWindow);
  return selectedHistory.reduce((sum, value) => sum + value, 0) / selectedHistory.length;
}

export async function persistForecastLog(forecast: HybridForecast) {
  const supabase = getSupabaseAdmin();
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