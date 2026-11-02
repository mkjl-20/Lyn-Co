import { Router, type Request, type Response } from "express";
import { requestIpKey, rateLimit } from "../middleware/rateLimit.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { getDeviceStatus, isAllowlistedDevice, type DeviceReportStatus } from "../services/deviceMonitoring.js";
import { getAuthenticatedUser } from "./auth.js";

export const deviceHeartbeatRouter = Router();
export const adminDeviceMonitoringRouter = Router();

const heartbeatRateLimit = rateLimit([
  { key: requestIpKey, limit: 60, windowMs: 5 * 60 * 1000 },
  {
    key: (req) => typeof req.body?.deviceId === "string" ? req.body.deviceId : "",
    limit: 30,
    windowMs: 5 * 60 * 1000,
  },
], "Too many device heartbeat requests. Try again shortly.");

async function requireAdmin(req: Request, res: Response) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ success: false, message: "You must be signed in." });
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
    res.status(403).json({ success: false, message: "Administrator access is required." });
    return null;
  }

  return supabase;
}

deviceHeartbeatRouter.post("/heartbeat", heartbeatRateLimit, async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)
    || Object.keys(body).some((key) => !["kind", "deviceId", "status"].includes(key))
    || Object.keys(body).length !== 3
    || !isAllowlistedDevice(body.kind, body.deviceId)
    || (body.status !== "online" && body.status !== "needs_attention")) {
    res.status(400).json({ success: false, message: "Invalid device heartbeat." });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("device_heartbeats")
      .update({
        last_seen_at: new Date().toISOString(),
        reported_status: body.status as DeviceReportStatus,
      })
      .eq("device_kind", body.kind)
      .eq("device_id", body.deviceId)
      .select("device_id")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      res.status(404).json({ success: false, message: "Device is not registered for monitoring." });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Device heartbeat update failed:", error);
    res.status(503).json({ success: false, message: "Device monitoring is temporarily unavailable." });
  }
});

adminDeviceMonitoringRouter.get("/", async (req, res) => {
  try {
    const supabase = await requireAdmin(req, res);
    if (!supabase) return;

    const { data, error } = await supabase
      .from("device_heartbeats")
      .select("device_kind, device_id, display_name, last_seen_at, reported_status")
      .order("device_kind");
    if (error) throw error;

    const now = Date.now();
    res.json({
      success: true,
      devices: (data ?? []).map((device) => ({
        id: device.device_id,
        kind: device.device_kind,
        name: device.display_name,
        status: getDeviceStatus(device, now),
        lastSeenAt: device.last_seen_at,
      })),
      checkedAt: new Date(now).toISOString(),
    });
  } catch (error) {
    console.error("Device monitoring list failed:", error);
    res.status(500).json({ success: false, message: "Unable to load device monitoring status." });
  }
});
