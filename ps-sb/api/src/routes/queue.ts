import { Router } from "express";
import { getSupabase } from "../lib/supabase.js";
import { estimateEntryWait } from "../services/forecast.js";
import { sendQueueSms } from "../services/sms.js";
import {
  isLateAppointment,
  resolveEffectiveArrival,
  resolveJoinStatus,
  type ArrivalType,
  type PriorityType,
} from "../services/queueRules.js";
import { config } from "../config.js";

export const queueRouter = Router();

const ALLOWED_PRIORITY: PriorityType[] = ["regular", "senior", "pwd"];
const ALLOWED_ARRIVAL: ArrivalType[] = ["walk_in", "appointment"];

queueRouter.post("/join", async (req, res) => {
  try {
    const customerName = String(req.body.customerName ?? "").trim();
    const contactNumber = String(req.body.contactNumber ?? "").trim() || null;
    const additionalNotes = String(req.body.additionalNotes ?? "").trim();
    const preferredStaffId = String(req.body.preferredStaffId ?? "").trim() || null;
    const serviceIds = Array.isArray(req.body.serviceIds) ? req.body.serviceIds.map(String) : [];
    const source = req.body.source === "kiosk" ? "kiosk" : "qr_mobile";
    let arrivalType = req.body.arrivalType as ArrivalType;
    let priorityType = req.body.priorityType as PriorityType;
    const appointmentAt = req.body.appointmentAt ? String(req.body.appointmentAt) : null;

    if (!customerName) {
      res.status(400).json({ success: false, message: "Please enter your name." });
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
      if (hour < 9 || hour >= 19) {
        res.status(400).json({ success: false, message: "Appointments are available between 9:00 AM and 7:00 PM." });
        return;
      }
      const appointmentLabel = scheduled.toLocaleString("en-PH", {
        dateStyle: "medium",
        timeStyle: "short",
      });
      notesForEntry = additionalNotes
        ? `[Appointment: ${appointmentLabel}] ${additionalNotes}`
        : `[Appointment: ${appointmentLabel}]`;
    }

    const supabase = getSupabase();
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
        preferred_staff_id: preferredStaffId,
        priority_type: priorityType,
        arrival_type: effectiveArrival,
        status,
        estimated_duration: totalDuration,
        additional_notes: notesForEntry || null,
      })
      .select("id, customer_name, contact_number, preferred_staff_id, priority_type, arrival_type, status, estimated_duration, additional_notes, position, created_at")
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

    const wait = await estimateEntryWait(queueEntry.id, config.crowdThreshold);
    const sms = await sendQueueSms({
      phone: contactNumber,
      customerName,
      milestone: "joined",
      extra: `Ticket ${queueEntry.position ?? "pending"}. Est. wait ~${wait.ewtMinutes} min.`,
    });

    res.status(201).json({
      success: true,
      source,
      lateAppointment,
      entry: queueEntry,
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
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("queue_entries")
    .select("id, customer_name, status, position, estimated_duration, additional_notes, created_at, contact_number")
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
  res.json({ success: true, entry: data, peopleAhead, wait });
});

queueRouter.post("/:entryId/cancel", async (req, res) => {
  const { entryId } = req.params;
  const { error } = await getSupabase()
    .from("queue_entries")
    .update({ status: "cancelled", position: null })
    .eq("id", entryId);

  if (error) {
    res.status(500).json({ success: false, message: error.message });
    return;
  }

  res.json({ success: true });
});
