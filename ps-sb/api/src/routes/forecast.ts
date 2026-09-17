import { Router } from "express";
import { config } from "../config.js";
import { getSupabase } from "../lib/supabase.js";
import { computeHybridForecast, persistForecastLog } from "../services/forecast.js";

export const forecastRouter = Router();

forecastRouter.get("/", async (_req, res) => {
  try {
    const forecast = await computeHybridForecast(config.crowdThreshold);
    void persistForecastLog(forecast);
    res.json({ success: true, forecast });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Forecast failed.",
    });
  }
});

forecastRouter.get("/analytics", async (_req, res) => {
  try {
    const supabase = getSupabase();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayIso = todayStart.toISOString();

    const [waitingRes, inServiceRes, completedRes, scheduledRes, staffRes, forecast] =
      await Promise.all([
        supabase.from("queue_entries").select("id", { count: "exact", head: true }).eq("status", "waiting"),
        supabase.from("queue_entries").select("id", { count: "exact", head: true }).eq("status", "in_service"),
        supabase
          .from("queue_entries")
          .select("id", { count: "exact", head: true })
          .eq("status", "completed")
          .gte("completed_at", todayIso),
        supabase.from("queue_entries").select("id", { count: "exact", head: true }).eq("status", "scheduled"),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("account_role", "staff")
          .eq("is_active", true),
        computeHybridForecast(config.crowdThreshold),
      ]);

    res.json({
      success: true,
      snapshot: {
        waiting: waitingRes.count ?? 0,
        inService: inServiceRes.count ?? 0,
        completedToday: completedRes.count ?? 0,
        scheduledToday: scheduledRes.count ?? 0,
        activeStaff: staffRes.count ?? 0,
      },
      forecast,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Analytics failed.",
    });
  }
});

forecastRouter.get("/now-serving", async (_req, res) => {
  const supabase = getSupabase();
  const { data: serving } = await supabase
    .from("queue_entries")
    .select("id, customer_name, position, status")
    .eq("status", "in_service")
    .order("started_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: next } = await supabase
    .from("queue_entries")
    .select("id, customer_name, position, status")
    .eq("status", "waiting")
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { count } = await supabase
    .from("queue_entries")
    .select("id", { count: "exact", head: true })
    .eq("status", "waiting");

  res.json({
    success: true,
    nowServing: serving,
    nextUp: next,
    waitingCount: count ?? 0,
  });
});
