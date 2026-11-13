import { Router } from "express";
import { getSupabase, getSupabaseAdmin } from "../lib/supabase.js";
import { getAuthenticatedUser } from "./auth.js";
import { estimateEntryWait } from "../services/forecast.js";
import { sendQueueSms } from "../services/sms.js";
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

export const queueRouter = Router();

const ALLOWED_PRIORITY: PriorityType[] = ["regular", "senior", "pwd"];
const ALLOWED_ARRIVAL: ArrivalType[] = ["walk_in", "appointment"];

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

queueRouter.post("/service/:itemId/start", async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ success: false, message: "You must be signed in." });
      return;
    }

    const supabase = getSupabaseAdmin();
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
      .select("id, service_id, status, assigned_staff_id, services ( category ), queue_entries ( customer_name, contact_number, preferred_staff_id, assigned_staff_id )")
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
    if (!assignedStaff || !assignedStaff.is_active || assignedStaff.account_role !== "staff"
      || assignedStaff.staff_role === "receptionist") {
      res.status(403).json({ success: false, message: "That staff member is not eligible for this service." });
      return;
    }

    const requestedStationId = typeof req.body?.stationId === "string" ? req.body.stationId : null;
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
    const explicitlyAssigned = item.assigned_staff_id === user.id
      || entry?.preferred_staff_id === user.id
      || entry?.assigned_staff_id === user.id;
    if (callerProfile.account_role === "staff"
      && !explicitlyAssigned
      && !hasMatchingStaffStation) {
      res.status(403).json({ success: false, message: "This customer is not assigned to you." });
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
      const serviceCategory = String(service?.category ?? "");
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
      const { error: startError } = await supabase.rpc("start_service_item_and_release_lounge_seat", {
        p_item_id: item.id,
        p_station_id: station.id,
        p_staff_id: staffId,
      });
      if (!startError) {
        assignedStation = station;
        break;
      }
      if (startError.code === "23514") {
        res.status(409).json({
          success: false,
          message: "This customer already has a service in progress. Finish it before starting another service.",
        });
        return;
      }
      if (startError.code !== "23505" && startError.code !== "23P01") throw startError;
    }

    if (!assignedStation) {
      res.status(409).json({ success: false, message: "No free station is available for this service." });
      return;
    }

    const sms = await sendQueueSms({
      phone: entry?.contact_number ?? null,
      customerName: entry?.customer_name ?? "there",
      milestone: "your_turn",
      extra: `Please proceed to ${assignedStation.label}.`,
    });

    res.json({ success: true, station: assignedStation.label, sms });
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

    const { data: item, error: itemError } = await supabase
      .from("queue_entry_services")
      .select("id, status, service_stage, assigned_staff_id, services ( category ), queue_entries ( preferred_staff_id, assigned_staff_id )")
      .eq("id", req.params.itemId)
      .maybeSingle();
    if (itemError) throw itemError;
    if (!item) {
      res.status(404).json({ success: false, message: "Service item not found." });
      return;
    }
    const entry = Array.isArray(item.queue_entries) ? item.queue_entries[0] : item.queue_entries;
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
      const explicitlyAssigned = item.assigned_staff_id === user.id
        || entry?.preferred_staff_id === user.id
        || entry?.assigned_staff_id === user.id;
      if (!explicitlyAssigned && !assignedToStation) {
        res.status(403).json({ success: false, message: "This customer is not assigned to you." });
        return;
      }
    }
    if (item.service_stage === "called") {
      res.json({ success: true, serviceStage: "called" });
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

    res.json({ success: true, serviceStage: "called" });
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

    res.json({ success: true });
  } catch (error) {
    console.error("Complete service failed:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Unable to complete service.",
    });
  }
});

queueRouter.post("/join", async (req, res) => {
  try {
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
    const serviceIds = Array.isArray(req.body.serviceIds) ? req.body.serviceIds.map(String) : [];
    const source = req.body.source === "kiosk" ? "kiosk" : "qr_mobile";
    let arrivalType = req.body.arrivalType as ArrivalType;
    let priorityType = req.body.priorityType as PriorityType;
    const appointmentAt = req.body.appointmentAt ? String(req.body.appointmentAt) : null;
    let scheduledAppointmentAt: string | null = null;

    if (!customerName) {
      res.status(400).json({ success: false, message: "Please enter your name." });
      return;
    }
    if (contactNumber && !/^09\d{9}$/.test(contactNumber)) {
      res.status(400).json({
        success: false,
        message: "Enter a valid Philippine mobile number: 11 digits starting with 09.",
      });
      return;
    }
    if (serviceIds.length === 0) {
      res.status(400).json({ success: false, message: "Please select at least one service." });
      return;
    }
    if (!ALLOWED_ARRIVAL.includes(arrivalType)) arrivalType = "walk_in";
    if (!ALLOWED_PRIORITY.includes(priorityType)) priorityType = "regular";

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
    const { data: services, error: servicesError } = await supabase
      .from("services")
      .select("id, name, price, duration_minutes, is_visible, is_available")
      .in("id", serviceIds);

    if (servicesError) throw new Error(servicesError.message);
    const selected = (services ?? []).filter((s) => s.is_visible && s.is_available);
    if (selected.length === 0) {
      res.status(400).json({ success: false, message: "The selected services are no longer available." });
      return;
    }

    const totalDuration = selected.reduce((sum, s) => sum + Number(s.duration_minutes || 0), 0);

    const { data: queueEntry, error: queueError } = await supabase
      .from("queue_entries")
      .insert({
        customer_name: customerName,
        contact_number: contactNumber,
        customer_account_id: customerAccountId,
        join_channel: source === "kiosk" ? "kiosk" : "qr",
        preferred_staff_id: preferredStaffId,
        priority_type: priorityType,
        arrival_type: effectiveArrival,
        appointment_at: scheduledAppointmentAt,
        status,
        estimated_duration: totalDuration,
        additional_notes: notesForEntry || null,
      })
      .select("id, ticket_number, customer_name, contact_number, preferred_staff_id, priority_type, arrival_type, appointment_at, status, estimated_duration, additional_notes, position, created_at")
      .single();

    if (queueError) {
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

    const queueServiceRows = selected.map((service) => ({
      queue_entry_id: queueEntry.id,
      service_id: service.id,
      price: Number(service.price || 0),
      estimated_duration: Number(service.duration_minutes || 0),
    }));

    const { error: queueServicesError } = await supabase
      .from("queue_entry_services")
      .insert(queueServiceRows);

    if (queueServicesError) {
      await supabase.from("queue_entries").delete().eq("id", queueEntry.id);
      throw new Error("Unable to save the selected services.");
    }

    if (contactNumber) {
      const { error: customerError } = await supabase
        .from("customer_records")
        .upsert({
          contact_number: contactNumber,
          display_name: customerName,
          updated_at: new Date().toISOString(),
        }, { onConflict: "contact_number" });
      if (customerError) {
        await supabase.from("queue_entries").delete().eq("id", queueEntry.id);
        throw new Error(`Unable to save customer details: ${customerError.message}`);
      }
    }

    const { error: workstationError } = await supabase.rpc("assign_workstations_for_entry", {
      p_entry_id: queueEntry.id,
    });
    if (workstationError) {
      await supabase.from("queue_entries").delete().eq("id", queueEntry.id);
      throw new Error(`Unable to assign salon workstations: ${workstationError.message}`);
    }

    const { error: customerSeatsError } = await supabase.rpc("assign_customer_service_seats_for_entry", {
      p_entry_id: queueEntry.id,
    });
    if (customerSeatsError) {
      await supabase.from("queue_entries").delete().eq("id", queueEntry.id);
      throw new Error(`Unable to assign customer service seats: ${customerSeatsError.message}`);
    }

    const { data: loungeSeatLabel, error: loungeSeatError } = await supabase.rpc(
      "assign_waiting_seat",
      { p_entry_id: queueEntry.id }
    );
    if (loungeSeatError) {
      await supabase.from("queue_entries").delete().eq("id", queueEntry.id);
      throw loungeSeatError;
    }

    const { data: assignedItems, error: assignedItemsError } = await supabase
      .from("queue_entry_services")
      .select("customer_service_seat_id")
      .eq("queue_entry_id", queueEntry.id);
    if (assignedItemsError) {
      await supabase.from("queue_entries").delete().eq("id", queueEntry.id);
      throw assignedItemsError;
    }

    const serviceSeatIds = [...new Set((assignedItems ?? [])
      .map((item) => item.customer_service_seat_id)
      .filter((id): id is string => Boolean(id)))];
    const assignedSeatLabels: string[] = [];
    if (serviceSeatIds.length > 0) {
      const { data: assignedSeats, error: assignedSeatsError } = await supabase
        .from("customer_service_seats")
        .select("id, label")
        .in("id", serviceSeatIds);
      if (assignedSeatsError) {
        await supabase.from("queue_entries").delete().eq("id", queueEntry.id);
        throw assignedSeatsError;
      }
      const labelsById = new Map((assignedSeats ?? []).map((seat) => [seat.id, seat.label]));
      for (const seatId of serviceSeatIds) {
        const label = labelsById.get(seatId);
        if (label) assignedSeatLabels.push(label);
      }
    }

    const wait = await estimateEntryWait(queueEntry.id, config.crowdThreshold);
    const sms = await sendQueueSms({
      phone: contactNumber,
      customerName,
      milestone: "joined",
      extra: [
        `Ticket ${queueEntry.position ?? "pending"}.`,
        loungeSeatLabel ? `Lounge seat: ${loungeSeatLabel}.` : "No lounge seat is available yet; please ask reception.",
        assignedSeatLabels.length > 0
          ? `Service seat${assignedSeatLabels.length > 1 ? "s" : ""}: ${assignedSeatLabels.join(", ")}.`
          : "No service seat is available yet; please ask reception.",
        `Est. wait ~${wait.ewtMinutes} min.`,
      ].join(" "),
    });

    res.status(201).json({
      success: true,
      source,
      lateAppointment,
      entry: {
        ...queueEntry,
        waiting_seat_label: loungeSeatLabel,
        assigned_service_seat_labels: assignedSeatLabels,
      },
      wait,
      sms,
    });
  } catch (error) {
    console.error("Join queue failed:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Unable to join the queue.",
    });
  }
});

queueRouter.get("/:entryId", async (req, res) => {
  const { entryId } = req.params;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("queue_entries")
    .select("id, ticket_number, customer_name, status, position, estimated_duration, additional_notes, created_at, contact_number, waiting_seat_id, customer_service_seat_id, queue_entry_services ( id, status, service_stage, station_id, customer_service_seat_id, staff_update, staff_updated_at, started_at, service_started_at, completed_at, services ( name ) )")
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

  let loungeSeatLabel: string | null = null;
  if (data.waiting_seat_id) {
    const { data: loungeSeat, error: loungeSeatError } = await supabase
      .from("waiting_seats")
      .select("label")
      .eq("id", data.waiting_seat_id)
      .maybeSingle();
    if (loungeSeatError) {
      res.status(500).json({ success: false, message: loungeSeatError.message });
      return;
    }
    loungeSeatLabel = loungeSeat?.label ?? null;
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
  res.json({
    success: true,
    entry: {
      ...data,
      lounge_seat_label: loungeSeatLabel,
      assigned_service_seats: assignedServiceSeats,
    },
    peopleAhead,
    wait,
  });
});

queueRouter.post("/:entryId/cancel", async (req, res) => {
  const { entryId } = req.params;
  const { error } = await getSupabaseAdmin()
    .from("queue_entries")
    .update({ status: "cancelled", position: null })
    .eq("id", entryId);

  if (error) {
    res.status(500).json({ success: false, message: error.message });
    return;
  }

  res.json({ success: true });
});