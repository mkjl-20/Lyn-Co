import { Router, type Request, type Response } from "express";
import { createHash } from "node:crypto";
import { getSupabase, getSupabaseAdmin } from "../lib/supabase.js";
import { computeHybridForecast, persistForecastLog } from "../services/forecast.js";
import {
  summarizeQueueWaitAccuracy,
  summarizeServiceDurations,
} from "../services/forecastAnalytics.js";
import { trainForecastModel, type ForecastTrainingRow } from "../services/forecastTraining.js";
import { writeAuditLog } from "../lib/auditLog.js";
import { getCrowdThreshold } from "../services/systemSettings.js";
import { getAuthenticatedUser } from "./auth.js";

export const forecastRouter = Router();

async function requireForecastAdmin(req: Request, res: Response) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ success: false, message: "Sign in to manage forecasting data." });
    return null;
  }
  const supabase = getSupabaseAdmin();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("account_role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!profile?.is_active || profile.account_role !== "admin") {
    res.status(403).json({ success: false, message: "Active administrator access is required to manage forecasting data." });
    return null;
  }
  return { user, supabase };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 120;
}

function validateImportedHistoryRow(value: unknown): (ForecastTrainingRow & Record<string, unknown>) | null {
  if (!isRecord(value)) return null;
  const serviceCategory = value.service_category;
  const serviceName = value.service;
  const staffName = value.staff_name;
  if (!isNonEmptyText(serviceCategory) || !isNonEmptyText(serviceName) || !isNonEmptyText(staffName)) {
    return null;
  }
  const staffExperience = value.staff_experience;
  const queueLength = value.queue_length;
  const arrivalRate = value.arrival_rate_per_hr;
  const stationPrep = value.station_prep_min;
  const hourOfDay = value.hour_of_day;
  const waitingMinutes = value.waiting_min;
  const durationMinutes = value.duration_min;
  if (!isFiniteNumber(staffExperience) || !isFiniteNumber(queueLength)
    || !isFiniteNumber(arrivalRate) || !isFiniteNumber(stationPrep)
    || !isFiniteNumber(hourOfDay) || !isFiniteNumber(waitingMinutes)
    || !isFiniteNumber(durationMinutes)) return null;
  if (!Number.isInteger(queueLength) || queueLength < 0
    || !Number.isInteger(hourOfDay) || hourOfDay < 0 || hourOfDay > 23
    || !Number.isInteger(staffExperience) || staffExperience < 1 || staffExperience > 3
    || arrivalRate < 0 || stationPrep < 0 || waitingMinutes < 0 || durationMinutes <= 0) return null;
  const { stylist_request: stylistRequest, add_on: addOn, holiday, payday } = value;
  if (typeof stylistRequest !== "boolean" || typeof addOn !== "boolean"
    || typeof holiday !== "boolean" || typeof payday !== "boolean") return null;
  const seatNo = value.seat_no;
  if (seatNo !== null && seatNo !== undefined
    && (!isFiniteNumber(seatNo) || !Number.isInteger(seatNo) || seatNo < 0)) return null;
  if (typeof value.service_date !== "string"
    || !/^\d{4}-\d{2}-\d{2}$/.test(value.service_date)
    || typeof value.arrived_at !== "string"
    || typeof value.started_at !== "string"
    || typeof value.ended_at !== "string") return null;
  const arrivedAt = Date.parse(value.arrived_at);
  const startedAt = Date.parse(value.started_at);
  const endedAt = Date.parse(value.ended_at);
  const serviceDate = new Date(`${value.service_date}T00:00:00Z`);
  if (![arrivedAt, startedAt, endedAt].every(Number.isFinite)
    || Number.isNaN(serviceDate.getTime())
    || serviceDate.toISOString().slice(0, 10) !== value.service_date
    || startedAt < arrivedAt || endedAt <= startedAt) return null;

  return {
    service: serviceName.trim(),
    started_at: new Date(startedAt).toISOString(),
    duration_min: durationMinutes,
    waiting_min: waitingMinutes,
    queue_length: queueLength,
    arrival_rate_per_hr: arrivalRate,
    hour_of_day: hourOfDay,
    station_prep_min: stationPrep,
    stylist_request: stylistRequest,
    add_on: addOn,
    staff_experience: staffExperience,
    customer_type: typeof value.customer_type === "string" ? value.customer_type.slice(0, 60) : null,
    holiday,
    payday,
    service_date: value.service_date,
    service_category: serviceCategory.trim(),
    staff_name: staffName.trim(),
    seat_no: typeof seatNo === "number" ? seatNo : null,
    customer_group: typeof value.customer_group === "string" ? value.customer_group.slice(0, 60) : null,
    arrived_at: new Date(arrivedAt).toISOString(),
    ended_at: new Date(endedAt).toISOString(),
    source: "imported",
  };
}

async function loadForecastEvents(supabase: ReturnType<typeof getSupabaseAdmin>, date: string) {
  const { data, error } = await supabase
    .from("forecast_events")
    .select("title, event_type, demand_multiplier")
    .eq("event_date", date);
  if (!error) return { events: data ?? [], available: true };
  if (error.code === "PGRST205" || error.code === "42P01") {
    console.warn("Forecast event calendar is unavailable. Apply the forecast-events database migration.");
    return { events: [], available: false };
  }
  throw new Error(`Unable to load forecast events: ${error.message}`);
}

function stationMatchesService(stationCategory: string, serviceCategory: string) {
  const normalize = (value: string) => value.trim().toLowerCase();
  const station = normalize(stationCategory);
  const service = normalize(serviceCategory);
  if (station === service) return true;
  const lane = (category: string) => /hair|rebond|hairstyl/.test(category)
    ? "hair"
    : /nail|mani|pedi|foot/.test(category)
      ? "nails"
      : "other";
  const stationLane = lane(station);
  return stationLane !== "other" && stationLane === lane(service);
}

function customerTypeTags(priorityType: string, arrivalType: string) {
  const priority = priorityType === "vip" ? "VIP"
    : priorityType === "senior" ? "Senior"
      : priorityType === "pwd" ? "PWD"
        : "Regular";
  return [priority, arrivalType === "appointment" ? "Appointment" : "Walk-in"];
}

forecastRouter.get("/", async (req, res) => {
  try {
    const crowdThreshold = await getCrowdThreshold();
    const forecast = await computeHybridForecast(crowdThreshold);
    const todayInManila = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const requestedDate = typeof req.query.date === "string" ? req.query.date : todayInManila;
    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
      ? new Date(`${requestedDate}T00:00:00Z`)
      : null;
    if (!parsedDate || Number.isNaN(parsedDate.getTime())
      || parsedDate.toISOString().slice(0, 10) !== requestedDate) {
      res.status(400).json({ success: false, message: "Choose a valid forecast date." });
      return;
    }
    const eventCalendar = await loadForecastEvents(getSupabaseAdmin(), requestedDate);
    const demandMultiplier = Math.max(0.1, Math.min(5, eventCalendar.events.reduce(
      (multiplier, event) => multiplier * Number(event.demand_multiplier),
      1,
    )));
    const adjustedForecast = demandMultiplier === 1
      ? forecast
      : {
          ...forecast,
          hourly: forecast.hourly.map((hour) => ({
            ...hour,
            movingAverage: Math.round(hour.movingAverage * demandMultiplier * 100) / 100,
            linearRegression: Math.round(hour.linearRegression * demandMultiplier * 100) / 100,
            hybrid: Math.round(hour.hybrid * demandMultiplier * 100) / 100,
          })),
        };
    void persistForecastLog(adjustedForecast);
    res.json({
      success: true,
      forecast: adjustedForecast,
      eventAdjustment: {
        date: requestedDate,
        demandMultiplier,
        events: eventCalendar.events,
        available: eventCalendar.available,
      },
    });
  } catch (error) {
    console.error("Forecast failed:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Forecast failed.",
    });
  }
});

forecastRouter.get("/analytics", async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ success: false, message: "Sign in to view analytics." });
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("account_role, is_active")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.is_active || profile.account_role !== "admin") {
      res.status(403).json({ success: false, message: "Active administrator access is required to view analytics." });
      return;
    }

    const dateParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const today = Object.fromEntries(dateParts.map(({ type, value }) => [type, value]));
    const todayDate = `${today.year}-${today.month}-${today.day}`;
    const forecastDate = typeof req.query.date === "string" ? req.query.date : todayDate;
    const parsedForecastDate = /^\d{4}-\d{2}-\d{2}$/.test(forecastDate)
      ? new Date(`${forecastDate}T00:00:00Z`)
      : null;
    if (!parsedForecastDate || Number.isNaN(parsedForecastDate.getTime())
      || parsedForecastDate.toISOString().slice(0, 10) !== forecastDate) {
      res.status(400).json({ success: false, message: "Choose a valid forecast date." });
      return;
    }
    const period = typeof req.query.period === "string" ? req.query.period : "day";
    if (!["day", "week", "month", "year"].includes(period)) {
      res.status(400).json({ success: false, message: "Choose day, week, month, or year for the analytics period." });
      return;
    }

    const selectedDay = new Date(`${forecastDate}T00:00:00Z`);
    const dayOfWeek = (selectedDay.getUTCDay() + 6) % 7;
    const rangeStart = new Date(selectedDay);
    if (period === "week") rangeStart.setUTCDate(rangeStart.getUTCDate() - dayOfWeek);
    if (period === "month") rangeStart.setUTCDate(1);
    if (period === "year") {
      rangeStart.setUTCMonth(0, 1);
    }
    const rangeEnd = new Date(rangeStart);
    if (period === "day") rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);
    if (period === "week") rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 7);
    if (period === "month") rangeEnd.setUTCMonth(rangeEnd.getUTCMonth() + 1);
    if (period === "year") rangeEnd.setUTCFullYear(rangeEnd.getUTCFullYear() + 1);
    const dateString = (date: Date) => date.toISOString().slice(0, 10);
    const dayStart = new Date(`${dateString(rangeStart)}T00:00:00+08:00`);
    const dayEnd = new Date(`${dateString(rangeEnd)}T00:00:00+08:00`);
    const dayStartIso = dayStart.toISOString();
    const dayEndIso = dayEnd.toISOString();

    const crowdThreshold = await getCrowdThreshold();
    const historyFrom = new Date();
    historyFrom.setUTCMonth(historyFrom.getUTCMonth() - 24);
    const [waitingRes, inServiceRes, completedRes, appointmentsRes, staffRes, serviceDurationsRes, outcomeRes, forecast, eventCalendar, monthlyHistoryRes] =
      await Promise.all([
        supabase.from("queue_entries").select("id", { count: "exact", head: true }).eq("status", "waiting"),
        supabase.from("queue_entries").select("id", { count: "exact", head: true }).eq("status", "in_service"),
        supabase
          .from("queue_entries")
          .select("id", { count: "exact", head: true })
          .eq("status", "completed")
          .gte("completed_at", dayStartIso)
          .lt("completed_at", dayEndIso),
        supabase
          .from("queue_entries")
          .select("id", { count: "exact", head: true })
          .eq("arrival_type", "appointment")
          .gte("appointment_at", dayStartIso)
          .lt("appointment_at", dayEndIso),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("account_role", "staff")
          .eq("is_active", true),
        supabase
          .from("queue_entry_services")
          .select("service_id, estimated_duration, service_started_at, started_at, completed_at, services ( name )")
          .eq("status", "completed")
          .gte("completed_at", dayStartIso)
          .lt("completed_at", dayEndIso)
          .limit(5000),
        supabase
          .from("queue_entries")
          .select("status, created_at, predicted_wait_min, actual_wait_min")
          .in("status", ["completed", "no_show"])
          .gte("created_at", dayStartIso)
          .lt("created_at", dayEndIso)
          .limit(5000),
        computeHybridForecast(crowdThreshold, supabase),
        loadForecastEvents(supabase, forecastDate),
        supabase
          .from("queue_entries")
          .select("created_at")
          .gte("created_at", historyFrom.toISOString())
          .limit(10000),
      ]);

    for (const result of [waitingRes, inServiceRes, completedRes, appointmentsRes, staffRes, serviceDurationsRes, outcomeRes, monthlyHistoryRes]) {
      if (result.error) throw result.error;
    }

    const eventMultiplier = Math.max(0.1, Math.min(5, eventCalendar.events.reduce(
      (multiplier, event) => multiplier * Number(event.demand_multiplier),
      1,
    )));
    const adjustedForecast = eventMultiplier === 1
      ? forecast
      : {
          ...forecast,
          hourly: forecast.hourly.map((hour) => ({
            ...hour,
            movingAverage: Math.round(hour.movingAverage * eventMultiplier * 100) / 100,
            linearRegression: Math.round(hour.linearRegression * eventMultiplier * 100) / 100,
            hybrid: Math.round(hour.hybrid * eventMultiplier * 100) / 100,
          })),
        };
    const durationObservations = (serviceDurationsRes.data ?? []).flatMap((service) => {
      const actualStart = service.service_started_at ?? service.started_at;
      if (!service.service_id || !actualStart || !service.completed_at) return [];
      const estimatedMinutes = Number(service.estimated_duration);
      const actualMinutes = (Date.parse(service.completed_at) - Date.parse(actualStart)) / 60_000;
      if (!Number.isFinite(estimatedMinutes) || estimatedMinutes <= 0
        || !Number.isFinite(actualMinutes) || actualMinutes <= 0 || actualMinutes > 720) {
        return [];
      }
      const relatedService = Array.isArray(service.services) ? service.services[0] : service.services;
      return [{
        serviceId: service.service_id,
        serviceName: relatedService?.name ?? "Service",
        estimatedMinutes,
        actualMinutes,
      }];
    });
    const serviceDurationReport = summarizeServiceDurations(durationObservations);
    const durations = durationObservations.map((observation) => observation.estimatedMinutes);
    const averageServiceMinutes = durations.length
      ? durations.reduce((total, duration) => total + duration, 0) / durations.length
      : 30;
    const waitAccuracy = summarizeQueueWaitAccuracy((outcomeRes.data ?? []).map((entry) => ({
      status: entry.status,
      predictedWaitMinutes: entry.predicted_wait_min === null ? null : Number(entry.predicted_wait_min),
      actualWaitMinutes: entry.actual_wait_min === null ? null : Number(entry.actual_wait_min),
    })));
    const staffingRecommendations = adjustedForecast.hourly.map((hour) => {
      const recommendedStaff = Math.ceil(hour.hybrid * averageServiceMinutes / 60);
      return {
        hour: hour.hour,
        forecastCustomers: hour.hybrid,
        activeStaff: staffRes.count ?? 0,
        recommendedStaff,
        staffingGap: recommendedStaff - (staffRes.count ?? 0),
      };
    });
    const monthFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
    });
    const monthlyCounts = new Map<string, number>();
    for (const entry of monthlyHistoryRes.data ?? []) {
      const month = monthFormatter.format(new Date(entry.created_at));
      monthlyCounts.set(month, (monthlyCounts.get(month) ?? 0) + 1);
    }
    const selectedMonth = new Date(`${forecastDate.slice(0, 7)}-01T00:00:00Z`);
    const monthHistory = Array.from({ length: 12 }, (_, index) => {
      const monthDate = new Date(selectedMonth);
      monthDate.setUTCMonth(monthDate.getUTCMonth() - (11 - index));
      const month = monthDate.toISOString().slice(0, 7);
      return { month, count: monthlyCounts.get(month) ?? 0 };
    });
    const xs = monthHistory.map((_, index) => index);
    const ys = monthHistory.map((month) => month.count);
    const xMean = xs.reduce((sum, value) => sum + value, 0) / xs.length;
    const yMean = ys.reduce((sum, value) => sum + value, 0) / ys.length;
    const denominator = xs.reduce((sum, value) => sum + (value - xMean) ** 2, 0);
    const slope = denominator === 0
      ? 0
      : xs.reduce((sum, value, index) => sum + (value - xMean) * (ys[index] - yMean), 0) / denominator;
    const intercept = yMean - slope * xMean;
    const recentAverage = ys.slice(-3).reduce((sum, value) => sum + value, 0) / Math.min(3, ys.length);
    const monthlyForecast = Array.from({ length: 3 }, (_, index) => {
      const monthDate = new Date(selectedMonth);
      monthDate.setUTCMonth(monthDate.getUTCMonth() + index + 1);
      const regression = Math.max(0, intercept + slope * (11 + index + 1));
      return {
        month: monthDate.toISOString().slice(0, 7),
        movingAverage: Math.round(recentAverage * 10) / 10,
        linearRegression: Math.round(regression * 10) / 10,
        hybrid: Math.round((recentAverage * 0.6 + regression * 0.4) * 10) / 10,
      };
    });

    res.json({
      success: true,
      snapshot: {
        waiting: waitingRes.count ?? 0,
        inService: inServiceRes.count ?? 0,
        completedToday: completedRes.count ?? 0,
        scheduledToday: appointmentsRes.count ?? 0,
        activeStaff: staffRes.count ?? 0,
      },
      reportRange: { period, from: dateString(rangeStart), to: dateString(rangeEnd) },
      forecast: adjustedForecast,
      staffingRecommendations,
      averageServiceMinutes: Math.round(averageServiceMinutes * 10) / 10,
      serviceDurationReport,
      forecastAccuracy: {
        available: waitAccuracy.sampleCount > 0,
        sampleCount: waitAccuracy.sampleCount,
        linkedOutcomeCount: waitAccuracy.linkedOutcomeCount,
        waitMeanAbsoluteErrorMinutes: waitAccuracy.waitMeanAbsoluteErrorMinutes,
        noShowBrierScore: null,
        message: waitAccuracy.sampleCount > 0
          ? `Wait predictions are matched to ${waitAccuracy.sampleCount} completed visits. No-show probability scores remain unavailable because individual no-show probabilities are not generated.`
          : "No completed visits in this period have both a stored wait prediction and an actual wait yet. Predictions are linked to completed/no-show outcomes when available.",
        observedOutcomes: {
          completedCount: waitAccuracy.completedCount,
          noShowCount: waitAccuracy.noShowCount,
          noShowRate: waitAccuracy.completedCount + waitAccuracy.noShowCount > 0
            ? Math.round((waitAccuracy.noShowCount / (waitAccuracy.completedCount + waitAccuracy.noShowCount)) * 1000) / 10
            : null,
          actualWaitSampleCount: waitAccuracy.sampleCount,
          averageActualWaitMinutes: waitAccuracy.averageActualWaitMinutes,
        },
      },
      monthlyForecast: { history: monthHistory, forecast: monthlyForecast },
      eventAdjustment: {
        date: forecastDate,
        demandMultiplier: eventMultiplier,
        events: eventCalendar.events,
        available: eventCalendar.available,
      },
    });
  } catch (error) {
    console.error("Analytics load failed:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Analytics failed.",
    });
  }
});

forecastRouter.get("/dataset/status", async (req, res) => {
  try {
    const access = await requireForecastAdmin(req, res);
    if (!access) return;
    const [historyResult, modelResult] = await Promise.all([
      access.supabase.from("service_history").select("id", { count: "exact", head: true }),
      access.supabase
        .from("mlr_models")
        .select("id, n_train, n_test, r2_test, mae_test, baseline_mae, created_at")
        .eq("active", true)
        .maybeSingle(),
    ]);
    if (historyResult.error) throw historyResult.error;
    if (modelResult.error) throw modelResult.error;
    res.json({
      success: true,
      recordCount: historyResult.count ?? 0,
      activeModel: modelResult.data,
    });
  } catch (error) {
    console.error("Forecast dataset status load failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to load training data status." });
  }
});

forecastRouter.post("/dataset/import", async (req, res) => {
  try {
    const access = await requireForecastAdmin(req, res);
    if (!access) return;
    const rows = req.body?.rows;
    if (!Array.isArray(rows) || rows.length < 1 || rows.length > 200) {
      res.status(400).json({ success: false, message: "Import between 1 and 200 validated CSV rows per request." });
      return;
    }

    const normalizedRows = rows.map(validateImportedHistoryRow);
    const invalidRows = normalizedRows.flatMap((row, index) => row ? [] : [index + 1]);
    if (invalidRows.length > 0) {
      res.status(400).json({
        success: false,
        message: "Some dataset rows are invalid. Review the CSV fields and time ordering.",
        invalidRows: invalidRows.slice(0, 20),
      });
      return;
    }

    const deduplicated = new Map<string, Record<string, unknown>>();
    for (const row of normalizedRows) {
      if (!row) continue;
      const recordHash = createHash("sha256").update(JSON.stringify(row)).digest("hex");
      deduplicated.set(recordHash, { ...row, record_hash: recordHash });
    }
    const { data, error } = await access.supabase
      .from("service_history")
      .upsert([...deduplicated.values()], { onConflict: "record_hash", ignoreDuplicates: true })
      .select("id");
    if (error) throw error;

    const insertedCount = data?.length ?? 0;
    if (insertedCount > 0) {
      await writeAuditLog({
        actorId: access.user.id,
        action: "forecast.dataset.imported",
        entityType: "service_history",
        entityId: null,
        summary: `Imported ${insertedCount} forecasting history rows.`,
        metadata: { insertedCount, submittedCount: rows.length },
      });
    }
    res.status(201).json({
      success: true,
      insertedCount,
      duplicateCount: rows.length - insertedCount,
    });
  } catch (error) {
    console.error("Forecast dataset import failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to import forecasting data." });
  }
});

forecastRouter.post("/dataset/train", async (req, res) => {
  try {
    const access = await requireForecastAdmin(req, res);
    if (!access) return;
    const history: ForecastTrainingRow[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await access.supabase
        .from("service_history")
        .select("service, started_at, duration_min, waiting_min, queue_length, arrival_rate_per_hr, hour_of_day, station_prep_min, stylist_request, add_on, staff_experience, customer_type, holiday, payday")
        .order("started_at", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      history.push(...(data ?? []).map((row) => ({
        ...row,
        duration_min: Number(row.duration_min),
        waiting_min: Number(row.waiting_min),
        queue_length: Number(row.queue_length),
        arrival_rate_per_hr: Number(row.arrival_rate_per_hr),
        hour_of_day: Number(row.hour_of_day),
        station_prep_min: Number(row.station_prep_min),
        staff_experience: Number(row.staff_experience),
      })));
      if (!data || data.length < pageSize) break;
    }

    const result = trainForecastModel(history);
    const { data: savedModel, error: saveError } = await access.supabase
      .from("mlr_models")
      .insert({
        n_train: result.nTrain,
        n_test: result.nTest,
        r2_test: result.r2Test,
        mae_test: result.maeTest,
        baseline_mae: result.baselineMae,
        model: result.model,
        active: false,
        created_by: access.user.id,
      })
      .select("id")
      .single();
    if (saveError) throw saveError;

    const { error: activateError } = await access.supabase.rpc("activate_mlr_model", {
      p_model_id: savedModel.id,
    });
    if (activateError) throw activateError;
    await writeAuditLog({
      actorId: access.user.id,
      action: "forecast.model.trained",
      entityType: "mlr_model",
      entityId: savedModel.id,
      summary: "Trained and activated an MLR wait-time model.",
      metadata: {
        nTrain: result.nTrain,
        nTest: result.nTest,
        maeTest: result.maeTest,
        baselineMae: result.baselineMae,
        r2Test: result.r2Test,
      },
    });
    res.json({
      success: true,
      result: {
        nTrain: result.nTrain,
        nTest: result.nTest,
        r2Test: result.r2Test,
        maeTest: result.maeTest,
        baselineMae: result.baselineMae,
      },
    });
  } catch (error) {
    console.error("Forecast model training failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to train the forecasting model." });
  }
});

forecastRouter.get("/crowd-status", async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ success: false, message: "Sign in to view queue crowding status." });
      return;
    }
    const supabase = getSupabaseAdmin();
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("account_role, is_active")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.is_active || !["admin", "staff"].includes(profile.account_role)) {
      res.status(403).json({ success: false, message: "Active staff access is required to view queue crowding status." });
      return;
    }
    const [{ count, error }, threshold] = await Promise.all([
      supabase.from("queue_entries")
        .select("id", { count: "exact", head: true })
        .eq("status", "waiting"),
      getCrowdThreshold(),
    ]);
    if (error) throw error;
    const waiting = count ?? 0;
    res.json({
      success: true,
      waiting,
      threshold,
      crowded: waiting >= threshold,
    });
  } catch (error) {
    console.error("Queue crowd status load failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to load queue crowding status." });
  }
});

forecastRouter.get("/now-serving", async (req, res) => {
  try {
    const customerView = req.query.view === "customer";
    const supabase = getSupabaseAdmin();
    if (!customerView) {
      const user = await getAuthenticatedUser(req);
      if (!user) {
        res.status(401).json({ success: false, message: "Sign in to view station queues." });
        return;
      }
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("account_role, is_active")
        .eq("id", user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile?.is_active || !["admin", "staff"].includes(profile.account_role)) {
        res.status(403).json({ success: false, message: "Active staff access is required to view station queues." });
        return;
      }
    }
    const [servingRes, upcomingRes, countRes, stationRes, activeStationEntriesRes, serviceSeatsRes] = await Promise.all([
      supabase
        .from("queue_entries")
        .select("id, ticket_number, customer_name, position, status, created_at, customer_service_seat_id, priority_type, arrival_type, queue_entry_services ( id, status, station_id, customer_service_seat_id, services ( name, category ) )")
        .eq("status", "in_service")
        .order("started_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("queue_entries")
        .select("id, ticket_number, customer_name, position, status, created_at, customer_service_seat_id, priority_type, arrival_type, queue_entry_services ( id, status, station_id, customer_service_seat_id, services ( name, category ) )")
        .eq("status", "waiting")
        .order("position", { ascending: true })
        .limit(5),
      supabase
        .from("queue_entries")
        .select("id", { count: "exact", head: true })
        .eq("status", "waiting"),
      supabase
        .from("stations")
        .select("id, label, category, home_staff_id")
        .eq("is_active", true)
        .order("label", { ascending: true }),
      supabase
        .from("queue_entries")
        .select("id, ticket_number, customer_name, position, status, created_at, priority_type, arrival_type, queue_entry_services ( id, status, service_stage, service_started_at, station_id, station_queue_position, customer_service_seat_id, assigned_staff_id, staff_update, started_at, estimated_duration, services ( name, category ) )")
        .in("status", ["waiting", "in_service"])
        .order("position", { ascending: true, nullsFirst: false }),
      supabase
        .from("customer_service_seats")
        .select("id, label, category")
        .eq("is_active", true)
        .order("label", { ascending: true }),
    ]);

    if (servingRes.error) throw servingRes.error;
    if (upcomingRes.error) throw upcomingRes.error;
    if (countRes.error) throw countRes.error;
    if (stationRes.error) throw stationRes.error;
    if (activeStationEntriesRes.error) throw activeStationEntriesRes.error;
    if (serviceSeatsRes.error) throw serviceSeatsRes.error;

    const serviceItems = [
      ...(servingRes.data?.queue_entry_services ?? []),
      ...(upcomingRes.data ?? []).flatMap((entry) => entry.queue_entry_services ?? []),
      ...(activeStationEntriesRes.data ?? []).flatMap((entry) => entry.queue_entry_services ?? []),
    ];
    const stationIds = [...new Set(serviceItems
      .map((item) => item.station_id)
      .filter((id): id is string => Boolean(id)))];
    const stationLabels = new Map<string, string>();
    const assignedStaffIds = [...new Set([
      ...(stationRes.data ?? []).map((station) => station.home_staff_id),
      ...(activeStationEntriesRes.data ?? []).flatMap((entry) =>
        (entry.queue_entry_services ?? []).map((item) => item.assigned_staff_id)
      ),
    ].filter((id): id is string => Boolean(id)))];
    const staffNames = new Map<string, string>();
    if (assignedStaffIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", assignedStaffIds);
      if (profilesError) throw profilesError;
      for (const profile of profiles ?? []) {
        if (profile.full_name) staffNames.set(profile.id, profile.full_name);
      }
    }

    const customerSeatIds = [...new Set(serviceItems
      .map((item) => item.customer_service_seat_id)
      .filter((id): id is string => Boolean(id)))];
    const customerSeatLabels = new Map<string, string>();

    if (stationIds.length > 0) {
      const { data: stations, error: stationsError } = await supabase
        .from("stations")
        .select("id, label")
        .in("id", stationIds);
      if (stationsError) throw stationsError;
      for (const station of stations ?? []) stationLabels.set(station.id, station.label);
    }

    if (customerSeatIds.length > 0) {
      const { data: seats, error: seatsError } = await supabase
        .from("customer_service_seats")
        .select("id, label")
        .in("id", customerSeatIds);
      if (seatsError) throw seatsError;
      for (const seat of seats ?? []) customerSeatLabels.set(seat.id, seat.label);
    }

    const mapQueueEntry = (entry: NonNullable<typeof servingRes.data>) => ({
      id: entry.id,
      ticketNumber: entry.ticket_number,
      customerName: entry.customer_name,
      position: entry.position,
      status: entry.status,
      createdAt: entry.created_at,
      priorityType: entry.priority_type,
      arrivalType: entry.arrival_type,
      services: (entry.queue_entry_services ?? []).map((item) => {
        const service = Array.isArray(item.services) ? item.services[0] : item.services;
        return {
          name: service?.name ?? "Service",
          status: item.status,
          staffStationLabel: item.station_id ? stationLabels.get(item.station_id) ?? null : null,
          customerServiceSeatLabel: item.customer_service_seat_id
            ? customerSeatLabels.get(item.customer_service_seat_id) ?? null
            : null,
        };
      }),
      serviceSeatLabel: entry.customer_service_seat_id
        ? customerSeatLabels.get(entry.customer_service_seat_id) ?? null
        : null,
    });

    const upcoming = (upcomingRes.data ?? []).map(mapQueueEntry);
    const stationBoard = (stationRes.data ?? []).map((station) => {
      const reservations = (activeStationEntriesRes.data ?? []).flatMap((entry) =>
        (entry.queue_entry_services ?? [])
          .filter((item) => {
            if (!["pending", "in_service"].includes(item.status)) return false;
            if (item.station_id === station.id) return true;
            if (item.station_id !== null || item.status !== "pending") return false;
            const service = Array.isArray(item.services) ? item.services[0] : item.services;
            return stationMatchesService(station.category, String(service?.category ?? ""));
          })
          .map((item) => {
            const service = Array.isArray(item.services) ? item.services[0] : item.services;
            return {
              id: item.id,
              ticketNumber: entry.ticket_number,
              customerName: entry.customer_name,
              customerFirstName: entry.customer_name.trim().split(/\s+/)[0] || "Customer",
              assignedStaffName: item.assigned_staff_id
                ? staffNames.get(item.assigned_staff_id) ?? null
                : null,
              serviceSeatLabel: item.customer_service_seat_id
                ? customerSeatLabels.get(item.customer_service_seat_id) ?? null
                : null,
              stationQueuePosition: item.station_queue_position,
              status: item.service_stage,
              serviceName: service?.name ?? "Service",
              priorityType: entry.priority_type,
              arrivalType: entry.arrival_type,
              customerTypeTags: customerTypeTags(entry.priority_type, entry.arrival_type),
              staffUpdate: item.staff_update,
              position: entry.position,
              startedAt: item.service_started_at,
              estimatedDuration: Number(item.estimated_duration ?? 0),
              createdAt: entry.created_at,
              serviceStartedAt: item.service_started_at,
            };
          })
      );
      const current = reservations
        .filter((item) => item.status === "in_service" && item.serviceStartedAt)
        .sort((a, b) => (a.startedAt ?? "").localeCompare(b.startedAt ?? ""))[0] ?? null;
      const nextUp = reservations
        .filter((item) => item.status !== "in_service" || !item.serviceStartedAt)
        .sort((a, b) =>
          (a.stationQueuePosition ?? a.position ?? Number.MAX_SAFE_INTEGER)
          - (b.stationQueuePosition ?? b.position ?? Number.MAX_SAFE_INTEGER)
        );
      const currentRemainingMinutes = current
        ? Math.max(0, current.estimatedDuration - (Date.now() - Date.parse(current.serviceStartedAt!)) / 60_000)
        : 0;
      return {
        id: station.id,
        label: station.label,
        category: station.category,
        staffName: station.home_staff_id ? staffNames.get(station.home_staff_id) ?? null : null,
        status: current ? "in_service" : nextUp[0]?.status ?? "available",
        current: current ? {
          ...current,
          remainingMinutes: Math.ceil(currentRemainingMinutes),
        } : null,
        nextUp: nextUp.slice(0, 5).map((customer) => ({
          ...customer,
          assignedStaffName: customer.assignedStaffName ?? (
            station.home_staff_id ? staffNames.get(station.home_staff_id) ?? null : null
          ),
        })),
        waitingCount: nextUp.length,
        estimatedWaitMinutes: Math.round((currentRemainingMinutes + nextUp.reduce(
          (total, customer) => total + customer.estimatedDuration,
          0,
        )) * 10) / 10,
      };
    });
    const serviceSeatStatuses = new Map<string, "reserved" | "called" | "in_service">();
    for (const entry of activeStationEntriesRes.data ?? []) {
      for (const item of entry.queue_entry_services ?? []) {
        if (!item.customer_service_seat_id || !["pending", "in_service"].includes(item.status)) continue;
        const status = item.service_stage === "in_service" || item.status === "in_service"
          ? "in_service"
          : item.service_stage === "called"
            ? "called"
            : "reserved";
        const existingStatus = serviceSeatStatuses.get(item.customer_service_seat_id);
        if (!existingStatus || status === "in_service" || (status === "called" && existingStatus === "reserved")) {
          serviceSeatStatuses.set(item.customer_service_seat_id, status);
        }
      }
    }
    const serviceSeats = (serviceSeatsRes.data ?? []).map((seat) => ({
      id: seat.id,
      label: seat.label,
      category: seat.category,
      status: serviceSeatStatuses.get(seat.id) ?? "available",
    }));

    if (customerView) {
      res.json({
        success: true,
        stationBoard: stationBoard.map((station) => ({
          id: station.id,
          label: station.label,
          category: station.category,
          staffName: station.staffName,
          status: station.status,
          current: station.current
            ? {
              id: station.current.id,
              ticketNumber: station.current.ticketNumber,
              customerName: station.current.customerFirstName,
              assignedStaffName: station.current.assignedStaffName ?? station.staffName,
              serviceName: station.current.serviceName,
              serviceSeatLabel: station.current.serviceSeatLabel,
              remainingMinutes: station.current.remainingMinutes,
            }
            : null,
          nextUp: station.nextUp.map((customer) => ({
            id: customer.id,
            ticketNumber: customer.ticketNumber,
            customerName: customer.customerFirstName,
            assignedStaffName: customer.assignedStaffName,
            serviceName: customer.serviceName,
            serviceSeatLabel: customer.serviceSeatLabel,
          })),
          waitingCount: station.waitingCount,
          estimatedWaitMinutes: station.estimatedWaitMinutes,
        })),
        serviceSeats,
      });
      return;
    }

    res.json({
      success: true,
      nowServing: servingRes.data ? mapQueueEntry(servingRes.data) : null,
      nextUp: upcoming[0] ?? null,
      upcoming,
      stationBoard,
      serviceSeats,
      waitingCount: countRes.count ?? 0,
    });
  } catch (error) {
    console.error("Now-serving display failed:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Unable to load the now-serving display.",
    });
  }
});
