import { Router } from "express";
import { randomUUID } from "node:crypto";
import { getSupabase, getSupabaseAdmin, getSupabaseForUser } from "../lib/supabase.js";
import { getAuthenticatedUser } from "./auth.js";
import { estimateEntryWait } from "../services/forecast.js";
import { enqueueQueueSmsOnce } from "../services/queueNotifications.js";
import {
  isLateAppointment,
  resolveEffectiveArrival,
  resolveJoinStatus,
  serviceLane,
  staffCanPerformCategory,
  type ArrivalType,
  type PriorityType,
} from "../services/queueRules.js";
import { config } from "../config.js";
import { promotionIneligibilityReason } from "../lib/promotionRules.js";
import { writeAuditLog } from "../lib/auditLog.js";
import { bodyIdentityKey, rateLimit, requestIpKey } from "../middleware/rateLimit.js";
import { isMissingStaffAvailabilityTable, isMissingTable, loadUnavailableStaffIds } from "../services/staffAvailability.js";

export const queueRouter = Router();
type StaffAvailability = "available" | "on_break";

queueRouter.get("/staff/availability", async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ success: false, message: "Sign in to view staff availability." });
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("account_role, is_active")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.is_active || !["staff", "admin"].includes(profile.account_role)) {
      res.status(403).json({ success: false, message: "Active staff access is required." });
      return;
    }

    const { data, error } = await supabase
      .from("staff_availability")
      .select("status")
      .eq("staff_id", user.id)
      .maybeSingle();
    if (error && isMissingStaffAvailabilityTable(error)) {
      res.status(503).json({
        success: false,
        message: "Staff availability is unavailable until migration 20261101090000_queue_availability_and_sms_outbox.sql is applied.",
      });
      return;
    }
    if (error) throw error;
    res.json({ success: true, status: data?.status ?? "available" });
  } catch (error) {
    console.error("Staff availability load failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to load staff availability." });
  }
});

queueRouter.patch("/staff/availability", async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ success: false, message: "Sign in to update staff availability." });
      return;
    }
    const status = req.body?.status;
    if (status !== "available" && status !== "on_break") {
      res.status(400).json({ success: false, message: "Choose available or on break." });
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("account_role, is_active")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.is_active || !["staff", "admin"].includes(profile.account_role)) {
      res.status(403).json({ success: false, message: "Active staff access is required." });
      return;
    }

    const { data: result, error } = await supabase.rpc("set_staff_availability_and_reassign_queue", {
      p_staff_id: user.id,
      p_status: status,
    });
    if (error && isMissingStaffAvailabilityTable(error)) {
      res.status(503).json({
        success: false,
        message: "Staff availability is unavailable until migration 20261101090000_queue_availability_and_sms_outbox.sql is applied.",
      });
      return;
    }
    if (error?.code === "PGRST202" || error?.code === "42883") {
      res.status(503).json({
        success: false,
        message: "Safe staff availability updates are unavailable until migration 20261102100000_queue_admin_staff_workflows.sql is applied.",
      });
      return;
    }
    if (error) throw error;
    const mutation = result as {
      status?: StaffAvailability;
      reassignments?: Array<{
        entryId: string;
        serviceItemId: string;
        ticketNumber: number;
        customerName: string;
        contactNumber: string | null;
        fromStaffId: string;
        toStaffId: string | null;
      }>;
    } | null;
    const reassignments = mutation?.reassignments ?? [];
    await writeAuditLog({
      actorId: user.id,
      action: "staff.availability_changed",
      entityType: "staff",
      entityId: user.id,
      summary: `Changed staff availability to ${status}; reassigned ${reassignments.length} waiting service(s).`,
      metadata: { status, reassignedServiceItemIds: reassignments.map((item) => item.serviceItemId) },
    });
    const eventKey = randomUUID();
    const notifiedEntries = new Set<string>();
    for (const item of reassignments) {
      await writeAuditLog({
        actorId: user.id,
        action: "queue.service_reassigned",
        entityType: "queue_entry_service",
        entityId: item.serviceItemId,
        summary: `Reassigned waiting service for ticket Q-${String(item.ticketNumber).padStart(3, "0")} because staff became unavailable.`,
        metadata: { entryId: item.entryId, fromStaffId: item.fromStaffId, toStaffId: item.toStaffId },
      });
      if (!item.contactNumber || notifiedEntries.has(item.entryId)) continue;
      notifiedEntries.add(item.entryId);
      await enqueueQueueSmsOnce({
        entryId: item.entryId,
        phone: item.contactNumber,
        customerName: item.customerName,
        milestone: "staff_reassigned",
        eventKey,
        extra: item.toStaffId
          ? "Your assigned service provider has changed. Your queue place is unchanged."
          : "Your service provider is being reassigned. Your queue place is unchanged; please check with reception.",
      });
    }
    res.json({ success: true, status, reassignedServices: reassignments.length });
  } catch (error) {
    console.error("Staff availability update failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to update staff availability." });
  }
});

queueRouter.get("/staff/rebalance-requests", async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ success: false, message: "Sign in to view workload requests." });
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("account_role, is_active")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.is_active || profile.account_role !== "staff") {
      res.status(403).json({ success: false, message: "Active staff access is required." });
      return;
    }

    const { data: requests, error } = await supabase
      .from("staff_rebalance_requests")
      .select("id, service_item_id, queue_entry_id, from_staff_id, requested_by, created_at")
      .eq("to_staff_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(50);
    if (error) {
      if (isMissingTable(error, "staff_rebalance_requests")) {
        res.status(503).json({ success: false, message: "Workload requests are unavailable until migration 20261102100000_queue_admin_staff_workflows.sql is applied." });
        return;
      }
      throw error;
    }
    if (!requests?.length) {
      res.json({ success: true, requests: [] });
      return;
    }

    const entryIds = [...new Set(requests.map((request) => request.queue_entry_id))];
    const serviceItemIds = [...new Set(requests.map((request) => request.service_item_id))];
    const staffIds = [...new Set(requests.flatMap((request) =>
      [request.from_staff_id, request.requested_by].filter((id): id is string => Boolean(id))
    ))];
    const [entriesResult, servicesResult, staffResult] = await Promise.all([
      supabase.from("queue_entries").select("id, ticket_number, customer_name, status").in("id", entryIds),
      supabase.from("queue_entry_services").select("id, service_id, status, services ( name, category )").in("id", serviceItemIds),
      staffIds.length
        ? supabase.from("profiles").select("id, full_name").in("id", staffIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (entriesResult.error) throw entriesResult.error;
    if (servicesResult.error) throw servicesResult.error;
    if (staffResult.error) throw staffResult.error;
    const entries = new Map((entriesResult.data ?? []).map((entry) => [entry.id, entry]));
    const services = new Map((servicesResult.data ?? []).map((service) => [service.id, service]));
    const staffNames = new Map((staffResult.data ?? []).map((staff) => [staff.id, staff.full_name]));
    const activeRequests = requests.flatMap((request) => {
      const entry = entries.get(request.queue_entry_id);
      const service = services.get(request.service_item_id);
      const relation = Array.isArray(service?.services) ? service.services[0] : service?.services;
      if (!entry || entry.status !== "waiting" || service?.status !== "pending") return [];
      return [{
        id: request.id,
        entryId: request.queue_entry_id,
        ticketNumber: entry.ticket_number,
        customerName: entry.customer_name,
        serviceName: relation?.name ?? "Service",
        serviceCategory: relation?.category ?? "",
        fromStaffName: request.from_staff_id ? staffNames.get(request.from_staff_id) ?? "Another staff member" : "Unassigned queue",
        requestedByName: staffNames.get(request.requested_by) ?? "Administrator",
        createdAt: request.created_at,
      }];
    });
    res.json({ success: true, requests: activeRequests });
  } catch (error) {
    console.error("Staff workload request load failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to load workload requests." });
  }
});

queueRouter.patch("/staff/rebalance-requests/:requestId", async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ success: false, message: "Sign in to respond to workload requests." });
      return;
    }
    const requestId = req.params.requestId;
    const response = req.body?.response;
    if (!UUID_PATTERN.test(requestId) || !["accepted", "declined"].includes(response)) {
      res.status(400).json({ success: false, message: "Choose a valid request and accept or decline it." });
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("account_role, is_active, full_name")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.is_active || profile.account_role !== "staff") {
      res.status(403).json({ success: false, message: "Active staff access is required." });
      return;
    }

    const { data, error } = await supabase.rpc("respond_to_staff_rebalance_request", {
      p_request_id: requestId,
      p_staff_id: user.id,
      p_response: response,
    });
    if (error) {
      if (error.code === "P0002") {
        res.status(404).json({ success: false, message: "Workload request not found." });
        return;
      }
      if (error.code === "23514" || error.code === "40001") {
        res.status(409).json({ success: false, message: error.message });
        return;
      }
      if (error.code === "42501") {
        res.status(403).json({ success: false, message: error.message });
        return;
      }
      if (error.code === "PGRST202" || error.code === "42883") {
        res.status(503).json({ success: false, message: "Workload requests are unavailable until migration 20261102100000_queue_admin_staff_workflows.sql is applied." });
        return;
      }
      throw error;
    }

    const result = data as { id: string; entryId: string; serviceItemId: string; fromStaffId: string | null; status: string };
    await writeAuditLog({
      actorId: user.id,
      action: `queue.rebalance_${response}`,
      entityType: "staff_rebalance_request",
      entityId: requestId,
      summary: `${profile.full_name ?? "Staff member"} ${response} a workload rebalance request.`,
      metadata: { entryId: result.entryId, serviceItemId: result.serviceItemId, fromStaffId: result.fromStaffId },
    });

    if (response === "accepted") {
      const { data: entry, error: entryError } = await supabase
        .from("queue_entries")
        .select("id, customer_name, contact_number")
        .eq("id", result.entryId)
        .maybeSingle();
      if (entryError) throw entryError;
      if (entry?.contact_number) {
        await enqueueQueueSmsOnce({
          entryId: entry.id,
          phone: entry.contact_number,
          customerName: entry.customer_name,
          milestone: "staff_reassigned",
          eventKey: requestId,
          extra: "A new service provider has accepted your service. Your queue place is unchanged.",
        });
      }
    }
    res.json({ success: true, status: response });
  } catch (error) {
    console.error("Staff workload request response failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to respond to workload request." });
  }
});

const queueJoinRateLimit = rateLimit([
  { key: requestIpKey, limit: 30, windowMs: 15 * 60 * 1000 },
  { key: bodyIdentityKey("contactNumber"), limit: 5, windowMs: 30 * 60 * 1000 },
], "Too many queue requests. Please wait before joining again.");

const ALLOWED_PRIORITY: PriorityType[] = ["regular", "senior", "pwd"];
const ALLOWED_ARRIVAL: ArrivalType[] = ["walk_in", "appointment"];
const PRIVACY_NOTICE_VERSION = "2026-10-25-v1";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface ServicePreference {
  serviceId: string;
  staffId: string;
}

function parseServicePreferences(value: unknown): { preferences: ServicePreference[]; valid: boolean } {
  if (value === undefined) return { preferences: [], valid: true };
  if (!Array.isArray(value)) return { preferences: [], valid: false };
  const preferences: ServicePreference[] = [];
  for (const preference of value) {
    if (!preference || typeof preference.serviceId !== "string" || typeof preference.staffId !== "string") {
      return { preferences: [], valid: false };
    }
    preferences.push({ serviceId: preference.serviceId, staffId: preference.staffId });
  }
  return { preferences, valid: true };
}

queueRouter.post("/manual", async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ success: false, message: "Sign in to add a walk-in." });
      return;
    }
    const supabase = getSupabaseAdmin();
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("account_role, is_active")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.is_active || !["staff", "admin"].includes(profile.account_role)) {
      res.status(403).json({ success: false, message: "Active staff access is required to add a walk-in." });
      return;
    }

    const customerName = String(req.body?.customerName ?? "").trim();
    const contactNumber = String(req.body?.contactNumber ?? "").trim();
    const arrivalType = req.body?.arrivalType === "appointment" ? "appointment" : "walk_in";
    const appointmentAt = typeof req.body?.appointmentAt === "string" ? req.body.appointmentAt : null;
    const rawServiceIds: unknown = req.body?.serviceIds;
    const serviceIds: string[] = Array.isArray(rawServiceIds)
      ? [...new Set(rawServiceIds.filter((id): id is string => typeof id === "string"))]
      : [];
    if (req.body?.privacyConsent !== true || !customerName || customerName.length > 100
      || !/^09\d{9}$/.test(contactNumber)
      || (arrivalType === "appointment" && (!contactNumber || !appointmentAt))
      || serviceIds.length === 0 || serviceIds.length > 20 || serviceIds.some((id) => !UUID_PATTERN.test(id))) {
      res.status(400).json({ success: false, message: "Enter the customer's name and mobile number, confirm privacy consent, and select valid services. Phone bookings also require an appointment time." });
      return;
    }
    const priorityType = ALLOWED_PRIORITY.find((priority) => priority === req.body?.priorityType) ?? "regular";
    let additionalNotes = typeof req.body?.additionalNotes === "string"
      ? req.body.additionalNotes.trim().slice(0, 500)
      : "";
    let scheduledAppointmentAt: string | null = null;
    if (arrivalType === "appointment" && appointmentAt) {
      const scheduled = new Date(appointmentAt);
      if (Number.isNaN(scheduled.getTime()) || scheduled.getTime() <= Date.now()) {
        res.status(400).json({ success: false, message: "Choose an appointment time in the future." });
        return;
      }
      if (scheduled.getHours() < APPOINTMENT_OPEN_HOUR || scheduled.getHours() >= APPOINTMENT_CLOSE_HOUR) {
        res.status(400).json({ success: false, message: "Appointments are available between 10:00 AM and 8:00 PM." });
        return;
      }
      scheduledAppointmentAt = scheduled.toISOString();
      const label = scheduled.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
      additionalNotes = additionalNotes ? `[Appointment: ${label}] ${additionalNotes}` : `[Appointment: ${label}]`;
    }
    const { data: services, error: servicesError } = await supabase
      .from("services")
      .select("id, price, duration_minutes, is_visible, is_available")
      .in("id", serviceIds);
    if (servicesError) throw servicesError;
    const availableServices = (services ?? []).filter((service) => service.is_visible && service.is_available);
    if (availableServices.length !== serviceIds.length) {
      res.status(400).json({ success: false, message: "One or more selected services are unavailable." });
      return;
    }

    const totalDuration = availableServices.reduce((total, service) => total + Number(service.duration_minutes || 0), 0);
    const lateAppointment = isLateAppointment(appointmentAt);
    const effectiveArrival = resolveEffectiveArrival(arrivalType, lateAppointment);
    const { data: entry, error: entryError } = await supabase
      .from("queue_entries")
      .insert({
        customer_name: customerName,
        contact_number: contactNumber,
        join_channel: "staff",
        priority_type: priorityType,
        arrival_type: effectiveArrival,
        appointment_at: scheduledAppointmentAt,
        status: resolveJoinStatus(arrivalType, lateAppointment),
        estimated_duration: totalDuration,
        additional_notes: additionalNotes || null,
        privacy_consent_at: new Date().toISOString(),
        privacy_notice_version: PRIVACY_NOTICE_VERSION,
      })
      .select("id, ticket_number, customer_name, contact_number, priority_type, arrival_type, status, estimated_duration, additional_notes, position, created_at")
      .single();
    if (entryError) throw entryError;

    const { error: serviceInsertError } = await supabase.from("queue_entry_services").insert(
      availableServices.map((service) => ({
        queue_entry_id: entry.id,
        service_id: service.id,
        price: Number(service.price || 0),
        estimated_duration: Number(service.duration_minutes || 0),
      })),
    );
    if (serviceInsertError) {
      await supabase.from("queue_entries").delete().eq("id", entry.id);
      throw serviceInsertError;
    }

    if (contactNumber) {
      const { error: customerError } = await supabase.from("customer_records").upsert({
        contact_number: contactNumber,
        display_name: customerName,
        updated_at: new Date().toISOString(),
      }, { onConflict: "contact_number" });
      if (customerError) {
        await supabase.from("queue_entries").delete().eq("id", entry.id);
        throw customerError;
      }
    }
    const [{ error: workstationError }, { error: seatsError }] = await Promise.all([
      supabase.rpc("assign_workstations_for_entry", { p_entry_id: entry.id }),
      supabase.rpc("assign_customer_service_seats_for_entry", { p_entry_id: entry.id }),
    ]);
    if (workstationError || seatsError) {
      await supabase.from("queue_entries").delete().eq("id", entry.id);
      throw workstationError ?? seatsError;
    }

    const wait = await estimateEntryWait(entry.id, config.crowdThreshold);
    const sms = await enqueueQueueSmsOnce({
      entryId: entry.id,
      phone: contactNumber,
      customerName,
      milestone: "joined",
      extra: `Ticket Q-${String(entry.ticket_number).padStart(3, "0")}, position ${entry.position ?? "pending"}. Est. wait ~${wait.ewtMinutes} min.`,
    });
    await writeAuditLog({
      actorId: user.id,
      action: arrivalType === "appointment" ? "queue.phone_booking_added" : "queue.walk_in_added",
      entityType: "queue_entry",
      entityId: entry.id,
      summary: `Added ${customerName} to the queue as a ${arrivalType === "appointment" ? "phone booking" : "walk-in"}.`,
      metadata: { contactNumber: Boolean(contactNumber), serviceIds, priorityType, appointmentAt: scheduledAppointmentAt },
    });
    res.status(201).json({ success: true, entry, wait, sms });
  } catch (error) {
    console.error("Staff walk-in add failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to add the walk-in." });
  }
});

queueRouter.get("/history/transactions", async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ success: false, message: "You must be signed in." });
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("account_role, is_active")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.is_active || profile.account_role !== "staff") {
      res.status(403).json({ success: false, message: "Active staff access is required." });
      return;
    }

    const { data: services, error: servicesError } = await supabase
      .from("queue_entry_services")
      .select("queue_entry_id")
      .eq("assigned_staff_id", user.id)
      .eq("status", "completed");
    if (servicesError) throw servicesError;
    const queueEntryIds = [...new Set((services ?? []).map((service) => service.queue_entry_id))];
    if (queueEntryIds.length === 0) {
      res.json({ success: true, transactions: [] });
      return;
    }

    const { data: transactions, error: transactionsError } = await supabase
      .from("pos_transactions")
      .select("id, queue_entry_id, ticket_number, customer_name, subtotal, discount_amount, total_amount, payment_method, status, created_at, pos_transaction_items ( service_name, quantity )")
      .in("queue_entry_id", queueEntryIds)
      .order("created_at", { ascending: false })
      .limit(500);
    if (transactionsError) throw transactionsError;
    res.json({ success: true, transactions: transactions ?? [] });
  } catch (error) {
    console.error("Staff transaction history load failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to load transaction history." });
  }
});

function stationMatchesService(stationCategory: string, serviceCategory: string) {
  const normalizedStation = stationCategory.trim().toLowerCase();
  const normalizedService = serviceCategory.trim().toLowerCase();

  const sameCategory = normalizedStation === normalizedService;
  const matchingSpecialtyLane = serviceLane(stationCategory) !== "other"
    && serviceLane(stationCategory) === serviceLane(serviceCategory);
  return sameCategory || matchingSpecialtyLane;
}

function serviceSeatMatchesService(
  seatCategory: string,
  seatLabel: string,
  serviceCategory: string,
) {
  const seatDescription = `${seatCategory} ${seatLabel}`.trim().toLowerCase();
  const serviceDescription = serviceCategory.trim().toLowerCase();
  if (/shampoo|wash/.test(serviceDescription)) return /shampoo|wash/.test(seatDescription);

  const lane = serviceLane(serviceDescription);
  if (lane === "hair") return /hair|stylist|barber|color|make[\s_-]?up|brows?|eyebrows?|lash/.test(seatDescription);
  if (lane === "nails") return /nail|mani|pedi|foot/.test(seatDescription);
  return seatCategory.trim().toLowerCase() === serviceDescription;
}

function getErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return { code: null, message: error.message };
  }
  if (typeof error === "object" && error !== null) {
    const details = error as { code?: unknown; message?: unknown };
    return {
      code: typeof details.code === "string" ? details.code : null,
      message: typeof details.message === "string" ? details.message : null,
    };
  }
  return { code: null, message: null };
}

// Salon is open 9 AM - 9 PM, but staff need time before opening and after
// closing to prep/close the shop, so appointment slots are restricted to
// 10 AM - 8 PM.
const APPOINTMENT_OPEN_HOUR = 10;
const APPOINTMENT_CLOSE_HOUR = 20;

queueRouter.post("/get-wait-quote", async (req, res) => {
  try {
    const firstServiceId = typeof req.body?.firstServiceId === "string" ? req.body.firstServiceId : "";
    const preferredStaffId = typeof req.body?.preferredStaffId === "string" ? req.body.preferredStaffId : null;
    if (!UUID_PATTERN.test(firstServiceId) || (preferredStaffId && !UUID_PATTERN.test(preferredStaffId))) {
      res.status(400).json({ success: false, message: "Select a valid service and staff member." });
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data: service, error: serviceError } = await supabase
      .from("services")
      .select("id, category, is_visible, is_available")
      .eq("id", firstServiceId)
      .maybeSingle();
    if (serviceError) throw serviceError;
    if (!service?.is_visible || !service.is_available) {
      res.status(200).json({ success: true, minutes: null, method: "queue_estimate" });
      return;
    }

    const [
      { data: stations, error: stationsError },
      { data: staff, error: staffError },
      availability,
    ] = await Promise.all([
      supabase.from("stations").select("id, category, home_staff_id").eq("is_active", true),
      supabase.from("profiles").select("id, staff_role, account_role").eq("is_active", true).in("account_role", ["staff", "admin"]),
      loadUnavailableStaffIds(supabase),
    ]);
    if (stationsError) throw stationsError;
    if (staffError) throw staffError;
    const matchingStations = (stations ?? []).filter((station) =>
      stationMatchesService(station.category, String(service.category ?? ""))
    );
    const activeStaff = (staff ?? []).filter((member) => member.staff_role !== "receptionist"
      && !availability.staffIds.has(member.id)
      && (member.account_role === "staff"
        || (member.account_role === "admin" && member.staff_role === "hairstylist")));
    let capacity = 0;

    if (preferredStaffId) {
      const preferredStaff = activeStaff.find((member) => member.id === preferredStaffId);
      const staffStations = matchingStations.filter((station) => station.home_staff_id === preferredStaffId);
      const availableStations = staffStations.length > 0
        ? staffStations
        : matchingStations.filter((station) => station.home_staff_id === null);
      const canPerform = Boolean(preferredStaff && (
        staffCanPerformCategory(preferredStaff.staff_role, service.category)
        || staffStations.length > 0
      ));
      capacity = canPerform && availableStations.length > 0 ? 1 : 0;
    } else {
      const eligibleStaff = activeStaff.filter((member) =>
        staffCanPerformCategory(member.staff_role, service.category)
        || matchingStations.some((station) => station.home_staff_id === member.id)
      );
      const eligibleStations = matchingStations.filter((station) =>
        station.home_staff_id === null
          ? eligibleStaff.length > 0
          : eligibleStaff.some((member) => member.id === station.home_staff_id)
      );
      capacity = Math.min(eligibleStaff.length, eligibleStations.length);
    }

    if (capacity === 0) {
      res.status(200).json({ success: true, minutes: null, method: "queue_estimate" });
      return;
    }

    const { data: activeServices, error: workloadError } = await supabase
      .from("queue_entry_services")
      .select("status, estimated_duration, service_started_at, started_at, services ( category )")
      .in("status", ["pending", "in_service"]);
    if (workloadError) throw workloadError;

    const now = Date.now();
    const workloadMinutes = (activeServices ?? []).reduce((total, item) => {
      const itemService = Array.isArray(item.services) ? item.services[0] : item.services;
      if (!itemService?.category
        || !stationMatchesService(itemService.category, String(service.category ?? ""))) return total;
      const duration = Math.max(0, Number(item.estimated_duration ?? 0));
      if (item.status !== "in_service") return total + duration;
      const startedAt = item.service_started_at ?? item.started_at;
      const elapsed = startedAt ? Math.max(0, (now - Date.parse(startedAt)) / 60_000) : 0;
      return total + Math.max(0, duration - elapsed);
    }, 0);

    res.json({
      success: true,
      minutes: Math.ceil(workloadMinutes / capacity),
      method: "queue_estimate",
    });
  } catch (error) {
    console.error("Queue wait quote failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to estimate the wait." });
  }
});

queueRouter.get("/:entryId/live", async (req, res) => {
  const { entryId } = req.params;
  if (!UUID_PATTERN.test(entryId)) {
    res.status(400).json({ success: false, message: "Invalid queue entry." });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: ticket, error: ticketError } = await supabase
      .from("queue_entries")
      .select("id")
      .eq("id", entryId)
      .maybeSingle();
    if (ticketError) throw ticketError;
    if (!ticket) {
      res.status(404).json({ success: false, message: "This queue entry could not be found." });
      return;
    }

    const { data: entries, error } = await supabase
      .from("queue_entries")
      .select("ticket_number, status, position, queue_entry_services ( status, service_stage, services ( name ) )")
      .in("status", ["waiting", "in_service"])
      .order("position", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    if (error) throw error;

    res.json({
      success: true,
      tickets: (entries ?? []).map((entry) => ({
        ticketNumber: entry.ticket_number,
        status: entry.status,
        position: entry.position,
        services: (entry.queue_entry_services ?? []).map((item) => {
          const service = Array.isArray(item.services) ? item.services[0] : item.services;
          return {
            name: service?.name ?? "Service",
            status: item.status,
            stage: item.service_stage,
          };
        }),
      })),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Public live queue load failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to load the live queue." });
  }
});

queueRouter.post("/service/:itemId/start", async (req, res) => {
  try {
    const authorization = req.headers.authorization;
    const accessToken = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : "";
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ success: false, message: "You must be signed in." });
      return;
    }

    const supabase = getSupabaseAdmin();
    const callerSupabase = getSupabaseForUser(accessToken);
    const { data: callerProfile, error: profileError } = await supabase
      .from("profiles")
      .select("account_role, is_active")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!callerProfile || !callerProfile.is_active || !["staff", "admin"].includes(callerProfile.account_role)) {
      res.status(403).json({ success: false, message: "Only active staff or administrators can start a service." });
      return;
    }

    const { data: item, error: itemError } = await supabase
      .from("queue_entry_services")
      .select("id, queue_entry_id, service_id, status, assigned_staff_id, preferred_staff_id, customer_service_seat_id, services ( category ), queue_entries ( id, customer_name, contact_number, preferred_staff_id, assigned_staff_id )")
      .eq("id", req.params.itemId)
      .maybeSingle();
    if (itemError) throw itemError;
    if (!item) {
      res.status(404).json({ success: false, message: "Service item not found." });
      return;
    }

    const entry = Array.isArray(item.queue_entries) ? item.queue_entries[0] : item.queue_entries;
    if (item.status !== "pending") {
      res.status(409).json({ success: false, message: "This service has already been accepted." });
      return;
    }
    const requestedStaffId = typeof req.body?.staffId === "string" ? req.body.staffId : null;
    const staffId = callerProfile.account_role === "admin" ? requestedStaffId : user.id;
    if (!staffId || (callerProfile.account_role === "staff" && requestedStaffId && requestedStaffId !== user.id)) {
      res.status(400).json({ success: false, message: "Select an eligible staff member." });
      return;
    }
    const { data: assignedStaff, error: assignedStaffError } = await supabase
      .from("profiles")
      .select("staff_role, is_active, account_role")
      .eq("id", staffId)
      .maybeSingle();
    if (assignedStaffError) throw assignedStaffError;

    const service = Array.isArray(item.services) ? item.services[0] : item.services;
    const assignedAccountEligible = assignedStaff?.account_role === "staff"
      || (assignedStaff?.account_role === "admin" && assignedStaff.staff_role === "hairstylist");
    if (!assignedStaff || !assignedStaff.is_active || !assignedAccountEligible
      || assignedStaff.staff_role === "receptionist") {
      res.status(403).json({ success: false, message: "That staff member is not eligible for this service." });
      return;
    }
    const availability = await loadUnavailableStaffIds(supabase);
    if (availability.staffIds.has(staffId)) {
      res.status(409).json({ success: false, message: "That staff member is currently on break." });
      return;
    }

    const requestedStationId = typeof req.body?.stationId === "string" ? req.body.stationId : null;
    const customerServiceSeatId = typeof req.body?.customerServiceSeatId === "string"
      ? req.body.customerServiceSeatId
      : "";
    if (!UUID_PATTERN.test(customerServiceSeatId)) {
      res.status(400).json({ success: false, message: "Choose an active service chair before starting." });
      return;
    }
    const { data: serviceSeat, error: serviceSeatError } = await supabase
      .from("customer_service_seats")
      .select("id, label, category, is_active")
      .eq("id", customerServiceSeatId)
      .maybeSingle();
    if (serviceSeatError) throw serviceSeatError;
    if (!serviceSeat?.is_active) {
      res.status(409).json({ success: false, message: "That service chair is no longer active." });
      return;
    }
    const serviceCategory = String(service?.category ?? "");
    if (!serviceSeatMatchesService(serviceSeat.category, serviceSeat.label, serviceCategory)) {
      res.status(400).json({ success: false, message: "Choose a service chair that matches this service category." });
      return;
    }

    const { data: staffStations, error: staffStationsError } = await supabase
      .from("stations")
      .select("id, category")
      .eq("home_staff_id", staffId)
      .eq("is_active", true);
    if (staffStationsError) throw staffStationsError;
    const staffStationIds = new Set((staffStations ?? []).map((station) => station.id));
    const hasMatchingStaffStation = (staffStations ?? []).some((station) =>
      stationMatchesService(station.category, String(service?.category ?? ""))
    );
    const requestedServiceStaffId = item.preferred_staff_id ?? entry?.preferred_staff_id;
    const explicitlyAssigned = item.assigned_staff_id === user.id
      || (!item.assigned_staff_id && requestedServiceStaffId === user.id)
      || entry?.assigned_staff_id === user.id;
    if (callerProfile.account_role === "staff"
      && !explicitlyAssigned
      && !hasMatchingStaffStation) {
      res.status(403).json({ success: false, message: "This customer is not assigned to you." });
      return;
    }
    if (callerProfile.account_role === "staff" && requestedServiceStaffId && !item.assigned_staff_id
      && requestedServiceStaffId !== user.id) {
      res.status(403).json({ success: false, message: "This service has a different stylist preference." });
      return;
    }
    if (!staffCanPerformCategory(assignedStaff.staff_role, service?.category) && !hasMatchingStaffStation) {
      res.status(403).json({ success: false, message: "That staff member is not eligible for this service." });
      return;
    }
    let candidateStations;

    if (requestedStationId) {
      const { data, error: stationError } = await supabase
        .from("stations")
        .select("id, label, category, home_staff_id, is_active")
        .eq("id", requestedStationId)
        .maybeSingle();
      if (stationError) throw stationError;
      if (!data || !data.is_active) {
        res.status(400).json({ success: false, message: "That station is not available." });
        return;
      }
      if (!stationMatchesService(data.category, serviceCategory)) {
        res.status(400).json({ success: false, message: "Choose a station that matches this service category." });
        return;
      }
      if (data.home_staff_id && data.home_staff_id !== staffId) {
        res.status(403).json({ success: false, message: "That station is assigned to another staff member." });
        return;
      }
      candidateStations = [data];
    } else {
      const [
        { data: occupied, error: occupiedError },
        { data: stations, error: stationsError },
      ] = await Promise.all([
        supabase
          .from("queue_entry_services")
          .select("station_id, station_reserved_until")
          .in("status", ["pending", "in_service"])
          .neq("id", item.id)
          .not("station_id", "is", null),
        supabase
          .from("stations")
          .select("id, label, category, home_staff_id, is_active")
          .eq("is_active", true)
          .order("label", { ascending: true }),
      ]);
      if (occupiedError) throw occupiedError;
      if (stationsError) throw stationsError;
      const now = Date.now();
      const occupiedIds = new Set((occupied ?? [])
        .filter((reservation) =>
          reservation.station_reserved_until === null
          || new Date(reservation.station_reserved_until).getTime() > now
        )
        .map((row) => row.station_id));
      const serviceCategory = String(service?.category ?? "");
      candidateStations = (stations ?? []).filter((station) => {
        if (!stationMatchesService(station.category, serviceCategory)) return false;
        if (occupiedIds.has(station.id)) return false;
        if (staffStationIds.size > 0) return staffStationIds.has(station.id);
        return station.home_staff_id === null;
      });
    }

    if (staffStationIds.size > 0 && candidateStations.some((station) => !staffStationIds.has(station.id))) {
      res.status(403).json({ success: false, message: "Use the station assigned to this staff member." });
      return;
    }

    let assignedStation: (typeof candidateStations)[number] | null = null;
    for (const station of candidateStations) {
      let { error: startError } = await callerSupabase.rpc("start_service_item_with_customer_seat", {
        p_item_id: item.id,
        p_station_id: station.id,
        p_staff_id: staffId,
        p_customer_service_seat_id: customerServiceSeatId,
      });
      if (startError?.code === "PGRST202" || startError?.code === "42883") {
        if (item.customer_service_seat_id !== customerServiceSeatId) {
          res.status(503).json({
            success: false,
            message: "Apply the latest queue migration before assigning a different service chair.",
          });
          return;
        }
        console.warn("Service-seat start RPC is unavailable; using the existing start function for its already-reserved chair.");
        const fallback = await callerSupabase.rpc("start_service_item_and_release_lounge_seat", {
          p_item_id: item.id,
          p_station_id: station.id,
          p_staff_id: staffId,
        });
        startError = fallback.error;
      }
      if (!startError) {
        assignedStation = station;
        break;
      }
      if (startError.code === "23514") {
        res.status(409).json({
          success: false,
          message: "This service cannot start in its current state. Refresh the queue and try again.",
        });
        return;
      }
      if (startError.code === "23505" && startError.message.includes("service seat")) {
        res.status(409).json({ success: false, message: "That service chair was just assigned to another customer. Choose another chair." });
        return;
      }
      if (startError.code !== "23505" && startError.code !== "23P01") throw startError;
    }

    if (!assignedStation) {
      res.status(409).json({ success: false, message: "No free station is available for this service." });
      return;
    }

    await writeAuditLog({
      actorId: user.id,
      action: "queue.service_started",
      entityType: "queue_entry_service",
      entityId: item.id,
      summary: `Started service ${item.id} at ${assignedStation.label}.`,
      metadata: { entryId: item.queue_entry_id, staffId, stationId: assignedStation.id },
    });
    res.json({ success: true, station: assignedStation.label, serviceSeat: serviceSeat.label });
  } catch (error) {
    console.error("Start service failed:", error);
    const details = getErrorDetails(error);
    const missingDatabaseFunction = details.code === "PGRST202" || details.code === "42883";
    res.status(missingDatabaseFunction ? 503 : 500).json({
      success: false,
      message: missingDatabaseFunction
        ? "Queue acceptance database functions are not installed. Apply the latest queue migration, then retry."
        : details.message ?? "Unable to accept customer. Check the API log for the database error.",
    });
  }
});

queueRouter.post("/service/:itemId/call", async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ success: false, message: "You must be signed in." });
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("account_role, is_active")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile || !profile.is_active || !["staff", "admin"].includes(profile.account_role)) {
      res.status(403).json({ success: false, message: "Only active staff or administrators can call a customer." });
      return;
    }
    if (profile.account_role === "staff") {
      const availability = await loadUnavailableStaffIds(supabase);
      if (availability.staffIds.has(user.id)) {
        res.status(409).json({ success: false, message: "End your break before calling a customer." });
        return;
      }
    }

    const { data: item, error: itemError } = await supabase
      .from("queue_entry_services")
      .select("id, queue_entry_id, status, service_stage, assigned_staff_id, preferred_staff_id, services ( name, category ), queue_entries ( id, ticket_number, customer_name, contact_number, preferred_staff_id, assigned_staff_id )")
      .eq("id", req.params.itemId)
      .maybeSingle();
    if (itemError) throw itemError;
    if (!item) {
      res.status(404).json({ success: false, message: "Service item not found." });
      return;
    }
    const entry = Array.isArray(item.queue_entries) ? item.queue_entries[0] : item.queue_entries;
    const service = Array.isArray(item.services) ? item.services[0] : item.services;
    const { data: otherServices, error: otherServicesError } = await supabase
      .from("queue_entry_services")
      .select("id, status, started_at, service_started_at, completed_at")
      .eq("queue_entry_id", item.queue_entry_id)
      .neq("id", item.id);
    if (otherServicesError) throw otherServicesError;
    const isInternalHandoff = (otherServices ?? []).some((otherService) =>
      otherService.status === "in_service"
      || otherService.status === "completed"
      || Boolean(otherService.started_at || otherService.service_started_at || otherService.completed_at)
    );
    let serviceSeatLabel: string | null = null;
    const requestedSeatId = typeof req.body?.customerServiceSeatId === "string"
      ? req.body.customerServiceSeatId
      : "";
    if (requestedSeatId) {
      if (!UUID_PATTERN.test(requestedSeatId)) {
        res.status(400).json({ success: false, message: "Choose a valid service chair." });
        return;
      }
      const { data: serviceSeat, error: serviceSeatError } = await supabase
        .from("customer_service_seats")
        .select("id, label, category, is_active")
        .eq("id", requestedSeatId)
        .maybeSingle();
      if (serviceSeatError) throw serviceSeatError;
      if (!serviceSeat?.is_active || !serviceSeatMatchesService(
        serviceSeat.category,
        serviceSeat.label,
        String(service?.category ?? ""),
      )) {
        res.status(409).json({ success: false, message: "That service chair is no longer available for this service." });
        return;
      }
      serviceSeatLabel = serviceSeat.label;
    }

    const assignedStaffId = profile.account_role === "admin"
      && typeof req.body?.staffId === "string"
      && UUID_PATTERN.test(req.body.staffId)
      ? req.body.staffId
      : user.id;
    const { data: assignedStaff, error: assignedStaffError } = await supabase
      .from("profiles")
      .select("full_name, is_active, staff_role, account_role")
      .eq("id", assignedStaffId)
      .maybeSingle();
    if (assignedStaffError) throw assignedStaffError;
    if (!assignedStaff?.is_active || !["staff", "admin"].includes(assignedStaff.account_role)) {
      res.status(409).json({ success: false, message: "The selected staff member is no longer available." });
      return;
    }
    const staffName = assignedStaff.full_name;
    const assignmentMessage = serviceSeatLabel && staffName
      ? `Ticket Q-${String(entry?.ticket_number).padStart(3, "0")}: please proceed to ${serviceSeatLabel} for ${service?.name ?? "your service"} with ${staffName}.`
      : `Ticket Q-${String(entry?.ticket_number).padStart(3, "0")}: please proceed to reception for your stylist and chair.`;
    if (item.status !== "pending") {
      res.status(409).json({ success: false, message: "This service is no longer waiting to start." });
      return;
    }
    if (profile.account_role === "staff") {
      const service = Array.isArray(item.services) ? item.services[0] : item.services;
      const { data: staffStations, error: stationsError } = await supabase
        .from("stations")
        .select("category")
        .eq("home_staff_id", user.id)
        .eq("is_active", true);
      if (stationsError) throw stationsError;
      const assignedToStation = (staffStations ?? []).some((station) =>
        stationMatchesService(station.category, String(service?.category ?? ""))
      );
      const requestedServiceStaffId = item.preferred_staff_id ?? entry?.preferred_staff_id;
      const explicitlyAssigned = item.assigned_staff_id === user.id
        || (!item.assigned_staff_id && requestedServiceStaffId === user.id)
        || entry?.assigned_staff_id === user.id;
      if ((!explicitlyAssigned && !assignedToStation)
        || (requestedServiceStaffId && requestedServiceStaffId !== user.id && !item.assigned_staff_id)) {
        res.status(403).json({ success: false, message: "This customer is not assigned to you." });
        return;
      }
    }
    if (item.service_stage === "called") {
      if (isInternalHandoff) {
        res.json({
          success: true,
          serviceStage: "called",
          sms: { sent: false, reason: "internal_handoff" },
        });
        return;
      }
      const sms = entry
        ? await enqueueQueueSmsOnce({
          entryId: entry.id,
          phone: entry.contact_number,
          customerName: entry.customer_name,
          milestone: "your_turn",
          extra: assignmentMessage,
        })
        : { sent: false, reason: "queue_entry_unavailable" as const };
      res.json({ success: true, serviceStage: "called", sms });
      return;
    }

    const { data: updated, error: updateError } = await supabase
      .from("queue_entry_services")
      .update({ service_stage: "called" })
      .eq("id", item.id)
      .eq("status", "pending")
      .eq("service_stage", "waiting")
      .select("id")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) {
      res.status(409).json({ success: false, message: "This service has changed. Refresh and try again." });
      return;
    }

    await writeAuditLog({
      actorId: user.id,
      action: "queue.service_called",
      entityType: "queue_entry_service",
      entityId: item.id,
      summary: `Called customer for service ${item.id}.`,
      metadata: { entryId: entry?.id ?? item.queue_entry_id, staffId: assignedStaffId },
    });
    const sms = isInternalHandoff
      ? { sent: false, reason: "internal_handoff" as const }
      : entry
      ? await enqueueQueueSmsOnce({
        entryId: entry.id,
        phone: entry.contact_number,
        customerName: entry.customer_name,
        milestone: "your_turn",
        extra: assignmentMessage,
      })
      : { sent: false, reason: "queue_entry_unavailable" as const };
    res.json({ success: true, serviceStage: "called", sms });
  } catch (error) {
    console.error("Call customer failed:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Unable to call customer.",
    });
  }
});

queueRouter.patch("/service/:itemId/progress", async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ success: false, message: "You must be signed in." });
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("account_role, is_active")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile || !profile.is_active || !["staff", "admin"].includes(profile.account_role)) {
      res.status(403).json({ success: false, message: "Only active staff or administrators can update service progress." });
      return;
    }

    const { data: item, error: itemError } = await supabase
      .from("queue_entry_services")
      .select("id, status, assigned_staff_id")
      .eq("id", req.params.itemId)
      .maybeSingle();
    if (itemError) throw itemError;
    if (!item) {
      res.status(404).json({ success: false, message: "Service item not found." });
      return;
    }
    if (item.status !== "in_service") {
      res.status(409).json({ success: false, message: "Progress updates are available while a service is in progress." });
      return;
    }
    if (profile.account_role === "staff" && item.assigned_staff_id !== user.id) {
      res.status(403).json({ success: false, message: "Only the assigned staff member can update this service." });
      return;
    }
    if (typeof req.body?.message !== "string" || req.body.message.trim().length > 160) {
      res.status(400).json({ success: false, message: "Progress updates must be 160 characters or fewer." });
      return;
    }

    const message = req.body.message.trim() || null;
    const { data: updated, error: updateError } = await supabase
      .from("queue_entry_services")
      .update({ staff_update: message, staff_updated_at: message ? new Date().toISOString() : null })
      .eq("id", item.id)
      .eq("status", "in_service")
      .select("id")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) {
      res.status(409).json({ success: false, message: "This service has changed. Refresh and try again." });
      return;
    }

    await writeAuditLog({
      actorId: user.id,
      action: "queue.service_progress_updated",
      entityType: "queue_entry_service",
      entityId: item.id,
      summary: `Updated service progress for ${item.id}.`,
      metadata: { hasUpdate: Boolean(message) },
    });
    res.json({ success: true, staffUpdate: message });
  } catch (error) {
    console.error("Service progress update failed:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Unable to update service progress.",
    });
  }
});

queueRouter.post("/service/:itemId/complete", async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ success: false, message: "You must be signed in." });
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("account_role, is_active")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile || !profile.is_active || !["staff", "admin"].includes(profile.account_role)) {
      res.status(403).json({ success: false, message: "Only active staff or administrators can complete a service." });
      return;
    }

    const { data: item, error: itemError } = await supabase
      .from("queue_entry_services")
      .select("id, status, assigned_staff_id")
      .eq("id", req.params.itemId)
      .maybeSingle();
    if (itemError) throw itemError;
    if (!item) {
      res.status(404).json({ success: false, message: "Service item not found." });
      return;
    }
    if (profile.account_role === "staff" && item.assigned_staff_id !== user.id) {
      res.status(403).json({ success: false, message: "Only the assigned staff member can complete this service." });
      return;
    }
    if (item.status !== "in_service") {
      res.status(409).json({ success: false, message: "Only an in-progress service can be completed." });
      return;
    }

    const { error: completeError } = await supabase.rpc("complete_service_item_and_update_entry", {
      p_item_id: item.id,
    });
    if (completeError) throw completeError;

    await writeAuditLog({
      actorId: user.id,
      action: "queue.service_completed",
      entityType: "queue_entry_service",
      entityId: item.id,
      summary: `Completed service ${item.id}.`,
    });
    res.json({ success: true });
  } catch (error) {
    console.error("Complete service failed:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Unable to complete service.",
    });
  }
});

queueRouter.post("/join", queueJoinRateLimit, async (req, res) => {
  const createdEntryIds: string[] = [];
  let createdPartyId: string | null = null;
  const rollbackCreatedParty = async () => {
    const supabase = getSupabaseAdmin();
    if (createdEntryIds.length > 0) {
      const { error } = await supabase.from("queue_entries").delete().in("id", createdEntryIds);
      if (error) throw error;
      createdEntryIds.length = 0;
    }
    if (createdPartyId) {
      const { error } = await supabase.from("queue_parties").delete().eq("id", createdPartyId);
      if (error) throw error;
      createdPartyId = null;
    }
  };
  try {
    if (req.body.privacyConsent !== true) {
      res.status(400).json({ success: false, message: "Please agree to the privacy notice before joining the queue." });
      return;
    }

    const marketingConsent = req.body.marketingConsent === true;
    let customerName = String(req.body.customerName ?? "").trim();
    let contactNumber = String(req.body.contactNumber ?? "").trim() || null;
    let customerAccountId: string | null = null;
    const user = await getAuthenticatedUser(req);
    if (user) {
      const { data: customerAccount, error: accountError } = await getSupabaseAdmin()
        .from("customer_accounts")
        .select("user_id, display_name, contact_number")
        .eq("user_id", user.id)
        .maybeSingle();
      if (accountError) throw accountError;
      if (customerAccount) {
        customerAccountId = customerAccount.user_id;
        customerName = customerAccount.display_name;
        contactNumber = customerAccount.contact_number;
      }
    }
    const additionalNotes = String(req.body.additionalNotes ?? "").trim();
    const preferredStaffId = String(req.body.preferredStaffId ?? "").trim() || null;
    const rawServiceIds: unknown = req.body.serviceIds;
    const serviceIds = Array.isArray(rawServiceIds) && rawServiceIds.every((id) => typeof id === "string")
      ? [...new Set(rawServiceIds)]
      : [];
    const rawPartyMembers: unknown = req.body.partyMembers;
    const mainServicePreferenceInput = parseServicePreferences(req.body.servicePreferences);
    const partyMembers = Array.isArray(rawPartyMembers)
      ? rawPartyMembers.map((member) => ({
        customerName: typeof member?.customerName === "string" ? member.customerName.trim() : "",
        serviceIds: Array.isArray(member?.serviceIds) && member.serviceIds.every((id: unknown) => typeof id === "string")
          ? [...new Set(member.serviceIds as string[])]
          : [],
        ...parseServicePreferences(member?.servicePreferences),
      }))
      : [];
    const isPartyJoin = partyMembers.length > 0;
    const packageId = typeof req.body.packageId === "string" && req.body.packageId ? req.body.packageId : null;
    let promotionId = typeof req.body.promotionId === "string" && req.body.promotionId ? req.body.promotionId : null;
    const source = req.body.source === "kiosk" ? "kiosk" : "qr_mobile";
    let arrivalType = req.body.arrivalType as ArrivalType;
    let priorityType = req.body.priorityType as PriorityType;
    const appointmentAt = req.body.appointmentAt ? String(req.body.appointmentAt) : null;
    let scheduledAppointmentAt: string | null = null;

    if (!customerName) {
      res.status(400).json({ success: false, message: "Please enter your name." });
      return;
    }
    if (!contactNumber) {
      res.status(400).json({ success: false, message: "Enter a mobile number so you can receive queue updates." });
      return;
    }
    if (contactNumber && !/^09\d{9}$/.test(contactNumber)) {
      res.status(400).json({
        success: false,
        message: "Enter a valid Philippine mobile number: 11 digits starting with 09.",
      });
      return;
    }
    if (!Array.isArray(rawServiceIds) || rawServiceIds.length === 0 || serviceIds.length === 0
      || serviceIds.some((id) => !UUID_PATTERN.test(id)) || serviceIds.length > 20) {
      res.status(400).json({ success: false, message: "Please select at least one service." });
      return;
    }
    if ((rawPartyMembers !== undefined && !Array.isArray(rawPartyMembers))
      || partyMembers.length > 7
      || partyMembers.some((member) => !member.customerName || member.customerName.length > 100
        || !member.valid || member.serviceIds.length === 0 || member.serviceIds.length > 20
        || member.serviceIds.some((id) => !UUID_PATTERN.test(id)))) {
      res.status(400).json({ success: false, message: "Enter a name and at least one valid service for each party member. Parties may contain up to 8 members." });
      return;
    }
    if (!mainServicePreferenceInput.valid) {
      res.status(400).json({ success: false, message: "Choose a valid stylist preference for each selected service." });
      return;
    }
    if ((preferredStaffId && !UUID_PATTERN.test(preferredStaffId))
      || (packageId && !UUID_PATTERN.test(packageId))
      || (promotionId && !UUID_PATTERN.test(promotionId))) {
      res.status(400).json({ success: false, message: "Refresh the catalog and select valid staff, package, and offer options." });
      return;
    }
    const mainServicePreferences = mainServicePreferenceInput.preferences.length > 0
      ? mainServicePreferenceInput.preferences
      : preferredStaffId
        ? serviceIds.map((serviceId) => ({ serviceId, staffId: preferredStaffId }))
        : [];
    const preferenceGroups = [
      { serviceIds, preferences: mainServicePreferences },
      ...partyMembers.map((member) => ({ serviceIds: member.serviceIds, preferences: member.preferences })),
    ];
    if (preferenceGroups.some(({ serviceIds: selectedIds, preferences }) => {
      const preferredServiceIds = new Set<string>();
      return preferences.some(({ serviceId, staffId }) => {
        if (!UUID_PATTERN.test(serviceId) || !UUID_PATTERN.test(staffId)
          || !selectedIds.includes(serviceId) || preferredServiceIds.has(serviceId)) return true;
        preferredServiceIds.add(serviceId);
        return false;
      });
    })) {
      res.status(400).json({ success: false, message: "Stylist preferences must reference a selected service exactly once." });
      return;
    }
    if (isPartyJoin && (packageId || promotionId)) {
      res.status(400).json({ success: false, message: "Packages and promotions are not available for party joins. Select services for each member." });
      return;
    }
    if (!ALLOWED_ARRIVAL.includes(arrivalType)) arrivalType = "walk_in";
    if (!ALLOWED_PRIORITY.includes(priorityType)) priorityType = "regular";
    if (arrivalType === "appointment" && !appointmentAt) {
      res.status(400).json({ success: false, message: "Choose an appointment date and time." });
      return;
    }

    const lateAppointment = isLateAppointment(appointmentAt);
    const effectiveArrival = resolveEffectiveArrival(arrivalType, lateAppointment);
    const status = resolveJoinStatus(arrivalType, lateAppointment);

    let notesForEntry = additionalNotes;
    if (arrivalType === "appointment" && appointmentAt) {
      const scheduled = new Date(appointmentAt);
      if (Number.isNaN(scheduled.getTime())) {
        res.status(400).json({ success: false, message: "Invalid appointment date or time." });
        return;
      }
      if (!lateAppointment && scheduled.getTime() <= Date.now()) {
        res.status(400).json({ success: false, message: "Appointment time must be in the future." });
        return;
      }
      const hour = scheduled.getHours();
      if (hour < APPOINTMENT_OPEN_HOUR || hour >= APPOINTMENT_CLOSE_HOUR) {
        res.status(400).json({
          success: false,
          message: "Appointments are available between 10:00 AM and 8:00 PM.",
        });
        return;
      }
      if (!lateAppointment) scheduledAppointmentAt = scheduled.toISOString();
      const appointmentLabel = scheduled.toLocaleString("en-PH", {
        dateStyle: "medium",
        timeStyle: "short",
      });
      notesForEntry = additionalNotes
        ? `[Appointment: ${appointmentLabel}] ${additionalNotes}`
        : `[Appointment: ${appointmentLabel}]`;
    }

    const supabase = getSupabaseAdmin();
    const allServiceIds = [...new Set([...serviceIds, ...partyMembers.flatMap((member) => member.serviceIds)])];
    const { data: services, error: servicesError } = await supabase
      .from("services")
      .select("id, name, category, price, duration_minutes, is_visible, is_available")
      .in("id", allServiceIds);

    if (servicesError) throw new Error(servicesError.message);
    const selected = (services ?? []).filter((s) => s.is_visible && s.is_available);
    if (selected.length !== allServiceIds.length) {
      res.status(400).json({ success: false, message: "One or more selected services are no longer available. Refresh the catalog and try again." });
      return;
    }

    const preferenceStaffIds = [...new Set(preferenceGroups.flatMap(({ preferences }) =>
      preferences.map((preference) => preference.staffId)
    ))];
    if (preferenceStaffIds.length > 0) {
      const [{ data: preferenceStaff, error: preferenceStaffError }, { data: preferenceStations, error: preferenceStationsError }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, account_role, staff_role, is_active")
          .in("id", preferenceStaffIds),
        supabase
          .from("stations")
          .select("home_staff_id, category")
          .in("home_staff_id", preferenceStaffIds)
          .eq("is_active", true),
      ]);
      if (preferenceStaffError) throw preferenceStaffError;
      if (preferenceStationsError) throw preferenceStationsError;
      const selectedById = new Map(selected.map((service) => [service.id, service]));
      const staffById = new Map((preferenceStaff ?? []).map((member) => [member.id, member]));
      const validPreferences = preferenceGroups.every(({ preferences }) => preferences.every(({ serviceId, staffId }) => {
        const preferredStaff = staffById.get(staffId);
        const service = selectedById.get(serviceId);
        const eligibleAccount = preferredStaff?.account_role === "staff"
          || (preferredStaff?.account_role === "admin" && preferredStaff.staff_role === "hairstylist");
        const staffStations = (preferenceStations ?? []).filter((station) => station.home_staff_id === staffId);
        return Boolean(preferredStaff?.is_active && eligibleAccount && preferredStaff.staff_role !== "receptionist"
          && service
          && (staffCanPerformCategory(preferredStaff.staff_role, service.category)
            || staffStations.some((station) => stationMatchesService(station.category, String(service.category ?? "")))));
      }));
      if (!validPreferences) {
        res.status(400).json({ success: false, message: "A selected stylist is no longer available or does not provide one of the selected services." });
        return;
      }
    }

    let selectedPackage: { id: string; price: number } | null = null;
    if (packageId) {
      const { data: packageData, error: packageError } = await supabase
        .from("service_packages")
        .select("id, title, price, package_type, is_active, service_package_items ( service_id, quantity )")
        .eq("id", packageId)
        .maybeSingle();
      if (packageError) throw packageError;
      const packageServices = packageData?.service_package_items ?? [];
      const packageServiceIds = packageServices.map((item) => item.service_id).sort();
      const requestedServiceIds = [...new Set(serviceIds)].sort();
      if (!packageData?.is_active || packageData.package_type !== "service_bundle"
        || packageServices.some((item) => item.quantity !== 1)
        || packageServiceIds.length !== requestedServiceIds.length
        || packageServiceIds.some((serviceId, index) => serviceId !== requestedServiceIds[index])) {
        res.status(400).json({ success: false, message: "That service package is no longer available. Refresh the catalog and try again." });
        return;
      }
      selectedPackage = { id: packageData.id, price: Number(packageData.price) };
    }

    if (promotionId) {
      const now = new Date().toISOString();
      const { data: promotion, error: promotionError } = await supabase
        .from("promotions")
        .select("id, eligible_service_ids, minimum_spend, maximum_discount, usage_limit, redemption_count, one_per_customer, exclude_packages")
        .eq("id", promotionId)
        .eq("is_active", true)
        .lte("start_date", now)
        .gte("end_date", now)
        .maybeSingle();
      if (promotionError) throw promotionError;
      if (!promotion) {
        res.status(400).json({ success: false, message: "That promotion is no longer active. Refresh the offers and try again." });
        return;
      }
      const ineligibilityReason = promotionIneligibilityReason(
        promotion,
        selected.map((service) => ({ id: service.id, price: Number(service.price || 0) })),
        selectedPackage?.price ?? null,
        contactNumber || null,
      );
      if (ineligibilityReason) {
        res.status(400).json({ success: false, message: ineligibilityReason });
        return;
      }
      if (promotion.usage_limit !== null) {
        if (promotion.redemption_count >= promotion.usage_limit) {
          promotionId = null;
        }
      }
      if (promotion.one_per_customer && contactNumber && promotionId) {
        const { data: priorRedemption, error: priorRedemptionError } = await supabase
          .from("promotion_redemptions")
          .select("id")
          .eq("promotion_id", promotionId)
          .eq("contact_number", contactNumber)
          .maybeSingle();
        if (priorRedemptionError) throw priorRedemptionError;
        if (priorRedemption) {
          promotionId = null;
        }
      }
    }

    const selectedById = new Map(selected.map((service) => [service.id, service]));
    const joinMembers = [
      {
        customerName,
        serviceIds,
        servicePreferences: mainServicePreferences,
        selectedServices: serviceIds.map((id) => selectedById.get(id)!),
      },
      ...partyMembers.map((member) => ({
        customerName: member.customerName,
        serviceIds: member.serviceIds,
        servicePreferences: member.preferences,
        selectedServices: member.serviceIds.map((id) => selectedById.get(id)!),
      })),
    ];

    if (isPartyJoin) {
      const { data: party, error: partyError } = await supabase
        .from("queue_parties")
        .insert({ contact_number: contactNumber, member_count: joinMembers.length })
        .select("id")
        .single();
      if (partyError) throw partyError;
      createdPartyId = party.id;
    }

    const partyEntries: {
      id: string;
      customer_name: string;
      ticket_number: number;
      contact_number: string | null;
      preferred_staff_id: string | null;
      priority_type: PriorityType;
      arrival_type: ArrivalType;
      appointment_at: string | null;
      status: string;
      estimated_duration: number;
      additional_notes: string | null;
      position: number | null;
      created_at: string;
      assigned_service_seat_labels: string[];
      wait: Awaited<ReturnType<typeof estimateEntryWait>>;
    }[] = [];
    for (const [memberIndex, member] of joinMembers.entries()) {
      const memberContactNumber = memberIndex === 0 ? contactNumber : null;
      const preferenceStaffIds = new Set(member.servicePreferences.map((preference) => preference.staffId));
      const memberPreferredStaffId = preferenceStaffIds.size === 1
        && member.servicePreferences.length === member.serviceIds.length
        ? member.servicePreferences[0].staffId
        : null;
      const totalDuration = member.selectedServices.reduce(
        (sum, service) => sum + Number(service.duration_minutes || 0),
        0,
      );
      const { data: queueEntry, error: queueError } = await supabase
        .from("queue_entries")
        .insert({
          customer_name: member.customerName,
          contact_number: memberContactNumber,
          customer_account_id: memberIndex === 0 ? customerAccountId : null,
          party_id: createdPartyId,
          join_channel: source === "kiosk" ? "kiosk" : "qr",
          preferred_staff_id: memberPreferredStaffId,
          priority_type: priorityType,
          service_package_id: selectedPackage?.id ?? null,
          promotion_id: promotionId,
          arrival_type: effectiveArrival,
          appointment_at: scheduledAppointmentAt,
          status,
          estimated_duration: totalDuration,
          additional_notes: notesForEntry || null,
          privacy_consent_at: new Date().toISOString(),
          privacy_notice_version: PRIVACY_NOTICE_VERSION,
          marketing_consent_at: marketingConsent ? new Date().toISOString() : null,
        })
        .select("id, ticket_number, customer_name, contact_number, preferred_staff_id, priority_type, arrival_type, appointment_at, status, estimated_duration, additional_notes, position, created_at")
        .single();

      if (queueError) {
        await rollbackCreatedParty();
        if (queueError.code === "23P01") {
          res.status(409).json({
            success: false,
            message: "That staff member already has an appointment at this time. Please choose a different time or staff member.",
          });
          return;
        }
        if (queueError.code === "23505") {
          res.status(409).json({
            success: false,
            message: "You already have an active queue entry with this contact number.",
          });
          return;
        }
        throw new Error(queueError.message || "Unable to join the queue.");
      }
      createdEntryIds.push(queueEntry.id);

      const queueServiceRows = member.selectedServices.map((service) => ({
        queue_entry_id: queueEntry.id,
        service_id: service.id,
        price: Number(service.price || 0),
        estimated_duration: Number(service.duration_minutes || 0),
        preferred_staff_id: member.servicePreferences.find((preference) => preference.serviceId === service.id)?.staffId ?? null,
      }));
      const { error: queueServicesError } = await supabase
        .from("queue_entry_services")
        .insert(queueServiceRows);
      if (queueServicesError) throw new Error("Unable to save the selected services.");

      if (memberContactNumber) {
        const { error: customerError } = await supabase
          .from("customer_records")
          .upsert({
            contact_number: memberContactNumber,
            display_name: member.customerName,
            updated_at: new Date().toISOString(),
          }, { onConflict: "contact_number" });
        if (customerError) throw new Error(`Unable to save customer details: ${customerError.message}`);
      }

      const { error: workstationError } = await supabase.rpc("assign_workstations_for_entry", {
        p_entry_id: queueEntry.id,
      });
      if (workstationError) throw new Error(`Unable to assign salon workstations: ${workstationError.message}`);

      const { error: customerSeatsError } = await supabase.rpc("assign_customer_service_seats_for_entry", {
        p_entry_id: queueEntry.id,
      });
      if (customerSeatsError) throw new Error(`Unable to assign customer service seats: ${customerSeatsError.message}`);

      const { data: assignedItems, error: assignedItemsError } = await supabase
        .from("queue_entry_services")
        .select("customer_service_seat_id")
        .eq("queue_entry_id", queueEntry.id);
      if (assignedItemsError) throw assignedItemsError;

      const serviceSeatIds = [...new Set((assignedItems ?? [])
        .map((item) => item.customer_service_seat_id)
        .filter((id): id is string => Boolean(id)))];
      const assignedSeatLabels: string[] = [];
      if (serviceSeatIds.length > 0) {
        const { data: assignedSeats, error: assignedSeatsError } = await supabase
          .from("customer_service_seats")
          .select("id, label")
          .in("id", serviceSeatIds);
        if (assignedSeatsError) throw assignedSeatsError;
        const labelsById = new Map((assignedSeats ?? []).map((seat) => [seat.id, seat.label]));
        for (const seatId of serviceSeatIds) {
          const label = labelsById.get(seatId);
          if (label) assignedSeatLabels.push(label);
        }
      }

      if (!isPartyJoin) createdEntryIds.length = 0;
      const wait = await estimateEntryWait(queueEntry.id, config.crowdThreshold);
      partyEntries.push({
        ...queueEntry,
        id: queueEntry.id,
        customer_name: queueEntry.customer_name,
        ticket_number: queueEntry.ticket_number,
        contact_number: queueEntry.contact_number,
        preferred_staff_id: queueEntry.preferred_staff_id,
        priority_type: queueEntry.priority_type,
        arrival_type: queueEntry.arrival_type,
        appointment_at: queueEntry.appointment_at,
        status: queueEntry.status,
        estimated_duration: queueEntry.estimated_duration,
        additional_notes: queueEntry.additional_notes,
        position: queueEntry.position,
        created_at: queueEntry.created_at,
        assigned_service_seat_labels: assignedSeatLabels,
        wait,
      });
    }

    const primaryEntry = partyEntries[0];
    const responsePartyId = createdPartyId;
    createdEntryIds.length = 0;
    createdPartyId = null;
    const { wait, ...entry } = primaryEntry;
    const sms = await enqueueQueueSmsOnce({
      entryId: primaryEntry.id,
      phone: contactNumber,
      customerName,
      milestone: "joined",
      extra: [
        `Ticket Q-${String(primaryEntry.ticket_number).padStart(3, "0")}, position ${primaryEntry.position ?? "pending"}.`,
        primaryEntry.assigned_service_seat_labels.length > 0
          ? `Service seat${primaryEntry.assigned_service_seat_labels.length > 1 ? "s" : ""}: ${primaryEntry.assigned_service_seat_labels.join(", ")}.`
          : "No service seat is available yet; please ask reception.",
        `Est. wait ~${wait.ewtMinutes} min.`,
      ].join(" "),
    });
    res.status(201).json({
      success: true,
      source,
      lateAppointment,
      entry,
      ...(responsePartyId ? { party: { id: responsePartyId, entries: partyEntries } } : {}),
      wait,
      sms,
    });
  } catch (error) {
    try {
      await rollbackCreatedParty();
    } catch (rollbackError) {
      console.error("Queue party rollback failed:", rollbackError);
    }
    console.error("Join queue failed:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Unable to join the queue.",
    });
  }
});

queueRouter.get("/no-show-risk", async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ success: false, message: "Sign in to view queue risk alerts." });
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("account_role, is_active")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.is_active || !["staff", "admin"].includes(profile.account_role)) {
      res.status(403).json({ success: false, message: "Active staff access is required to view queue risk alerts." });
      return;
    }

    const { data: entries, error: entriesError } = await supabase
      .from("queue_entries")
      .select("id, arrival_type, appointment_at, created_at, position, status")
      .eq("status", "waiting")
      .order("position", { ascending: true, nullsFirst: false });
    if (entriesError) throw entriesError;

    const now = Date.now();
    const walkIns = (entries ?? []).filter((entry) => entry.arrival_type !== "appointment");
    const waitEstimates = await Promise.all(walkIns.map(async (entry) => ({
      entry,
      wait: await estimateEntryWait(entry.id, config.crowdThreshold),
    })));
    const risk = new Map<string, string>();
    for (const entry of entries ?? []) {
      if (entry.arrival_type === "appointment" && entry.appointment_at) {
        if (now >= new Date(entry.appointment_at).getTime() + 10 * 60 * 1000) {
          risk.set(entry.id, "Appointment is at least 10 minutes late.");
        }
      }
    }
    for (const { entry, wait } of waitEstimates) {
      const elapsedMinutes = (now - new Date(entry.created_at).getTime()) / 60_000;
      if (elapsedMinutes >= wait.ewtMinutes + 15) {
        risk.set(entry.id, `Walk-in is more than 15 minutes past its predicted wait (${wait.ewtMinutes} min).`);
      }
    }
    res.json({
      success: true,
      risks: [...risk.entries()].map(([entryId, reason]) => ({ entryId, reason })),
    });
  } catch (error) {
    console.error("Queue no-show risk load failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to load queue risk alerts." });
  }
});

queueRouter.post("/:entryId/services", async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ success: false, message: "Sign in to add a service to the queue." });
      return;
    }
    const { entryId } = req.params;
    const serviceId = typeof req.body?.serviceId === "string" ? req.body.serviceId : "";
    if (!UUID_PATTERN.test(entryId) || !UUID_PATTERN.test(serviceId)) {
      res.status(400).json({ success: false, message: "Choose a valid queue entry and service." });
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("account_role, staff_role, is_active")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.is_active || !["staff", "admin"].includes(profile.account_role)) {
      res.status(403).json({ success: false, message: "Active staff access is required to add a service." });
      return;
    }

    const [{ data: entry, error: entryError }, { data: service, error: serviceError }] = await Promise.all([
      supabase.from("queue_entries")
        .select("id, customer_name, status, estimated_duration, preferred_staff_id, assigned_staff_id")
        .eq("id", entryId)
        .maybeSingle(),
      supabase.from("services")
        .select("id, name, category, price, duration_minutes, is_visible, is_available")
        .eq("id", serviceId)
        .maybeSingle(),
    ]);
    if (entryError) throw entryError;
    if (serviceError) throw serviceError;
    if (!entry || !["waiting", "in_service"].includes(entry.status)) {
      res.status(409).json({ success: false, message: "Services can only be added to an active queue entry." });
      return;
    }
    if (!service?.is_visible || !service.is_available) {
      res.status(400).json({ success: false, message: "That service is no longer available." });
      return;
    }

    if (profile.account_role === "staff" && profile.staff_role !== "receptionist") {
      const { data: assignments, error: assignmentError } = await supabase
        .from("queue_entry_services")
        .select("assigned_staff_id")
        .eq("queue_entry_id", entry.id);
      if (assignmentError) throw assignmentError;
      const ownsEntry = entry.preferred_staff_id === user.id
        || entry.assigned_staff_id === user.id
        || (assignments ?? []).some((item) => item.assigned_staff_id === user.id);
      const { data: stations, error: stationsError } = await supabase
        .from("stations")
        .select("category")
        .eq("home_staff_id", user.id)
        .eq("is_active", true);
      if (stationsError) throw stationsError;
      const canServe = staffCanPerformCategory(profile.staff_role, service.category)
        || (stations ?? []).some((station) => stationMatchesService(station.category, String(service.category ?? "")));
      if (!ownsEntry && !canServe) {
        res.status(403).json({ success: false, message: "You can only add services to a customer assigned to you or your station." });
        return;
      }
    }

    const duration = Number(service.duration_minutes || 0);
    const { data: item, error: insertError } = await supabase
      .from("queue_entry_services")
      .insert({
        queue_entry_id: entry.id,
        service_id: service.id,
        price: Number(service.price || 0),
        estimated_duration: duration,
        status: "pending",
        service_stage: "waiting",
      })
      .select("id, queue_entry_id, service_id, price, estimated_duration, status, service_stage")
      .single();
    if (insertError) throw insertError;

    const { error: durationError } = await supabase
      .from("queue_entries")
      .update({ estimated_duration: Number(entry.estimated_duration || 0) + duration })
      .eq("id", entry.id);
    if (durationError) {
      await supabase.from("queue_entry_services").delete().eq("id", item.id);
      throw durationError;
    }

    const [{ error: workstationError }, { error: seatError }] = await Promise.all([
      supabase.rpc("assign_workstations_for_entry", { p_entry_id: entry.id }),
      supabase.rpc("assign_customer_service_seats_for_entry", { p_entry_id: entry.id }),
    ]);
    if (workstationError || seatError) {
      await supabase.from("queue_entry_services").delete().eq("id", item.id);
      await supabase.from("queue_entries")
        .update({ estimated_duration: Number(entry.estimated_duration || 0) })
        .eq("id", entry.id);
      throw workstationError ?? seatError;
    }

    const wait = await estimateEntryWait(entry.id, config.crowdThreshold);
    await writeAuditLog({
      actorId: user.id,
      action: "queue.service_added",
      entityType: "queue_entry",
      entityId: entry.id,
      summary: `Added ${service.name} to ${entry.customer_name}'s queue entry.`,
      metadata: { serviceId: service.id, queueEntryServiceId: item.id, price: item.price },
    });
    res.status(201).json({ success: true, service: item, wait });
  } catch (error) {
    console.error("Queue service add failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to add service." });
  }
});

queueRouter.get("/:entryId", async (req, res) => {
  const { entryId } = req.params;
  if (!UUID_PATTERN.test(entryId)) {
    res.status(400).json({ success: false, message: "Invalid queue entry." });
    return;
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("queue_entries")
    .select("id, ticket_number, customer_name, status, position, estimated_duration, additional_notes, created_at, customer_service_seat_id, queue_entry_services ( id, status, service_stage, station_id, assigned_staff_id, customer_service_seat_id, staff_update, staff_updated_at, started_at, service_started_at, completed_at, services ( name ) )")
    .eq("id", entryId)
    .maybeSingle();

  if (error) {
    res.status(500).json({ success: false, message: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ success: false, message: "This queue entry could not be found." });
    return;
  }

  const stationIds = [...new Set((data.queue_entry_services ?? [])
    .map((item) => item.station_id)
    .filter((id): id is string => Boolean(id)))];
  const stationLabels = new Map<string, string>();
  if (stationIds.length > 0) {
    const { data: stations, error: stationsError } = await supabase
      .from("stations")
      .select("id, label")
      .in("id", stationIds);
    if (stationsError) {
      res.status(500).json({ success: false, message: stationsError.message });
      return;
    }
    for (const station of stations ?? []) stationLabels.set(station.id, station.label);
  }

  const serviceSeatIds = [...new Set((data.queue_entry_services ?? [])
    .map((item) => item.customer_service_seat_id)
    .filter((id): id is string => Boolean(id)))];
  const serviceSeatLabels = new Map<string, string>();
  if (serviceSeatIds.length > 0) {
    const { data: seats, error: seatsError } = await supabase
      .from("customer_service_seats")
      .select("id, label")
      .in("id", serviceSeatIds);
    if (seatsError) {
      res.status(500).json({ success: false, message: seatsError.message });
      return;
    }
    for (const seat of seats ?? []) serviceSeatLabels.set(seat.id, seat.label);
  }

  const assignedStaffIds = [...new Set((data.queue_entry_services ?? [])
    .map((item) => item.assigned_staff_id)
    .filter((id): id is string => Boolean(id)))];
  const staffNames = new Map<string, string>();
  if (assignedStaffIds.length > 0) {
    const { data: staffProfiles, error: staffProfilesError } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", assignedStaffIds);
    if (staffProfilesError) {
      res.status(500).json({ success: false, message: staffProfilesError.message });
      return;
    }
    for (const staffProfile of staffProfiles ?? []) {
      staffNames.set(staffProfile.id, staffProfile.full_name);
    }
  }

  const assignedServiceSeats = (data.queue_entry_services ?? []).map((item) => {
    const service = Array.isArray(item.services) ? item.services[0] : item.services;
    return {
      id: item.id,
      serviceName: service?.name ?? "Service",
      status: item.status,
      customerStage: item.service_stage,
      startedAt: item.service_started_at ?? item.started_at,
      completedAt: item.completed_at,
      staffUpdate: item.staff_update,
      staffUpdatedAt: item.staff_updated_at,
      staffStationLabel: item.station_id ? stationLabels.get(item.station_id) ?? null : null,
      assignedStaffName: item.assigned_staff_id ? staffNames.get(item.assigned_staff_id) ?? null : null,
      serviceSeatLabel: item.customer_service_seat_id
        ? serviceSeatLabels.get(item.customer_service_seat_id) ?? null
        : null,
    };
  });

  let peopleAhead: number | null = null;
  if (data.status === "waiting" && data.position !== null) {
    const { count } = await supabase
      .from("queue_entries")
      .select("id", { count: "exact", head: true })
      .eq("status", "waiting")
      .lt("position", data.position);
    peopleAhead = count ?? 0;
  }

  const wait = await estimateEntryWait(entryId, config.crowdThreshold);
  const { data: transaction, error: transactionError } = await supabase
    .from("pos_transactions")
    .select("subtotal, discount_amount, total_amount, payment_method, created_at, status, pos_transaction_items ( service_name, quantity )")
    .eq("queue_entry_id", entryId)
    .eq("status", "paid")
    .maybeSingle();
  if (transactionError) console.error("Queue receipt lookup failed:", transactionError.message);
  const receipt = transaction ? {
    subtotal: Number(transaction.subtotal),
    discountAmount: Number(transaction.discount_amount),
    totalAmount: Number(transaction.total_amount),
    paymentMethod: transaction.payment_method,
    paidAt: transaction.created_at,
    services: (transaction.pos_transaction_items ?? []).map((item) => ({
      name: item.service_name,
      quantity: item.quantity,
    })),
  } : null;
  res.json({
    success: true,
    entry: {
      ...data,
      assigned_service_seats: assignedServiceSeats,
      receipt,
      receiptUnavailable: Boolean(transactionError),
    },
    peopleAhead,
    wait,
  });
});

queueRouter.post("/:entryId/staff-cancel", async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ success: false, message: "Sign in to cancel this queue visit." });
      return;
    }

    const { entryId } = req.params;
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (!UUID_PATTERN.test(entryId) || !reason || reason.length > 240) {
      res.status(400).json({ success: false, message: "Choose a valid queue visit and provide a cancellation reason of 1 to 240 characters." });
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("account_role, staff_role, is_active")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.is_active || !["staff", "admin"].includes(profile.account_role)) {
      res.status(403).json({ success: false, message: "Active staff access is required to cancel a queue visit." });
      return;
    }

    const { data: entry, error: entryError } = await supabase
      .from("queue_entries")
      .select("id, customer_name, status, preferred_staff_id, assigned_staff_id")
      .eq("id", entryId)
      .maybeSingle();
    if (entryError) throw entryError;
    if (!entry) {
      res.status(404).json({ success: false, message: "This queue visit could not be found." });
      return;
    }
    if (entry.status !== "waiting") {
      res.status(409).json({ success: false, message: "Only a visit that is still waiting can be cancelled." });
      return;
    }

    if (profile.account_role === "staff" && profile.staff_role !== "receptionist") {
      const { data: services, error: servicesError } = await supabase
        .from("queue_entry_services")
        .select("preferred_staff_id, assigned_staff_id, services ( category )")
        .eq("queue_entry_id", entry.id);
      if (servicesError) throw servicesError;
      const canManageEntry = entry.preferred_staff_id === user.id
        || entry.assigned_staff_id === user.id
        || (services ?? []).some((service) => {
          const relation = Array.isArray(service.services) ? service.services[0] : service.services;
          return service.preferred_staff_id === user.id
            || service.assigned_staff_id === user.id
            || (typeof relation?.category === "string" && staffCanPerformCategory(profile.staff_role, relation.category));
        });
      if (!canManageEntry) {
        res.status(403).json({ success: false, message: "You can only cancel a visit assigned to you or for a service you handle." });
        return;
      }
    }

    const { error: cancelError } = await supabase.rpc("cancel_waiting_queue_entry", {
      p_entry_id: entry.id,
    });
    if (cancelError) {
      if (cancelError.code === "P0002") {
        res.status(404).json({ success: false, message: "This queue visit could not be found." });
        return;
      }
      if (cancelError.code === "23514") {
        res.status(409).json({ success: false, message: "Only a visit that is still waiting can be cancelled." });
        return;
      }
      if (cancelError.code === "PGRST202" || cancelError.code === "42883") {
        res.status(503).json({ success: false, message: "Queue cancellation is not installed. Apply the latest database migrations." });
        return;
      }
      throw cancelError;
    }

    await writeAuditLog({
      actorId: user.id,
      action: "queue.staff_cancelled",
      entityType: "queue_entry",
      entityId: entry.id,
      summary: `Staff cancelled ${entry.customer_name}'s queue visit. Reason: ${reason}`,
      metadata: { reason },
    });
    res.json({ success: true });
  } catch (error) {
    console.error("Staff queue cancellation failed:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Unable to cancel this queue visit.",
    });
  }
});

queueRouter.post("/:entryId/cancel", async (req, res) => {
  const { entryId } = req.params;
  if (!UUID_PATTERN.test(entryId)) {
    res.status(400).json({ success: false, message: "Invalid queue entry." });
    return;
  }

  try {
    const { error } = await getSupabaseAdmin().rpc("cancel_waiting_queue_entry", {
      p_entry_id: entryId,
    });
    if (error) {
      if (error.code === "P0002") {
        res.status(404).json({ success: false, message: "This queue entry could not be found." });
        return;
      }
      if (error.code === "23514") {
        res.status(409).json({ success: false, message: "Only a visit that is still waiting can be cancelled." });
        return;
      }
      if (error.code === "PGRST202" || error.code === "42883") {
        res.status(503).json({ success: false, message: "Queue cancellation is not installed. Apply the latest database migrations." });
        return;
      }
      throw error;
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Customer queue cancellation failed:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Unable to cancel this queue entry.",
    });
  }
});