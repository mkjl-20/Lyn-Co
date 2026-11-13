import { config } from "../config.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { estimateEntryWait } from "./forecast.js";
import { isMissingTable } from "./staffAvailability.js";
import { sendQueueSms, type Milestone } from "./sms.js";

interface QueuedMilestone {
  id: string;
  queue_entry_id: string;
  milestone: "joined" | "almost_your_turn" | "your_turn" | "admin_reordered" | "staff_reassigned" | "service_completed";
  recipient: string;
  customer_name: string;
  extra: string | null;
  event_key: string | null;
  attempts: number;
}

let processing = false;

export async function enqueueQueueSmsOnce(input: {
  entryId: string;
  phone: string | null;
  customerName: string;
  milestone: "joined" | "almost_your_turn" | "your_turn" | "admin_reordered" | "staff_reassigned" | "service_completed";
  extra?: string;
  eventKey?: string;
}) {
  if (!input.phone) return { sent: false, reason: "guest_no_phone" as const };

  try {
    if (!config.smsApiKey || !config.smsGatewayUrl) {
      return await sendQueueSms({
        phone: input.phone,
        customerName: input.customerName,
        milestone: input.milestone,
        extra: input.extra,
      });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("queue_sms_outbox")
      .insert({
        queue_entry_id: input.entryId,
        milestone: input.milestone,
        recipient: input.phone,
        customer_name: input.customerName,
        extra: input.extra ?? null,
        event_key: input.eventKey ?? null,
      })
      .select("id")
      .maybeSingle();

    if (error?.code === "23505") return { sent: false, reason: "already_queued" as const };
    if (error && isMissingTable(error, "queue_sms_outbox")) {
      console.warn(`queue_sms_outbox is unavailable; skipping ${input.milestone} SMS to prevent duplicate sends.`);
      return { sent: false as const, reason: "outbox_unavailable" as const };
    }
    if (error) throw new Error(`Unable to queue SMS milestone: ${error.message}`);
    if (!data) return { sent: false, reason: "already_queued" as const };

    await processQueueNotifications();
    return { sent: true as const, queued: true as const };
  } catch (error) {
    console.error("Queue SMS enqueue failed:", error);
    return { sent: false, reason: "enqueue_failed" as const };
  }
}

async function deliverPendingMessages() {
  if (!config.smsApiKey || !config.smsGatewayUrl) return;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("queue_sms_outbox")
    .select("id, queue_entry_id, milestone, recipient, customer_name, extra, event_key, attempts")
    .eq("status", "pending")
    .lt("attempts", 5)
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) throw new Error(`Unable to load queued SMS messages: ${error.message}`);

  for (const message of (data ?? []) as QueuedMilestone[]) {
    const attempts = message.attempts + 1;
    try {
      const result = await sendQueueSms({
        phone: message.recipient,
        customerName: message.customer_name,
        milestone: message.milestone as Milestone,
        extra: message.extra ?? undefined,
      });
      if (!result.sent) continue;

      const { error: updateError } = await supabase
        .from("queue_sms_outbox")
        .update({ status: "sent", attempts, sent_at: new Date().toISOString(), last_error: null })
        .eq("id", message.id)
        .eq("status", "pending");
      if (updateError) throw new Error(`Unable to mark SMS as sent: ${updateError.message}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "SMS delivery failed.";
      const { error: updateError } = await supabase
        .from("queue_sms_outbox")
        .update({
          status: attempts >= 5 ? "failed" : "pending",
          attempts,
          last_error: detail.slice(0, 500),
        })
        .eq("id", message.id)
        .eq("status", "pending");
      if (updateError) {
        console.error("Queue SMS retry state update failed:", updateError.message);
      }
      console.error("Queue SMS delivery failed:", detail);
    }
  }
}

async function enqueueNearTurnMessages() {
  if (!config.smsApiKey || !config.smsGatewayUrl) return;

  const supabase = getSupabaseAdmin();
  const { data: entries, error } = await supabase
    .from("queue_entries")
    .select("id, ticket_number, customer_name, contact_number, position")
    .eq("status", "waiting")
    .not("contact_number", "is", null)
    .lte("position", 4)
    .order("position", { ascending: true, nullsFirst: false });
  if (error) throw new Error(`Unable to check near-turn queue positions: ${error.message}`);

  await Promise.all((entries ?? []).map(async (entry) => {
    if (entry.position === null) return;
    const clientsAhead = Math.max(0, Number(entry.position) - 1);
    if (clientsAhead < 1 || clientsAhead > 3) return;

    const wait = await estimateEntryWait(entry.id, config.crowdThreshold);
    await enqueueQueueSmsOnce({
      entryId: entry.id,
      phone: entry.contact_number,
      customerName: entry.customer_name,
      milestone: "almost_your_turn",
      extra: `You are ${clientsAhead} clients away. Est. wait ${Math.max(0, Math.round(wait.ewtMinutes))} mins. Ticket Q-${String(entry.ticket_number).padStart(3, "0")}.`,
    });
  }));
}

export async function processQueueNotifications() {
  if (processing) return;
  processing = true;
  try {
    await deliverPendingMessages();
    await enqueueNearTurnMessages();
    await deliverPendingMessages();
  } finally {
    processing = false;
  }
}
