import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { fromDatabasePromotionDiscountType, toDatabasePromotionDiscountType } from "../lib/promotionDiscount.js";
import { chooseBestEligiblePromotion, type AutomaticPromotionCandidate } from "../lib/promotionRules.js";
import { createSupabaseAuthClient, getSupabaseAdmin } from "../lib/supabase.js";
import { enqueueQueueSmsOnce } from "../services/queueNotifications.js";
import { staffCanPerformCategory } from "../services/queueRules.js";
import { getSalonSettings, validateSalonSettings } from "../services/systemSettings.js";
import {
  BACKUP_FORMAT,
  createAdminBackup,
  getScheduledAdminBackupPath,
  getScheduledBackupStatus,
  listScheduledAdminBackups,
} from "../services/adminBackup.js";
import { isMissingTable } from "../services/staffAvailability.js";
import { rateLimit, requestIpKey } from "../middleware/rateLimit.js";
import { getAuthenticatedUser } from "./auth.js";

export const adminWorkspaceRouter = Router();

const PAYMENT_METHODS = ["cash", "card", "ewallet", "other"] as const;
const posAdjustmentPasswordRateLimit = rateLimit(
  [{ key: requestIpKey, limit: 10, windowMs: 15 * 60 * 1000 }],
  "Too many refund or void attempts. Please try again later.",
);

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

  return { user, supabase };
}

async function requirePosAccess(req: Request, res: Response) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ success: false, message: "You must be signed in." });
    return null;
  }

  const supabase = getSupabaseAdmin();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("account_role, staff_role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!profile?.is_active
    || (profile.account_role !== "admin" && !(profile.account_role === "staff" && profile.staff_role === "receptionist"))) {
    res.status(403).json({ success: false, message: "Active receptionist access is required." });
    return null;
  }

  return { user, supabase, accountRole: profile.account_role };
}

async function verifyAdjustmentPassword(user: { email?: string | null }, passwordValue: unknown, res: Response) {
  const password = typeof passwordValue === "string" ? passwordValue : "";
  if (!password || password.length > 256) {
    res.status(400).json({ success: false, message: "Enter your password to confirm this transaction adjustment." });
    return false;
  }
  if (!user.email) {
    res.status(403).json({ success: false, message: "This account cannot verify its password." });
    return false;
  }

  const { error } = await createSupabaseAuthClient().auth.signInWithPassword({
    email: user.email,
    password,
  });
  if (error) {
    res.status(403).json({ success: false, message: "Password confirmation failed." });
    return false;
  }
  return true;
}

function stringField(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

const MAX_BANNER_IMAGE_BYTES = 500_000;

function validateBannerImage(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || Buffer.byteLength(match[1], "base64") > MAX_BANNER_IMAGE_BYTES) return undefined;
  return value;
}

function optionalNumericField(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function optionalIntegerField(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : undefined;
}

function parsePromotionServiceIds(body: unknown): string[] | undefined {
  if (!body || typeof body !== "object") return undefined;
  const data = body as { eligibleServiceIds?: unknown; limitToServices?: unknown };
  if (!Array.isArray(data.eligibleServiceIds) || data.eligibleServiceIds.length > 100
    || typeof data.limitToServices !== "boolean") return undefined;
  if (data.eligibleServiceIds.some((id) => typeof id !== "string" || !id)) return undefined;
  return data.limitToServices ? [...new Set(data.eligibleServiceIds as string[])] : [];
}

async function promotionServicesAreAvailable(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  serviceIds: string[],
) {
  if (serviceIds.length === 0) return true;
  const { data, error } = await supabase
    .from("services")
    .select("id")
    .in("id", serviceIds)
    .eq("is_visible", true)
    .eq("is_available", true);
  if (error) throw error;
  return (data ?? []).length === serviceIds.length;
}

function normalizeServicePackage(value: unknown): { title: string; price: number } | null {
  const relation = Array.isArray(value) ? value[0] : value;
  if (!relation || typeof relation !== "object") return null;
  const packageRecord = relation as { title?: unknown; price?: unknown };
  const price = Number(packageRecord.price);
  if (typeof packageRecord.title !== "string" || !Number.isFinite(price)) return null;
  return { title: packageRecord.title, price };
}

async function writeAuditLog(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  summary: string,
  metadata: Record<string, unknown> = {},
) {
  const { error } = await supabase.from("audit_logs").insert({
    actor_id: actorId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata: { ...metadata, summary },
  });
  if (error) throw error;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function respondToQueueMutationError(
  res: Response,
  error: { code?: string; message?: string },
  action: string,
) {
  if (error.code === "P0002") {
    res.status(404).json({ success: false, message: "This queue entry could not be found." });
    return true;
  }
  if (error.code === "23514" || error.code === "40001") {
    res.status(409).json({ success: false, message: `The queue entry changed before it could be ${action}. Refresh and try again.` });
    return true;
  }
  if (error.code === "22023") {
    res.status(400).json({ success: false, message: error.message ?? "Invalid queue update." });
    return true;
  }
  if (error.code === "PGRST202" || error.code === "42883") {
    res.status(503).json({ success: false, message: "Queue management database functions are not installed. Apply the latest queue migrations." });
    return true;
  }
  return false;
}

adminWorkspaceRouter.get("/settings", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    res.json({ success: true, settings: await getSalonSettings() });
  } catch (error) {
    console.error("Salon settings load failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to load salon settings." });
  }
});

adminWorkspaceRouter.put("/settings", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const settings = validateSalonSettings(req.body?.settings);
    if (!settings) {
      res.status(400).json({ success: false, message: "Enter valid salon details, queue address, theme, and business hours." });
      return;
    }
    const { error } = await access.supabase
      .from("system_settings")
      .upsert({ key: "salon_settings", value: settings, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw error;
    await writeAuditLog(
      access.supabase,
      access.user.id,
      "salon.settings_updated",
      "salon_settings",
      null,
      "Updated salon settings and branding.",
      { themeColor: settings.themeColor, queueUrlUpdated: Boolean(settings.queueUrl) },
    );
    res.json({ success: true, settings });
  } catch (error) {
    console.error("Salon settings save failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to save salon settings." });
  }
});

adminWorkspaceRouter.patch("/settings/queue-url", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const currentSettings = await getSalonSettings();
    const settings = validateSalonSettings({ ...currentSettings, queueUrl: req.body?.queueUrl });
    if (!settings) {
      res.status(400).json({ success: false, message: "Enter a valid HTTP or HTTPS queue address." });
      return;
    }
    const { error } = await access.supabase
      .from("system_settings")
      .upsert({ key: "salon_settings", value: settings, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw error;
    await writeAuditLog(
      access.supabase,
      access.user.id,
      "salon.queue_url_updated",
      "salon_settings",
      null,
      "Updated the public queue address.",
      { queueUrlUpdated: Boolean(settings.queueUrl) },
    );
    res.json({ success: true, settings });
  } catch (error) {
    console.error("Public queue address save failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to save the queue address." });
  }
});

adminWorkspaceRouter.post("/queue/customer-tags", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const contactNumbers = Array.isArray(req.body?.contactNumbers)
      ? [...new Set(req.body.contactNumbers.filter((value: unknown): value is string =>
        typeof value === "string" && /^09\d{9}$/.test(value)
      ))].slice(0, 500)
      : [];
    if (contactNumbers.length === 0) {
      res.json({ success: true, customers: [] });
      return;
    }
    const { data, error } = await access.supabase
      .from("customer_records")
      .select("contact_number, is_vip, customer_tag_assignments ( customer_tags ( name, color ) )")
      .in("contact_number", contactNumbers);
    if (error) throw error;
    res.json({
      success: true,
      customers: (data ?? []).map((customer) => ({
        contact_number: customer.contact_number,
        is_vip: customer.is_vip,
        tags: (customer.customer_tag_assignments ?? []).flatMap((assignment) => {
          const tag = Array.isArray(assignment.customer_tags)
            ? assignment.customer_tags[0]
            : assignment.customer_tags;
          return tag ? [{ name: tag.name, color: tag.color }] : [];
        }),
      })),
    });
  } catch (error) {
    console.error("Queue customer tags load failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to load queue customer tags." });
  }
});

adminWorkspaceRouter.get("/audit-logs", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const { data: auditLogs, error: auditError } = await access.supabase
      .from("audit_logs")
      .select("id, actor_id, action, entity_type, entity_id, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (auditError) throw auditError;

    const logs = (auditLogs ?? []).map((log) => ({
      id: log.id,
      actor_id: log.actor_id,
      action: log.action,
      entity_type: log.entity_type,
      entity_id: log.entity_id,
      metadata: log.metadata,
      summary: typeof log.metadata?.summary === "string" ? log.metadata.summary : log.action,
      created_at: log.created_at,
    }));
    const actorIds = [...new Set(logs.map((log) => log.actor_id))];
    const { data: profiles, error: profilesError } = actorIds.length
      ? await access.supabase.from("profiles").select("id, full_name, username, account_role, staff_role").in("id", actorIds)
      : { data: null, error: null };
    if (profilesError) throw profilesError;
    const actorProfiles = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    res.json({
      success: true,
      logs: logs.map((log) => {
        const actor = actorProfiles.get(log.actor_id);
        return {
          ...log,
          actor_name: actor?.full_name || actor?.username || "Admin",
          actor_role: actor?.staff_role
            ? `${actor.account_role} (${actor.staff_role})`
            : actor?.account_role ?? "unknown",
          status: typeof log.metadata?.status === "string" ? log.metadata.status : "Success",
        };
      }),
    });
  } catch (error) {
    console.error("Admin audit log load failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to load audit logs." });
  }
});

adminWorkspaceRouter.get("/services", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const { data, error } = await access.supabase
      .from("services")
      .select("id, category, name, description, price, price_type, duration_minutes, is_visible, is_available, display_order")
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw error;
    res.json({ success: true, services: data ?? [] });
  } catch (error) {
    console.error("Admin service catalog load failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to load services." });
  }
});

adminWorkspaceRouter.post("/services", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const name = stringField(req.body?.name, 100);
    const category = stringField(req.body?.category, 80) || null;
    const price = optionalNumericField(req.body?.price);
    const duration = optionalIntegerField(req.body?.durationMinutes);
    if (!name || price === undefined || price === null || price < 0
      || duration === undefined || duration === null || duration < 1
      || (req.body?.priceType !== undefined && !["fixed", "starting"].includes(req.body.priceType))) {
      res.status(400).json({ success: false, message: "Enter a service name, valid price, and duration of at least one minute." });
      return;
    }

    const { data, error } = await access.supabase
      .from("services")
      .insert({
        name,
        category,
        price,
        price_type: req.body?.priceType === "starting" ? "starting" : "fixed",
        duration_minutes: duration,
        is_visible: true,
        is_available: true,
      })
      .select("id, category, name, description, price, price_type, duration_minutes, is_visible, is_available, display_order")
      .single();
    if (error) throw error;
    await writeAuditLog(access.supabase, access.user.id, "service.created", "service", data.id, `Added service ${data.name}.`, { price, durationMinutes: duration });
    res.status(201).json({ success: true, service: data });
  } catch (error) {
    console.error("Admin service create failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to create service." });
  }
});

adminWorkspaceRouter.patch("/services/:serviceId", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const { serviceId } = req.params;
    if (!UUID_PATTERN.test(serviceId)) {
      res.status(400).json({ success: false, message: "Choose a valid service." });
      return;
    }
    const update: Record<string, unknown> = {};
    if (req.body?.name !== undefined) {
      const name = stringField(req.body.name, 100);
      if (!name) {
        res.status(400).json({ success: false, message: "Service name cannot be empty." });
        return;
      }
      update.name = name;
    }
    if (req.body?.category !== undefined) update.category = stringField(req.body.category, 80) || null;
    if (req.body?.price !== undefined) {
      const price = optionalNumericField(req.body.price);
      if (price === undefined || price === null || price < 0) {
        res.status(400).json({ success: false, message: "Enter a valid non-negative service price." });
        return;
      }
      update.price = price;
    }
    if (req.body?.priceType !== undefined) {
      if (!["fixed", "starting"].includes(req.body.priceType)) {
        res.status(400).json({ success: false, message: "Choose a valid service price type." });
        return;
      }
      update.price_type = req.body.priceType;
    }
    if (req.body?.durationMinutes !== undefined) {
      const duration = optionalIntegerField(req.body.durationMinutes);
      if (duration === undefined || duration === null || duration < 1) {
        res.status(400).json({ success: false, message: "Service duration must be at least one minute." });
        return;
      }
      update.duration_minutes = duration;
    }
    for (const field of ["isVisible", "isAvailable"] as const) {
      if (req.body?.[field] !== undefined) {
        if (typeof req.body[field] !== "boolean") {
          res.status(400).json({ success: false, message: "Service visibility and availability must be true or false." });
          return;
        }
        update[field === "isVisible" ? "is_visible" : "is_available"] = req.body[field];
      }
    }
    if (Object.keys(update).length === 0) {
      res.status(400).json({ success: false, message: "Provide at least one service field to update." });
      return;
    }

    const { data, error } = await access.supabase
      .from("services")
      .update(update)
      .eq("id", serviceId)
      .select("id, category, name, description, price, price_type, duration_minutes, is_visible, is_available, display_order")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      res.status(404).json({ success: false, message: "Service not found." });
      return;
    }
    await writeAuditLog(access.supabase, access.user.id, "service.updated", "service", data.id, `Updated service ${data.name}.`, update);
    res.json({ success: true, service: data });
  } catch (error) {
    console.error("Admin service update failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to update service." });
  }
});

adminWorkspaceRouter.get("/stations", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const { data, error } = await access.supabase
      .from("stations")
      .select("id, label, category, home_staff_id, is_active, is_out_of_service, out_of_service_reason")
      .order("category", { ascending: true })
      .order("label", { ascending: true });
    if (error) throw error;
    const staffIds = [...new Set((data ?? [])
      .map((station) => station.home_staff_id)
      .filter((id): id is string => Boolean(id)))];
    const { data: profiles, error: profilesError } = staffIds.length
      ? await access.supabase.from("profiles").select("id, full_name").in("id", staffIds)
      : { data: [], error: null };
    if (profilesError) throw profilesError;
    const namesById = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));
    res.json({
      success: true,
      stations: (data ?? []).map((station) => ({
        ...station,
        home_staff_name: station.home_staff_id ? namesById.get(station.home_staff_id) ?? null : null,
      })),
    });
  } catch (error) {
    console.error("Admin stations load failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to load stations." });
  }
});

adminWorkspaceRouter.post("/stations", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const label = stringField(req.body?.label, 80);
    const category = stringField(req.body?.category, 80);
    const homeStaffId = req.body?.homeStaffId === null || req.body?.homeStaffId === ""
      ? null
      : typeof req.body?.homeStaffId === "string" ? req.body.homeStaffId : undefined;
    if (!label || !category || homeStaffId === undefined || (homeStaffId && !UUID_PATTERN.test(homeStaffId))) {
      res.status(400).json({ success: false, message: "Enter a station label, category, and valid staff assignment." });
      return;
    }

    const { data, error } = await access.supabase
      .from("stations")
      .insert({ label, category, home_staff_id: homeStaffId, is_active: true })
      .select("id, label, category, home_staff_id, is_active, is_out_of_service, out_of_service_reason")
      .single();
    if (error) throw error;
    await writeAuditLog(access.supabase, access.user.id, "station.created", "station", data.id, `Added station ${label}.`);
    res.status(201).json({ success: true, station: data });
  } catch (error) {
    console.error("Admin station create failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to create station." });
  }
});

adminWorkspaceRouter.patch("/stations/:stationId/out-of-service", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const { stationId } = req.params;
    const outOfService = req.body?.isOutOfService;
    const reason = stringField(req.body?.reason, 500);
    if (!UUID_PATTERN.test(stationId) || typeof outOfService !== "boolean" || (outOfService && !reason)) {
      res.status(400).json({ success: false, message: "Choose a station and provide a reason when taking it out of service." });
      return;
    }

    const { data: current, error: currentError } = await access.supabase
      .from("stations")
      .select("id, label, is_active, is_out_of_service, was_active_before_out_of_service")
      .eq("id", stationId)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current) {
      res.status(404).json({ success: false, message: "Station not found." });
      return;
    }

    const update = outOfService
      ? {
          is_active: false,
          is_out_of_service: true,
          out_of_service_reason: reason,
          was_active_before_out_of_service: current.is_out_of_service ? current.was_active_before_out_of_service : current.is_active,
        }
      : {
          is_active: current.is_out_of_service ? current.was_active_before_out_of_service : current.is_active,
          is_out_of_service: false,
          out_of_service_reason: null,
        };
    const { data, error } = await access.supabase
      .from("stations")
      .update(update)
      .eq("id", stationId)
      .select("id, label, category, home_staff_id, is_active, is_out_of_service, out_of_service_reason")
      .single();
    if (error) throw error;
    await writeAuditLog(
      access.supabase,
      access.user.id,
      outOfService ? "station.out_of_service" : "station.restored",
      "station",
      stationId,
      outOfService ? `Took station ${current.label} out of service.` : `Restored station ${current.label}.`,
      { reason: outOfService ? reason : null },
    );
    res.json({ success: true, station: data });
  } catch (error) {
    console.error("Admin station status update failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to update station status." });
  }
});

adminWorkspaceRouter.patch("/stations/:stationId", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const { stationId } = req.params;
    if (!UUID_PATTERN.test(stationId)) {
      res.status(400).json({ success: false, message: "Choose a valid station." });
      return;
    }
    const update: Record<string, unknown> = {};
    for (const field of ["label", "category"] as const) {
      if (req.body?.[field] !== undefined) {
        const value = stringField(req.body[field], 80);
        if (!value) {
          res.status(400).json({ success: false, message: `Station ${field} cannot be empty.` });
          return;
        }
        update[field] = value;
      }
    }
    if (req.body?.homeStaffId !== undefined) {
      const homeStaffId = req.body.homeStaffId === null || req.body.homeStaffId === ""
        ? null
        : typeof req.body.homeStaffId === "string" ? req.body.homeStaffId : undefined;
      if (homeStaffId === undefined || (homeStaffId && !UUID_PATTERN.test(homeStaffId))) {
        res.status(400).json({ success: false, message: "Choose a valid staff assignment." });
        return;
      }
      update.home_staff_id = homeStaffId;
    }
    if (req.body?.isActive !== undefined) {
      if (typeof req.body.isActive !== "boolean") {
        res.status(400).json({ success: false, message: "Station status must be true or false." });
        return;
      }
      update.is_active = req.body.isActive;
    }
    if (Object.keys(update).length === 0) {
      res.status(400).json({ success: false, message: "Provide at least one station field to update." });
      return;
    }

    const { data, error } = await access.supabase
      .from("stations")
      .update(update)
      .eq("id", stationId)
      .select("id, label, category, home_staff_id, is_active, is_out_of_service, out_of_service_reason")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      res.status(404).json({ success: false, message: "Station not found." });
      return;
    }
    await writeAuditLog(access.supabase, access.user.id, "station.updated", "station", data.id, `Updated station ${data.label}.`, update);
    res.json({ success: true, station: data });
  } catch (error) {
    console.error("Admin station update failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to update station." });
  }
});

adminWorkspaceRouter.get("/forecast-events", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const { data, error } = await access.supabase
      .from("forecast_events")
      .select("id, event_date, title, event_type, demand_multiplier, notes, created_at")
      .order("event_date", { ascending: true })
      .limit(500);
    if (error) throw error;
    res.json({ success: true, events: data ?? [] });
  } catch (error) {
    console.error("Forecast events load failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to load forecast events." });
  }
});

adminWorkspaceRouter.post("/forecast-events", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const eventDate = typeof req.body?.eventDate === "string" ? req.body.eventDate : "";
    const title = stringField(req.body?.title, 100);
    const eventType = ["holiday", "promotion", "custom"].find((type) => type === req.body?.eventType);
    const multiplier = optionalNumericField(req.body?.demandMultiplier);
    const notes = stringField(req.body?.notes, 500) || null;
    const parsedEventDate = /^\d{4}-\d{2}-\d{2}$/.test(eventDate)
      ? new Date(`${eventDate}T00:00:00Z`)
      : null;
    if (!parsedEventDate || Number.isNaN(parsedEventDate.getTime())
      || parsedEventDate.toISOString().slice(0, 10) !== eventDate
      || !title || !eventType
      || multiplier === undefined || multiplier === null || multiplier < 0.1 || multiplier > 5) {
      res.status(400).json({ success: false, message: "Enter a date, event name, event type, and forecast multiplier from 0.1 to 5." });
      return;
    }

    const { data, error } = await access.supabase
      .from("forecast_events")
      .insert({
        event_date: eventDate,
        title,
        event_type: eventType,
        demand_multiplier: multiplier,
        notes,
        created_by: access.user.id,
      })
      .select("id, event_date, title, event_type, demand_multiplier, notes, created_at")
      .single();
    if (error) throw error;
    await writeAuditLog(access.supabase, access.user.id, "forecast_event.created", "forecast_event", data.id, `Added forecast event ${title}.`, { eventDate, eventType, demandMultiplier: multiplier });
    res.status(201).json({ success: true, event: data });
  } catch (error) {
    console.error("Forecast event create failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to create forecast event." });
  }
});

adminWorkspaceRouter.delete("/forecast-events/:eventId", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const { eventId } = req.params;
    if (!UUID_PATTERN.test(eventId)) {
      res.status(400).json({ success: false, message: "Choose a valid forecast event." });
      return;
    }
    const { data, error } = await access.supabase
      .from("forecast_events")
      .delete()
      .eq("id", eventId)
      .select("id, title")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      res.status(404).json({ success: false, message: "Forecast event not found." });
      return;
    }
    await writeAuditLog(access.supabase, access.user.id, "forecast_event.deleted", "forecast_event", eventId, `Deleted forecast event ${data.title}.`);
    res.json({ success: true });
  } catch (error) {
    console.error("Forecast event delete failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to delete forecast event." });
  }
});

adminWorkspaceRouter.post("/queue/rebalance", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const serviceItemId = req.body?.serviceItemId;
    const staffId = req.body?.staffId;
    if (typeof serviceItemId !== "string" || !UUID_PATTERN.test(serviceItemId)
      || typeof staffId !== "string" || !UUID_PATTERN.test(staffId)) {
      res.status(400).json({ success: false, message: "Choose a valid waiting service and staff member." });
      return;
    }

    const { data: item, error: itemError } = await access.supabase
      .from("queue_entry_services")
      .select("id, queue_entry_id, assigned_staff_id, status, services ( category ), queue_entries ( status, assigned_staff_id )")
      .eq("id", serviceItemId)
      .maybeSingle();
    if (itemError) throw itemError;
    const entry = Array.isArray(item?.queue_entries) ? item.queue_entries[0] : item?.queue_entries;
    const service = Array.isArray(item?.services) ? item.services[0] : item?.services;
    if (!item || item.status !== "pending" || entry?.status !== "waiting") {
      res.status(409).json({ success: false, message: "Only a waiting service can be offered for rebalance." });
      return;
    }

    const { data: target, error: targetError } = await access.supabase
      .from("profiles")
      .select("id, full_name, staff_role, account_role, is_active")
      .eq("id", staffId)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target?.is_active || target.account_role !== "staff" || target.staff_role === "receptionist"
      || !staffCanPerformCategory(target.staff_role, service?.category)) {
      res.status(400).json({ success: false, message: "Select an active staff member who can perform this service." });
      return;
    }

    const { data: availability, error: availabilityError } = await access.supabase
      .from("staff_availability")
      .select("status")
      .eq("staff_id", staffId)
      .maybeSingle();
    if (availabilityError) {
      if (isMissingTable(availabilityError, "staff_availability")) {
        res.status(503).json({ success: false, message: "Apply the staff availability migration before creating workload requests." });
        return;
      }
      throw availabilityError;
    }
    if (availability?.status === "on_break") {
      res.status(409).json({ success: false, message: "Choose a staff member who is available." });
      return;
    }
    const fromStaffId = item.assigned_staff_id ?? entry.assigned_staff_id ?? null;
    if (fromStaffId === staffId) {
      res.status(400).json({ success: false, message: "This staff member is already assigned to the service." });
      return;
    }

    const { data: request, error: requestError } = await access.supabase
      .from("staff_rebalance_requests")
      .insert({
        service_item_id: item.id,
        queue_entry_id: item.queue_entry_id,
        from_staff_id: fromStaffId,
        to_staff_id: staffId,
        requested_by: access.user.id,
      })
      .select("id")
      .single();
    if (requestError) {
      if (requestError.code === "23505") {
        res.status(409).json({ success: false, message: "A workload request is already pending for this service." });
        return;
      }
      if (isMissingTable(requestError, "staff_rebalance_requests")) {
        res.status(503).json({ success: false, message: "Apply migration 20261102100000_queue_admin_staff_workflows.sql before creating workload requests." });
        return;
      }
      throw requestError;
    }

    await writeAuditLog(
      access.supabase,
      access.user.id,
      "queue.rebalance_requested",
      "staff_rebalance_request",
      request.id,
      `Requested a workload rebalance to ${target.full_name}.`,
      { entryId: item.queue_entry_id, serviceItemId: item.id, fromStaffId, toStaffId: staffId },
    );
    res.status(201).json({ success: true, requestId: request.id });
  } catch (error) {
    console.error("Queue workload request failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to request a workload rebalance." });
  }
});

adminWorkspaceRouter.patch("/queue/:entryId/status", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const { entryId } = req.params;
    const status = req.body?.status;
    if (!UUID_PATTERN.test(entryId) || !["cancelled", "no_show"].includes(status)) {
      res.status(400).json({ success: false, message: "Choose a valid queue visit and status." });
      return;
    }

    const functionName = status === "cancelled"
      ? "cancel_waiting_queue_entry"
      : "mark_waiting_queue_entry_no_show";
    const { error } = await access.supabase.rpc(functionName, { p_entry_id: entryId });
    if (error) {
      console.error(`Admin queue ${status} failed:`, error);
      if (respondToQueueMutationError(res, error, status === "cancelled" ? "cancelled" : "marked as a no-show")) return;
      throw error;
    }

    await writeAuditLog(
      access.supabase,
      access.user.id,
      `queue.${status}`,
      "queue_entry",
      entryId,
      `Marked queue visit ${entryId} as ${status}.`,
    );
    res.json({ success: true });
  } catch (error) {
    console.error("Admin queue status update failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to update queue status." });
  }
});

adminWorkspaceRouter.patch("/queue/:entryId/assignment", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const { entryId } = req.params;
    const staffId: unknown = req.body?.staffId;
    if (!UUID_PATTERN.test(entryId) || (staffId !== null && (typeof staffId !== "string" || !UUID_PATTERN.test(staffId)))) {
      res.status(400).json({ success: false, message: "Choose a valid queue visit and staff member." });
      return;
    }

    if (typeof staffId === "string") {
      const { data: staff, error: staffError } = await access.supabase
        .from("profiles")
        .select("id, account_role, staff_role, is_active")
        .eq("id", staffId)
        .maybeSingle();
      if (staffError) throw staffError;
      const eligibleAccount = staff?.account_role === "staff"
        || (staff?.account_role === "admin" && staff.staff_role === "hairstylist");
      if (!staff || !staff.is_active || !eligibleAccount || staff.staff_role === "receptionist") {
        res.status(400).json({ success: false, message: "Select an active service staff member." });
        return;
      }
    }

    const { data: updated, error } = await access.supabase
      .from("queue_entries")
      .update({ assigned_staff_id: staffId })
      .eq("id", entryId)
      .eq("status", "waiting")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!updated) {
      res.status(409).json({ success: false, message: "Only a visit that is still waiting can be assigned." });
      return;
    }

    await writeAuditLog(
      access.supabase,
      access.user.id,
      "queue.staff_assigned",
      "queue_entry",
      entryId,
      `${staffId ? "Assigned staff" : "Cleared staff assignment"} for queue visit ${entryId}.`,
      { staffId },
    );
    res.json({ success: true });
  } catch (error) {
    console.error("Admin queue assignment failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to assign staff." });
  }
});

adminWorkspaceRouter.patch("/queue/:entryId/position", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const { entryId } = req.params;
    const position = req.body?.position;
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (!UUID_PATTERN.test(entryId) || !Number.isInteger(position) || position < 1 || !reason || reason.length > 240) {
      res.status(400).json({ success: false, message: "Choose a valid queue visit and position, and provide a reason of 1 to 240 characters." });
      return;
    }

    const { data: before, error: beforeError } = await access.supabase
      .from("queue_entries")
      .select("id, position")
      .eq("status", "waiting")
      .order("position", { ascending: true, nullsFirst: false });
    if (beforeError) throw beforeError;

    const { error } = await access.supabase.rpc("reorder_waiting_queue_entry", {
      p_entry_id: entryId,
      p_new_position: position,
    });
    if (error) {
      console.error("Admin queue reorder failed:", error);
      if (respondToQueueMutationError(res, error, "reordered")) return;
      throw error;
    }

    const { data: after, error: afterError } = await access.supabase
      .from("queue_entries")
      .select("id, ticket_number, customer_name, contact_number, position")
      .eq("status", "waiting")
      .order("position", { ascending: true, nullsFirst: false });
    if (afterError) throw afterError;
    const beforePositions = new Map((before ?? []).map((entry) => [entry.id, entry.position]));
    const affectedEntries = (after ?? []).filter((entry) =>
      beforePositions.has(entry.id) && beforePositions.get(entry.id) !== entry.position
    );
    await writeAuditLog(
      access.supabase,
      access.user.id,
      "queue.reordered",
      "queue_entry",
      entryId,
      `Reordered queue visit ${entryId} to position ${position}. Reason: ${reason}`,
      {
        position,
        reason,
        affectedEntries: affectedEntries.map((entry) => ({ id: entry.id, position: entry.position })),
      },
    );
    const eventKey = randomUUID();
    for (const entry of affectedEntries) {
      if (!entry.contact_number) continue;
      await enqueueQueueSmsOnce({
        entryId: entry.id,
        phone: entry.contact_number,
        customerName: entry.customer_name,
        milestone: "admin_reordered",
        eventKey,
        extra: `Your ticket Q-${String(entry.ticket_number).padStart(3, "0")} is now at queue position ${entry.position}.`,
      });
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Admin queue reorder failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to reorder the queue." });
  }
});

adminWorkspaceRouter.get("/service-history", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const { data: entries, error } = await access.supabase
      .from("queue_entries")
      .select("id, ticket_number, customer_name, contact_number, status, created_at, queue_entry_services ( id, status, service_stage, staff_update, staff_updated_at, started_at, service_started_at, completed_at, services ( name ) )")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw error;
    res.json({
      success: true,
      sessions: (entries ?? []).map((entry) => ({
        id: entry.id,
        ticket_number: entry.ticket_number,
        customer_name: entry.customer_name,
        contact_number: entry.contact_number,
        status: entry.status,
        created_at: entry.created_at,
        services: (entry.queue_entry_services ?? []).map((item) => {
          const service = Array.isArray(item.services) ? item.services[0] : item.services;
          return {
            id: item.id,
            name: service?.name ?? "Service",
            status: item.status,
            service_stage: item.service_stage,
            staff_update: item.staff_update,
            staff_updated_at: item.staff_updated_at,
            started_at: item.service_started_at ?? item.started_at,
            completed_at: item.completed_at,
          };
        }),
      })),
    });
  } catch (error) {
    console.error("Service history load failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to load service history." });
  }
});

adminWorkspaceRouter.get("/customers", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const search = stringField(req.query.search, 100);
    let query = access.supabase
      .from("customer_records")
      .select("id, contact_number, display_name, is_vip, updated_at, customer_tag_assignments ( tag_id, customer_tags ( id, name, color ) )")
      .order("display_name", { ascending: true })
      .limit(500);
    if (search) query = query.or(`display_name.ilike.%${search}%,contact_number.ilike.%${search}%`);
    const [{ data: customers, error }, { data: tags, error: tagsError }] = await Promise.all([
      query,
      access.supabase.from("customer_tags").select("id, name, color").order("name"),
    ]);
    if (error) throw error;
    if (tagsError) throw tagsError;
    res.json({ success: true, customers, tags });
  } catch (error) {
    console.error("Customer tags load failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to load customers." });
  }
});

adminWorkspaceRouter.post("/customers", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const displayName = stringField(req.body?.displayName, 100);
    const contactNumber = stringField(req.body?.contactNumber, 16);
    if (!displayName || !/^09\d{9}$/.test(contactNumber)) {
      res.status(400).json({ success: false, message: "Enter a customer name and valid Philippine mobile number." });
      return;
    }
    const { data, error } = await access.supabase
      .from("customer_records")
      .insert({ display_name: displayName, contact_number: contactNumber, is_vip: req.body?.isVip === true })
      .select("id, contact_number, display_name, is_vip, updated_at")
      .single();
    if (error?.code === "23505") {
      res.status(409).json({ success: false, message: "A customer with this mobile number already exists." });
      return;
    }
    if (error) throw error;
    await writeAuditLog(access.supabase, access.user.id, "customer.created", "customer", data.id, `Added customer ${data.display_name}.`);
    res.status(201).json({ success: true, customer: data });
  } catch (error) {
    console.error("Customer create failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to add customer." });
  }
});

adminWorkspaceRouter.post("/customers/:customerId/vip", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    if (typeof req.body?.isVip !== "boolean") {
      res.status(400).json({ success: false, message: "Choose whether this customer is VIP." });
      return;
    }
    const { data, error } = await access.supabase
      .from("customer_records")
      .update({ is_vip: req.body.isVip, updated_at: new Date().toISOString() })
      .eq("id", req.params.customerId)
      .select("id, is_vip")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      res.status(404).json({ success: false, message: "Customer not found." });
      return;
    }
    await writeAuditLog(access.supabase, access.user.id, "customer.vip_updated", "customer", data.id, `Updated VIP status for customer ${data.id}.`, { isVip: data.is_vip });
    res.json({ success: true, customer: data });
  } catch (error) {
    console.error("Customer VIP update failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to update VIP status." });
  }
});

adminWorkspaceRouter.post("/tags", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const name = stringField(req.body?.name, 50);
    const color = stringField(req.body?.color, 16) || "sage";
    if (!name || !["sage", "clay", "gold", "info"].includes(color)) {
      res.status(400).json({ success: false, message: "Enter a tag name and choose an available color." });
      return;
    }
    const { data, error } = await access.supabase
      .from("customer_tags")
      .insert({ name, color })
      .select("id, name, color")
      .single();
    if (error?.code === "23505") {
      res.status(409).json({ success: false, message: "A tag with that name already exists." });
      return;
    }
    if (error) throw error;
    await writeAuditLog(access.supabase, access.user.id, "customer_tag.created", "customer_tag", data.id, `Created customer tag ${data.name}.`);
    res.status(201).json({ success: true, tag: data });
  } catch (error) {
    console.error("Customer tag create failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to create tag." });
  }
});

adminWorkspaceRouter.post("/customers/:customerId/tags/:tagId", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const { error } = await access.supabase.from("customer_tag_assignments").upsert({
      customer_id: req.params.customerId,
      tag_id: req.params.tagId,
    });
    if (error) throw error;
    await writeAuditLog(access.supabase, access.user.id, "customer_tag.assigned", "customer_tag_assignment", null, `Assigned tag ${req.params.tagId} to customer ${req.params.customerId}.`, { customerId: req.params.customerId, tagId: req.params.tagId });
    res.json({ success: true });
  } catch (error) {
    console.error("Customer tag assignment failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to assign tag." });
  }
});

adminWorkspaceRouter.delete("/customers/:customerId/tags/:tagId", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const { error } = await access.supabase
      .from("customer_tag_assignments")
      .delete()
      .eq("customer_id", req.params.customerId)
      .eq("tag_id", req.params.tagId);
    if (error) throw error;
    await writeAuditLog(access.supabase, access.user.id, "customer_tag.removed", "customer_tag_assignment", null, `Removed tag ${req.params.tagId} from customer ${req.params.customerId}.`, { customerId: req.params.customerId, tagId: req.params.tagId });
    res.json({ success: true });
  } catch (error) {
    console.error("Customer tag removal failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to remove tag." });
  }
});

adminWorkspaceRouter.delete("/tags/:tagId", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const { error } = await access.supabase.from("customer_tags").delete().eq("id", req.params.tagId);
    if (error) throw error;
    await writeAuditLog(access.supabase, access.user.id, "customer_tag.deleted", "customer_tag", req.params.tagId, `Deleted customer tag ${req.params.tagId}.`);
    res.json({ success: true });
  } catch (error) {
    console.error("Customer tag delete failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to delete tag." });
  }
});

adminWorkspaceRouter.get("/packages", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const { data, error } = await access.supabase
      .from("service_packages")
      .select("id, title, description, package_type, price, sessions_count, is_active, image_data_url, service_package_items ( service_id, quantity, services ( id, name ) )")
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ success: true, packages: data ?? [] });
  } catch (error) {
    console.error("Service packages load failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to load service packages." });
  }
});

adminWorkspaceRouter.post("/packages", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const title = stringField(req.body?.title, 100);
    const description = stringField(req.body?.description, 500);
    const price = Number(req.body?.price);
    const serviceIds = Array.isArray(req.body?.serviceIds)
      ? [...new Set(req.body.serviceIds.filter((id: unknown): id is string => typeof id === "string"))]
      : [];
    const imageDataUrl = validateBannerImage(req.body?.imageDataUrl);
    if (!title || !Number.isFinite(price) || price <= 0 || serviceIds.length === 0 || serviceIds.length > 20
      || imageDataUrl === undefined) {
      res.status(400).json({ success: false, message: "Enter a package name, price, one or more services, and a valid banner image." });
      return;
    }
    const { data: services, error: servicesError } = await access.supabase
      .from("services")
      .select("id")
      .in("id", serviceIds)
      .eq("is_visible", true)
      .eq("is_available", true);
    if (servicesError) throw servicesError;
    if ((services ?? []).length !== serviceIds.length) {
      res.status(400).json({ success: false, message: "One or more selected services are unavailable. Refresh and select available services." });
      return;
    }

    const { data: packageItem, error: packageError } = await access.supabase
      .from("service_packages")
      .insert({
        title,
        description: description || null,
        package_type: "service_bundle",
        price,
        sessions_count: 0,
        image_data_url: imageDataUrl ?? null,
      })
      .select("id, title, description, package_type, price, sessions_count, is_active, image_data_url")
      .single();
    if (packageError) throw packageError;

    const { error: itemError } = await access.supabase
      .from("service_package_items")
      .insert(serviceIds.map((serviceId) => ({ package_id: packageItem.id, service_id: serviceId, quantity: 1 })));
    if (itemError) {
      const { error: cleanupError } = await access.supabase.from("service_packages").delete().eq("id", packageItem.id);
      if (cleanupError) {
        throw new Error(`Unable to save package services (${itemError.message}) or remove the incomplete package (${cleanupError.message}).`);
      }
      throw itemError;
    }

    await writeAuditLog(access.supabase, access.user.id, "service_package.created", "service_package", packageItem.id, `Created service package ${packageItem.title}.`, { price, services: serviceIds.length, hasBanner: Boolean(imageDataUrl) });
    res.status(201).json({ success: true, package: packageItem });
  } catch (error) {
    console.error("Service package create failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to create the service package." });
  }
});

adminWorkspaceRouter.patch("/packages/:packageId", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    if (typeof req.body?.isActive !== "boolean") {
      res.status(400).json({ success: false, message: "A package active status is required." });
      return;
    }
    const { data, error } = await access.supabase
      .from("service_packages")
      .update({ is_active: req.body.isActive })
      .eq("id", req.params.packageId)
      .select("id, title, is_active")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      res.status(404).json({ success: false, message: "Service package not found." });
      return;
    }
    await writeAuditLog(access.supabase, access.user.id, "service_package.status_updated", "service_package", data.id, `${data.is_active ? "Activated" : "Deactivated"} service package ${data.title}.`, { isActive: data.is_active });
    res.json({ success: true, package: data });
  } catch (error) {
    console.error("Service package update failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to update the service package." });
  }
});

adminWorkspaceRouter.get("/promotions", async (req, res) => {
  try {
    const access = await requirePosAccess(req, res);
    if (!access) return;
    let query = access.supabase
      .from("promotions")
      .select("id, title:name, description, discount_type, discount_value, starts_at:start_date, ends_at:end_date, is_active, image_data_url, eligible_service_ids, minimum_spend, maximum_discount, usage_limit, redemption_count, one_per_customer, exclude_packages")
      .order("start_date", { ascending: false });
    if (access.accountRole !== "admin") query = query.eq("is_active", true);
    const { data, error } = await query;
    if (error) throw error;
    res.json({
      success: true,
      promotions: data.map((promotion) => ({
        ...promotion,
        discount_type: fromDatabasePromotionDiscountType(promotion.discount_type),
      })),
    });
  } catch (error) {
    console.error("Promotions load failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to load promotions." });
  }
});

adminWorkspaceRouter.post("/promotions", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const title = stringField(req.body?.title, 100);
    const description = stringField(req.body?.description, 500);
    const discountType = req.body?.discountType;
    const discountValue = Number(req.body?.discountValue);
    const imageDataUrl = validateBannerImage(req.body?.imageDataUrl);
    const eligibleServiceIds = parsePromotionServiceIds(req.body);
    const minimumSpend = optionalNumericField(req.body?.minimumSpend);
    const maximumDiscount = optionalNumericField(req.body?.maximumDiscount);
    const usageLimit = optionalIntegerField(req.body?.usageLimit);
    const startsAt = typeof req.body?.startsAt === "string" ? new Date(req.body.startsAt) : null;
    const endsAt = typeof req.body?.endsAt === "string" ? new Date(req.body.endsAt) : null;
    if (!title || !["percent", "fixed"].includes(discountType)
      || !Number.isFinite(discountValue) || discountValue <= 0
      || (discountType === "percent" && discountValue > 100)
      || !startsAt || Number.isNaN(startsAt.getTime())
      || !endsAt || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt
      || eligibleServiceIds === undefined
      || (req.body?.limitToServices === true && eligibleServiceIds.length === 0)
      || minimumSpend === undefined || (minimumSpend !== null && minimumSpend < 0)
      || maximumDiscount === undefined || (maximumDiscount !== null && maximumDiscount <= 0)
      || usageLimit === undefined || (usageLimit !== null && usageLimit <= 0)
      || typeof req.body?.onePerCustomer !== "boolean"
      || typeof req.body?.excludePackages !== "boolean"
      || imageDataUrl === undefined) {
      res.status(400).json({ success: false, message: "Enter valid promotion details and rule values." });
      return;
    }
    if (!await promotionServicesAreAvailable(access.supabase, eligibleServiceIds)) {
      res.status(400).json({ success: false, message: "One or more selected services are unavailable. Refresh and select available services." });
      return;
    }
    const { data, error } = await access.supabase
      .from("promotions")
      .insert({
        name: title,
        description: description || null,
        discount_type: toDatabasePromotionDiscountType(discountType),
        discount_value: discountValue,
        start_date: startsAt.toISOString(),
        end_date: endsAt.toISOString(),
        image_data_url: imageDataUrl,
        eligible_service_ids: eligibleServiceIds,
        minimum_spend: minimumSpend,
        maximum_discount: maximumDiscount,
        usage_limit: usageLimit,
        one_per_customer: req.body.onePerCustomer,
        exclude_packages: req.body.excludePackages,
      })
      .select("id, title:name, description, discount_type, discount_value, starts_at:start_date, ends_at:end_date, is_active, image_data_url, eligible_service_ids, minimum_spend, maximum_discount, usage_limit, redemption_count, one_per_customer, exclude_packages")
      .single();
    if (error) throw error;
    await writeAuditLog(access.supabase, access.user.id, "promotion.created", "promotion", data.id, `Created promotion ${data.title}.`, { discountType: data.discount_type, discountValue: data.discount_value, hasBanner: Boolean(imageDataUrl), hasServiceRestriction: eligibleServiceIds.length > 0, minimumSpend, maximumDiscount, usageLimit });
    res.status(201).json({
      success: true,
      promotion: { ...data, discount_type: fromDatabasePromotionDiscountType(data.discount_type) },
    });
  } catch (error) {
    console.error("Promotion create failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to create promotion." });
  }
});

adminWorkspaceRouter.patch("/promotions/:promotionId", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;

    const hasPromotionFields = ["title", "description", "discountType", "discountValue", "startsAt", "endsAt", "eligibleServiceIds", "limitToServices", "minimumSpend", "maximumDiscount", "usageLimit", "onePerCustomer", "excludePackages"]
      .some((field) => Object.hasOwn(req.body ?? {}, field));
    if (!hasPromotionFields && typeof req.body?.isActive !== "boolean") {
      res.status(400).json({ success: false, message: "Promotion details or active status are required." });
      return;
    }

    let update: Record<string, unknown>;
    let action: string;
    let summary: (promotion: { id: string; title: string; is_active: boolean }) => string;
    let metadata: Record<string, unknown>;

    if (!hasPromotionFields) {
      update = { is_active: req.body.isActive };
      action = "promotion.status_updated";
      summary = (promotion) => `${promotion.is_active ? "Activated" : "Deactivated"} promotion ${promotion.title}.`;
      metadata = { isActive: req.body.isActive };
    } else {
      const title = stringField(req.body?.title, 100);
      const description = stringField(req.body?.description, 500);
      const discountType = req.body?.discountType;
      const discountValue = Number(req.body?.discountValue);
      const startsAt = typeof req.body?.startsAt === "string" ? new Date(req.body.startsAt) : null;
      const endsAt = typeof req.body?.endsAt === "string" ? new Date(req.body.endsAt) : null;
      const imageDataUrl = validateBannerImage(req.body?.imageDataUrl);
      const eligibleServiceIds = parsePromotionServiceIds(req.body);
      const minimumSpend = optionalNumericField(req.body?.minimumSpend);
      const maximumDiscount = optionalNumericField(req.body?.maximumDiscount);
      const usageLimit = optionalIntegerField(req.body?.usageLimit);
      if (!title || !["percent", "fixed"].includes(discountType)
        || !Number.isFinite(discountValue) || discountValue <= 0
        || (discountType === "percent" && discountValue > 100)
        || !startsAt || Number.isNaN(startsAt.getTime())
        || !endsAt || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt
        || eligibleServiceIds === undefined
        || (req.body?.limitToServices === true && eligibleServiceIds.length === 0)
        || minimumSpend === undefined || (minimumSpend !== null && minimumSpend < 0)
        || maximumDiscount === undefined || (maximumDiscount !== null && maximumDiscount <= 0)
        || usageLimit === undefined || (usageLimit !== null && usageLimit <= 0)
        || typeof req.body?.onePerCustomer !== "boolean"
        || typeof req.body?.excludePackages !== "boolean"
        || imageDataUrl === undefined) {
        res.status(400).json({ success: false, message: "Enter valid promotion details and rule values." });
        return;
      }
      if (!await promotionServicesAreAvailable(access.supabase, eligibleServiceIds)) {
        res.status(400).json({ success: false, message: "One or more selected services are unavailable. Refresh and select available services." });
        return;
      }
      update = {
        name: title,
        description: description || null,
        discount_type: toDatabasePromotionDiscountType(discountType),
        discount_value: discountValue,
        start_date: startsAt.toISOString(),
        end_date: endsAt.toISOString(),
        eligible_service_ids: eligibleServiceIds,
        minimum_spend: minimumSpend,
        maximum_discount: maximumDiscount,
        usage_limit: usageLimit,
        one_per_customer: req.body.onePerCustomer,
        exclude_packages: req.body.excludePackages,
        ...(req.body?.imageDataUrl !== undefined ? { image_data_url: imageDataUrl } : {}),
      };
      action = "promotion.updated";
      summary = (promotion) => `Updated promotion ${promotion.title}.`;
      metadata = { discountType, discountValue, hasServiceRestriction: eligibleServiceIds.length > 0, minimumSpend, maximumDiscount, usageLimit };
    }

    const { data, error } = await access.supabase
      .from("promotions")
      .update(update)
      .eq("id", req.params.promotionId)
      .select("id, title:name, description, discount_type, discount_value, starts_at:start_date, ends_at:end_date, is_active, image_data_url, eligible_service_ids, minimum_spend, maximum_discount, usage_limit, redemption_count, one_per_customer, exclude_packages")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      res.status(404).json({ success: false, message: "Promotion not found." });
      return;
    }
    await writeAuditLog(access.supabase, access.user.id, action, "promotion", data.id, summary(data), metadata);
    res.json({
      success: true,
      promotion: { ...data, discount_type: fromDatabasePromotionDiscountType(data.discount_type) },
    });
  } catch (error) {
    console.error("Promotion update failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to update promotion." });
  }
});

adminWorkspaceRouter.get("/transactions", async (req, res) => {
  try {
    const access = await requirePosAccess(req, res);
    if (!access) return;
    const from = typeof req.query.from === "string" ? new Date(req.query.from) : null;
    const to = typeof req.query.to === "string" ? new Date(req.query.to) : null;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime())) || (from && to && to < from)) {
      res.status(400).json({ success: false, message: "Choose a valid transaction date range." });
      return;
    }
    let query = access.supabase
      .from("pos_transactions")
      .select("*, pos_transaction_items (*)")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (from) query = query.gte("created_at", from.toISOString());
    if (to) query = query.lte("created_at", to.toISOString());
    const { data, error } = await query;
    if (error) throw error;
    const transactionIds = (data ?? []).map((transaction) => transaction.id);
    const { data: adjustments, error: adjustmentsError } = transactionIds.length
      ? await access.supabase
        .from("pos_transaction_adjustments")
        .select("id, transaction_id, adjustment_type, amount, reason, status, requested_by, approved_by, created_at, reviewed_at")
        .in("transaction_id", transactionIds)
        .order("created_at", { ascending: false })
      : { data: [], error: null };
    const adjustmentsUnavailable = Boolean(
      adjustmentsError && isMissingTable(adjustmentsError, "pos_transaction_adjustments")
    );
    if (adjustmentsUnavailable) {
      console.warn("POS adjustments are unavailable; apply 20261027130000_add_pos_adjustments.sql.");
    } else if (adjustmentsError) {
      throw adjustmentsError;
    }
    const adjustmentsByTransaction = new Map<string, NonNullable<typeof adjustments>[number][]>();
    for (const adjustment of adjustments ?? []) {
      const current = adjustmentsByTransaction.get(adjustment.transaction_id) ?? [];
      current.push(adjustment);
      adjustmentsByTransaction.set(adjustment.transaction_id, current);
    }
    res.json({
      success: true,
      adjustmentsUnavailable,
      transactions: (data ?? []).map((transaction) => ({
        ...transaction,
        adjustments: adjustmentsByTransaction.get(transaction.id) ?? [],
      })),
    });
  } catch (error) {
    console.error("Transactions load failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to load transactions." });
  }
});

adminWorkspaceRouter.post("/transactions/:transactionId/adjustments", posAdjustmentPasswordRateLimit, async (req, res) => {
  try {
    const access = await requirePosAccess(req, res);
    if (!access) return;
    if (access.accountRole === "admin"
      && !await verifyAdjustmentPassword(access.user, req.body?.password, res)) return;
    const transactionId = typeof req.params.transactionId === "string" ? req.params.transactionId : "";
    const adjustmentType = req.body?.adjustmentType;
    const reason = stringField(req.body?.reason, 500);
    const amount = optionalNumericField(req.body?.amount);
    if (!UUID_PATTERN.test(transactionId)
      || !["refund", "void"].includes(adjustmentType)
      || !reason || amount === undefined || amount === null || amount <= 0) {
      res.status(400).json({ success: false, message: "Choose an adjustment type, positive amount, and reason." });
      return;
    }

    const [{ data: transaction, error: transactionError }, { data: priorAdjustments, error: priorError }] = await Promise.all([
      access.supabase.from("pos_transactions")
        .select("id, total_amount, status")
        .eq("id", transactionId)
        .maybeSingle(),
      access.supabase.from("pos_transaction_adjustments")
        .select("adjustment_type, amount, status")
        .eq("transaction_id", transactionId),
    ]);
    if (transactionError) throw transactionError;
    if (priorError) throw priorError;
    if (!transaction || transaction.status !== "paid") {
      res.status(404).json({ success: false, message: "Paid transaction not found." });
      return;
    }
    const total = Number(transaction.total_amount);
    const existing = priorAdjustments ?? [];
    if (amount > total
      || (adjustmentType === "void" && (amount !== total || existing.some((item) => item.status !== "rejected")))
      || (adjustmentType === "refund" && (
        existing.some((item) => item.adjustment_type === "void" && item.status !== "rejected")
        || existing.filter((item) => item.adjustment_type === "refund" && item.status !== "rejected")
          .reduce((sum, item) => sum + Number(item.amount), 0) + amount > total
      ))) {
      res.status(409).json({ success: false, message: "This adjustment exceeds the remaining refundable amount or conflicts with another adjustment." });
      return;
    }

    const { data, error } = await access.supabase
      .from("pos_transaction_adjustments")
      .insert({
        transaction_id: transactionId,
        adjustment_type: adjustmentType,
        amount,
        reason,
        requested_by: access.user.id,
      })
      .select("id, transaction_id, adjustment_type, amount, reason, status, requested_by, created_at")
      .single();
    if (error?.code === "23505") {
      res.status(409).json({ success: false, message: "Another adjustment is already pending for this transaction." });
      return;
    }
    if (error) throw error;
    await writeAuditLog(access.supabase, access.user.id, `pos.${adjustmentType}_requested`, "pos_transaction", transactionId, `Requested ${adjustmentType} for transaction ${transactionId}.`, { adjustmentId: data.id, amount, reason });
    res.status(201).json({ success: true, adjustment: data });
  } catch (error) {
    console.error("POS adjustment request failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to request transaction adjustment." });
  }
});

adminWorkspaceRouter.patch("/transaction-adjustments/:adjustmentId/approve", posAdjustmentPasswordRateLimit, async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ success: false, message: "Sign in to approve this adjustment." });
      return;
    }
    const supabase = getSupabaseAdmin();
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("account_role, staff_role, is_active")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.is_active || (profile.account_role !== "admin" && profile.staff_role !== "manager")) {
      res.status(403).json({ success: false, message: "An active manager or administrator must approve this adjustment." });
      return;
    }
    if (!await verifyAdjustmentPassword(user, req.body?.password, res)) return;
    const adjustmentId = typeof req.params.adjustmentId === "string" ? req.params.adjustmentId : "";
    if (!UUID_PATTERN.test(adjustmentId)) {
      res.status(400).json({ success: false, message: "Choose a valid adjustment." });
      return;
    }
    const { data: pending, error: pendingError } = await supabase
      .from("pos_transaction_adjustments")
      .select("id, transaction_id, adjustment_type, requested_by, status")
      .eq("id", adjustmentId)
      .maybeSingle();
    if (pendingError) throw pendingError;
    if (!pending || pending.status !== "pending") {
      res.status(409).json({ success: false, message: "This adjustment is no longer pending." });
      return;
    }
    if (pending.requested_by === user.id) {
      res.status(403).json({ success: false, message: "You cannot approve your own adjustment request." });
      return;
    }

    const { data, error } = await supabase
      .from("pos_transaction_adjustments")
      .update({ status: "approved", approved_by: user.id, reviewed_at: new Date().toISOString() })
      .eq("id", adjustmentId)
      .eq("status", "pending")
      .select("id, transaction_id, adjustment_type, amount, reason, status, requested_by, approved_by, created_at, reviewed_at")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      res.status(409).json({ success: false, message: "This adjustment was already reviewed." });
      return;
    }
    await writeAuditLog(supabase, user.id, `pos.${data.adjustment_type}_approved`, "pos_transaction", data.transaction_id, `Approved ${data.adjustment_type} for transaction ${data.transaction_id}.`, { adjustmentId: data.id, amount: data.amount });
    res.json({ success: true, adjustment: data });
  } catch (error) {
    console.error("POS adjustment approval failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to approve transaction adjustment." });
  }
});

adminWorkspaceRouter.patch("/transaction-adjustments/:adjustmentId/reject", posAdjustmentPasswordRateLimit, async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ success: false, message: "Sign in to reject this adjustment." });
      return;
    }
    const supabase = getSupabaseAdmin();
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("account_role, staff_role, is_active")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.is_active || (profile.account_role !== "admin" && profile.staff_role !== "manager")) {
      res.status(403).json({ success: false, message: "An active manager or administrator must review this adjustment." });
      return;
    }
    if (!await verifyAdjustmentPassword(user, req.body?.password, res)) return;
    const adjustmentId = typeof req.params.adjustmentId === "string" ? req.params.adjustmentId : "";
    if (!UUID_PATTERN.test(adjustmentId)) {
      res.status(400).json({ success: false, message: "Choose a valid adjustment." });
      return;
    }
    const { data: pending, error: pendingError } = await supabase
      .from("pos_transaction_adjustments")
      .select("id, transaction_id, adjustment_type, requested_by, status")
      .eq("id", adjustmentId)
      .maybeSingle();
    if (pendingError) throw pendingError;
    if (!pending || pending.status !== "pending") {
      res.status(409).json({ success: false, message: "This adjustment is no longer pending." });
      return;
    }
    if (pending.requested_by === user.id) {
      res.status(403).json({ success: false, message: "You cannot review your own adjustment request." });
      return;
    }
    const { data, error } = await supabase
      .from("pos_transaction_adjustments")
      .update({ status: "rejected", approved_by: user.id, reviewed_at: new Date().toISOString() })
      .eq("id", adjustmentId)
      .eq("status", "pending")
      .select("id, transaction_id, adjustment_type, amount, reason, status, requested_by, approved_by, created_at, reviewed_at")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      res.status(409).json({ success: false, message: "This adjustment was already reviewed." });
      return;
    }
    await writeAuditLog(supabase, user.id, `pos.${data.adjustment_type}_rejected`, "pos_transaction", data.transaction_id, `Rejected ${data.adjustment_type} for transaction ${data.transaction_id}.`, { adjustmentId: data.id, amount: data.amount });
    res.json({ success: true, adjustment: data });
  } catch (error) {
    console.error("POS adjustment rejection failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to reject transaction adjustment." });
  }
});

adminWorkspaceRouter.get("/checkout-candidates", async (req, res) => {
  try {
    const access = await requirePosAccess(req, res);
    if (!access) return;
    const [{ data: entries, error }, { data: transactions, error: transactionsError }] = await Promise.all([
      access.supabase
        .from("queue_entries")
        .select("id, ticket_number, customer_name, contact_number, promotion_id, service_packages ( title, price ), queue_entry_services ( id, service_id, status, price, services ( name ) )")
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(500),
      access.supabase.from("pos_transactions").select("queue_entry_id"),
    ]);
    if (error) throw error;
    if (transactionsError) throw transactionsError;
    const checkedOut = new Set((transactions ?? []).map((transaction) => transaction.queue_entry_id));
    const candidates = (entries ?? [])
      .filter((entry) =>
        !checkedOut.has(entry.id)
        && (entry.queue_entry_services ?? []).length > 0
        && entry.queue_entry_services.every((item) => item.status === "completed")
      )
      .map((entry) => {
        const packageInfo = normalizeServicePackage(entry.service_packages);
        return {
          id: entry.id,
          ticketNumber: entry.ticket_number,
          customerName: entry.customer_name,
          contactNumber: entry.contact_number,
          promotionId: entry.promotion_id,
          serviceIds: (entry.queue_entry_services ?? []).map((item) => item.service_id),
          isPackage: Boolean(packageInfo),
          services: packageInfo
          ? [{ name: packageInfo.title, price: packageInfo.price }]
          : (entry.queue_entry_services ?? []).map((item) => {
            const service = Array.isArray(item.services) ? item.services[0] : item.services;
            return { name: service?.name ?? "Service", price: Number(item.price) };
          }),
        };
      });
    res.json({ success: true, candidates });
  } catch (error) {
    console.error("Checkout ticket load failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to load completed tickets." });
  }
});

adminWorkspaceRouter.post("/transactions", async (req, res) => {
  try {
    const access = await requirePosAccess(req, res);
    if (!access) return;
    const queueEntryId = stringField(req.body?.queueEntryId, 64);
    const paymentMethod = req.body?.paymentMethod;
    if (!queueEntryId || !PAYMENT_METHODS.includes(paymentMethod)) {
      res.status(400).json({ success: false, message: "Select a completed queue ticket and valid payment method." });
      return;
    }

    const { data: entry, error: entryError } = await access.supabase
      .from("queue_entries")
      .select("id, ticket_number, customer_name, contact_number, status, promotion_id, service_packages ( title, price ), queue_entry_services ( id, service_id, status, price, services ( name ) )")
      .eq("id", queueEntryId)
      .maybeSingle();
    if (entryError) throw entryError;
    if (!entry) {
      res.status(404).json({ success: false, message: "Queue ticket not found." });
      return;
    }
    if (entry.status !== "completed"
      || !(entry.queue_entry_services ?? []).length
      || !(entry.queue_entry_services ?? []).every((item) => item.status === "completed")) {
      res.status(409).json({ success: false, message: "Only fully completed queue visits can be checked out." });
      return;
    }

    const existing = await access.supabase.from("pos_transactions").select("id").eq("queue_entry_id", queueEntryId).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) {
      res.status(409).json({ success: false, message: "This ticket has already been checked out." });
      return;
    }

    const packageInfo = normalizeServicePackage(entry.service_packages);
    const subtotal = packageInfo
      ? packageInfo.price
      : (entry.queue_entry_services ?? []).reduce((sum, item) => sum + Number(item.price || 0), 0);
    const now = new Date();
    const services = (entry.queue_entry_services ?? []).map((item) => ({
      id: item.service_id,
      price: Number(item.price || 0),
    }));
    const [{ data: promotionRows, error: promotionsError }, redemptionResult] = await Promise.all([
      access.supabase
        .from("promotions")
        .select("id, is_active, start_date, end_date, discount_type, discount_value, eligible_service_ids, minimum_spend, maximum_discount, usage_limit, redemption_count, one_per_customer, exclude_packages")
        .eq("is_active", true)
        .lte("start_date", now.toISOString())
        .gte("end_date", now.toISOString()),
      entry.contact_number
        ? access.supabase
          .from("promotion_redemptions")
          .select("promotion_id")
          .eq("contact_number", entry.contact_number)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (promotionsError) throw promotionsError;
    if (redemptionResult.error) throw redemptionResult.error;
    const redeemedPromotionIds = new Set(
      (redemptionResult.data ?? []).map((redemption) => redemption.promotion_id),
    );
    const bestPromotion = chooseBestEligiblePromotion(
      (promotionRows ?? []).map((promotion): AutomaticPromotionCandidate => ({
        ...promotion,
        starts_at: promotion.start_date,
        ends_at: promotion.end_date,
        discount_type: fromDatabasePromotionDiscountType(promotion.discount_type),
        discount_value: Number(promotion.discount_value),
      })),
      services,
      packageInfo?.price ?? null,
      entry.contact_number,
      now.getTime(),
      redeemedPromotionIds,
    );
    const appliedPromotionId = bestPromotion?.promotion.id ?? null;
    const discountAmount = bestPromotion?.discountAmount ?? 0;

    const transaction = {
      queue_entry_id: entry.id,
      ticket_number: entry.ticket_number,
      customer_name: entry.customer_name,
      contact_number: entry.contact_number,
      subtotal,
      discount_amount: discountAmount,
      total_amount: subtotal - discountAmount,
      payment_method: paymentMethod,
    };
    const items = packageInfo
      ? [{
        service_name: packageInfo.title,
        quantity: 1,
        unit_price: subtotal,
        line_total: subtotal,
      }]
      : (entry.queue_entry_services ?? []).map((item) => {
        const service = Array.isArray(item.services) ? item.services[0] : item.services;
        const price = Number(item.price || 0);
        return {
          service_name: service?.name ?? "Service",
          quantity: 1,
          unit_price: price,
          line_total: price,
        };
      });
    let claimedPromotionId: string | null = null;
    if (appliedPromotionId) {
      const { error: claimError } = await access.supabase.rpc("claim_promotion_redemption", {
        p_promotion_id: appliedPromotionId,
        p_queue_entry_id: entry.id,
        p_contact_number: entry.contact_number,
      });
      if (claimError) {
        if (claimError.code === "P0001" || claimError.code === "23505") {
          res.status(409).json({ success: false, message: claimError.message });
          return;
        }
        throw claimError;
      }
      claimedPromotionId = appliedPromotionId;
    }

    const { data: recordedTransaction, error: transactionError } = await access.supabase.rpc(
      "record_lynq_pos_transaction",
      { p_transaction: transaction, p_items: items }
    );
    if (transactionError && claimedPromotionId) {
      const { error: releaseError } = await access.supabase.rpc("release_promotion_redemption", {
        p_promotion_id: claimedPromotionId,
        p_queue_entry_id: entry.id,
      });
      if (releaseError) {
        throw new Error(`Checkout failed (${transactionError.message}) and promotion redemption cleanup failed (${releaseError.message}).`);
      }
    }
    if (transactionError?.code === "23505") {
      res.status(409).json({ success: false, message: "This ticket has already been checked out." });
      return;
    }
    if (transactionError) throw transactionError;
    await writeAuditLog(access.supabase, access.user.id, "pos_transaction.recorded", "pos_transaction", recordedTransaction.id, `Recorded payment for ticket #${entry.ticket_number}.`, { ticketNumber: entry.ticket_number, totalAmount: transaction.total_amount, paymentMethod });
    res.status(201).json({ success: true, transaction: recordedTransaction });
  } catch (error) {
    console.error("POS checkout failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to complete checkout." });
  }
});

adminWorkspaceRouter.get("/reports", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const reportType = typeof req.query.type === "string" ? req.query.type : "overview";
    if (!["overview", "revenue", "services", "visits", "service-log"].includes(reportType)) {
      res.status(400).json({ success: false, message: "Choose a supported report type." });
      return;
    }
    const from = typeof req.query.from === "string" ? new Date(req.query.from) : new Date(Date.now() - 30 * 86400000);
    const to = typeof req.query.to === "string" ? new Date(req.query.to) : new Date();
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
      res.status(400).json({ success: false, message: "Choose a valid report date range." });
      return;
    }
    const [{ data: transactions, error: transactionsError }, { data: visits, error: visitsError }] = await Promise.all([
      access.supabase.from("pos_transactions")
        .select("id, total_amount, discount_amount, payment_method, created_at")
        .eq("status", "paid")
        .gte("created_at", from.toISOString())
        .lt("created_at", to.toISOString())
        .limit(10000),
      access.supabase.from("queue_entries")
        .select("id, status, arrival_type, created_at")
        .gte("created_at", from.toISOString())
        .lt("created_at", to.toISOString())
        .limit(10000),
    ]);
    if (transactionsError) throw transactionsError;
    if (visitsError) throw visitsError;
    const paidTransactions = transactions ?? [];
    const paidTransactionIds = paidTransactions.map((transaction) => transaction.id);
    const { data: approvedAdjustments, error: adjustmentsError } = paidTransactionIds.length
      ? await access.supabase
        .from("pos_transaction_adjustments")
        .select("transaction_id, amount")
        .eq("status", "approved")
        .in("transaction_id", paidTransactionIds)
      : { data: [], error: null };
    if (adjustmentsError) throw adjustmentsError;
    const adjustmentsByTransaction = new Map<string, number>();
    for (const adjustment of approvedAdjustments ?? []) {
      adjustmentsByTransaction.set(
        adjustment.transaction_id,
        (adjustmentsByTransaction.get(adjustment.transaction_id) ?? 0) + Number(adjustment.amount),
      );
    }
    const byMethod = new Map<string, number>();
    const byDay = new Map<string, { transactions: number; revenue: number; discounts: number }>();
    for (const transaction of paidTransactions) {
      const netRevenue = Math.max(0, Number(transaction.total_amount) - (adjustmentsByTransaction.get(transaction.id) ?? 0));
      byMethod.set(transaction.payment_method, (byMethod.get(transaction.payment_method) ?? 0) + netRevenue);
      const date = transaction.created_at.slice(0, 10);
      const day = byDay.get(date) ?? { transactions: 0, revenue: 0, discounts: 0 };
      day.transactions += 1;
      day.revenue += netRevenue;
      day.discounts += Number(transaction.discount_amount);
      byDay.set(date, day);
    }
    const visitRows = visits ?? [];
    const rows: Record<string, string | number | null>[] = [];
    if (reportType === "overview") {
      for (const [paymentMethod, amount] of byMethod) rows.push({ paymentMethod, revenue: Number(amount.toFixed(2)) });
    } else if (reportType === "revenue") {
      for (const [date, values] of byDay) rows.push({ date, transactions: values.transactions, revenue: Number(values.revenue.toFixed(2)), discounts: Number(values.discounts.toFixed(2)) });
    } else if (reportType === "visits") {
      const byVisitDay = new Map<string, { visits: number; completed: number; appointments: number; cancelled: number; noShow: number }>();
      for (const visit of visitRows) {
        const date = visit.created_at.slice(0, 10);
        const day = byVisitDay.get(date) ?? { visits: 0, completed: 0, appointments: 0, cancelled: 0, noShow: 0 };
        day.visits += 1;
        if (visit.status === "completed") day.completed += 1;
        if (visit.arrival_type === "appointment") day.appointments += 1;
        if (visit.status === "cancelled") day.cancelled += 1;
        if (visit.status === "no_show") day.noShow += 1;
        byVisitDay.set(date, day);
      }
      for (const [date, values] of byVisitDay) {
        const eligibleVisits = values.completed + values.noShow;
        rows.push({
          date,
          ...values,
          noShowRate: eligibleVisits === 0 ? 0 : Number(((values.noShow / eligibleVisits) * 100).toFixed(1)),
        });
      }
    } else if (reportType === "services") {
      const byService = new Map<string, { category: string; bookings: number; completed: number; completedValue: number }>();
      const { data: serviceVisits, error: serviceVisitsError } = await access.supabase
        .from("queue_entries")
        .select("id, queue_entry_services ( status, price, services ( name, category ) )")
        .gte("created_at", from.toISOString())
        .lt("created_at", to.toISOString())
        .limit(10000);
      if (serviceVisitsError) throw serviceVisitsError;
      for (const visit of serviceVisits ?? []) {
        for (const item of visit.queue_entry_services ?? []) {
          const service = Array.isArray(item.services) ? item.services[0] : item.services;
          const name = service?.name ?? "Unknown service";
          const aggregate = byService.get(name) ?? { category: service?.category ?? "Other", bookings: 0, completed: 0, completedValue: 0 };
          aggregate.bookings += 1;
          if (item.status === "completed") {
            aggregate.completed += 1;
            aggregate.completedValue += Number(item.price || 0);
          }
          byService.set(name, aggregate);
        }
      }
      for (const [service, values] of byService) rows.push({ service, ...values, completedValue: Number(values.completedValue.toFixed(2)) });
      rows.sort((first, second) => Number(second.completedValue) - Number(first.completedValue));
    } else {
      const { data: serviceVisits, error: serviceVisitsError } = await access.supabase
        .from("queue_entries")
        .select("id, ticket_number, customer_name, created_at, queue_entry_services ( status, price, started_at, completed_at, services ( name ) )")
        .gte("created_at", from.toISOString())
        .lt("created_at", to.toISOString())
        .order("created_at", { ascending: true })
        .limit(10000);
      if (serviceVisitsError) throw serviceVisitsError;
      const visitIds = (serviceVisits ?? []).map((visit) => visit.id);
      const { data: visitTransactions, error: visitTransactionsError } = visitIds.length
        ? await access.supabase
          .from("pos_transactions")
          .select("queue_entry_id, status, payment_method, total_amount")
          .in("queue_entry_id", visitIds)
        : { data: [], error: null };
      if (visitTransactionsError) throw visitTransactionsError;
      const transactionsByVisit = new Map((visitTransactions ?? []).map((transaction) => [transaction.queue_entry_id, transaction]));
      for (const visit of serviceVisits ?? []) {
        const transaction = transactionsByVisit.get(visit.id);
        for (const serviceItem of visit.queue_entry_services ?? []) {
          const service = Array.isArray(serviceItem.services) ? serviceItem.services[0] : serviceItem.services;
          rows.push({
            date: visit.created_at.slice(0, 10),
            ticketNumber: visit.ticket_number,
            customer: visit.customer_name,
            service: service?.name ?? "Unknown service",
            serviceStatus: serviceItem.status,
            startedAt: serviceItem.started_at,
            completedAt: serviceItem.completed_at,
            servicePrice: Number(serviceItem.price ?? 0),
            paymentStatus: transaction?.status ?? "not checked out",
            paymentMethod: transaction?.payment_method ?? null,
            transactionTotal: transaction ? Number(transaction.total_amount) : null,
          });
        }
      }
    }
    if (reportType === "revenue" || reportType === "visits") {
      rows.sort((first, second) => String(first.date).localeCompare(String(second.date)));
    }
    res.json({
      success: true,
      report: {
        reportType,
        from: from.toISOString(),
        to: to.toISOString(),
        visits: visitRows.length,
        completed: visitRows.filter((visit) => visit.status === "completed").length,
        noShowRate: (() => {
          const noShows = visitRows.filter((visit) => visit.status === "no_show").length;
          const eligibleVisits = noShows + visitRows.filter((visit) => visit.status === "completed").length;
          return eligibleVisits === 0 ? 0 : Number(((noShows / eligibleVisits) * 100).toFixed(1));
        })(),
        appointments: visitRows.filter((visit) => visit.arrival_type === "appointment").length,
        transactions: paidTransactions.length,
        revenue: paidTransactions.reduce((sum, transaction) => sum + Math.max(
          0,
          Number(transaction.total_amount) - (adjustmentsByTransaction.get(transaction.id) ?? 0),
        ), 0),
        discounts: paidTransactions.reduce((sum, transaction) => sum + Number(transaction.discount_amount), 0),
        revenueByPaymentMethod: [...byMethod.entries()].map(([paymentMethod, amount]) => ({ paymentMethod, amount })),
        rows,
      },
    });
  } catch (error) {
    console.error("Admin report load failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to load report." });
  }
});

adminWorkspaceRouter.get("/backup", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const backup = await createAdminBackup();
    const { error: auditError } = await access.supabase.from("admin_backup_log").insert({
      action: "export",
      created_by: access.user.id,
      record_counts: backup.recordCounts,
    });
    if (auditError) throw auditError;
    await writeAuditLog(access.supabase, access.user.id, "backup.exported", "admin_backup", null, "Exported an admin data backup.", backup.recordCounts);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Backup-Record-Counts", JSON.stringify(backup.recordCounts));
    res.json({ success: true, backup });
  } catch (error) {
    console.error("Admin data export failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to export admin data." });
  }
});

adminWorkspaceRouter.get("/backup/files", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const result = await listScheduledAdminBackups();
    res.setHeader("Cache-Control", "no-store");
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Scheduled backup files load failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to load scheduled backup files." });
  }
});

adminWorkspaceRouter.get("/backup/files/:fileName", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const fileName = req.params.fileName;
    const filePath = await getScheduledAdminBackupPath(fileName);
    if (!filePath) {
      res.status(404).json({ success: false, message: "The selected scheduled backup file is unavailable." });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.download(filePath, fileName, (error) => {
      if (!error) return;
      console.error("Scheduled backup download failed:", error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: "Unable to download the scheduled backup file." });
      }
    });
  } catch (error) {
    console.error("Scheduled backup download failed:", error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to download the scheduled backup file." });
    }
  }
});

adminWorkspaceRouter.get("/backup/schedule-status", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    res.json({ success: true, schedule: getScheduledBackupStatus() });
  } catch (error) {
    console.error("Scheduled backup status load failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to load scheduled backup status." });
  }
});

adminWorkspaceRouter.get("/backup/history", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const { data, error } = await access.supabase
      .from("admin_backup_log")
      .select("id, action, record_counts, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    res.json({ success: true, history: data });
  } catch (error) {
    console.error("Backup history load failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to load backup history." });
  }
});

adminWorkspaceRouter.post("/backup/restore", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const payload = req.body?.backup;
    if (!payload || payload.format !== BACKUP_FORMAT || Buffer.byteLength(JSON.stringify(payload), "utf8") > 200 * 1024 * 1024) {
      res.status(400).json({ success: false, message: "Select a valid LynQ operational-data backup under 200 MB." });
      return;
    }
    const { data, error } = await access.supabase.rpc("restore_lynq_admin_backup", { p_payload: payload });
    if (error) throw error;
    const { error: auditError } = await access.supabase.from("admin_backup_log").insert({
      action: "restore",
      created_by: access.user.id,
      record_counts: data,
    });
    if (auditError) throw auditError;
    await writeAuditLog(access.supabase, access.user.id, "backup.restored", "admin_backup", null, "Restored an admin data backup.", data);
    res.json({ success: true, recordCounts: data });
  } catch (error) {
    console.error("Admin data restore failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to restore admin data." });
  }
});
