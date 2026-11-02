import { config } from "../config.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { getSalonSettings } from "./systemSettings.js";

export type Milestone =
  | "joined"
  | "almost_your_turn"
  | "your_turn"
  | "admin_reordered"
  | "staff_reassigned"
  | "service_progress"
  | "service_started"
  | "service_completed"
  | "visit_completed";

const MESSAGES: Record<Milestone, (name: string, salonName: string, extra?: string) => string> = {
  joined: (name, salonName, extra) =>
    `Hi ${name}, you have joined the ${salonName} queue. ${extra ?? ""}`.trim(),
  almost_your_turn: (name, salonName, extra) =>
    `Hi ${name}, you are almost next at ${salonName}. ${extra ?? ""}`.trim(),
  your_turn: (name, salonName, extra) =>
    `Hi ${name}, it's your turn at ${salonName}. ${extra ?? "Please proceed."}`.trim(),
  admin_reordered: (name, salonName, extra) =>
    `Hi ${name}, your queue position at ${salonName} has changed. ${extra ?? "Please check your updated ticket position."}`.trim(),
  staff_reassigned: (name, salonName, extra) =>
    `Hi ${name}, your service assignment at ${salonName} has changed. ${extra ?? "Please check with reception for details."}`.trim(),
  service_progress: (name, salonName, extra) =>
    `Hi ${name}, here's an update on your service at ${salonName}: ${extra ?? "Your service is in progress."}`,
  service_started: (name, salonName, extra) =>
    `Hi ${name}, your service at ${salonName} has started. ${extra ?? ""}`.trim(),
  service_completed: (name, salonName, extra) =>
    `Hi ${name}, ${extra ?? "Your service is complete."} Thank you for choosing ${salonName}.`,
  visit_completed: (name, salonName, extra) =>
    `Hi ${name}, your visit at ${salonName} is complete. ${extra ?? "Please proceed to the cashier for checkout."}`,
};

export async function sendQueueSms(input: {
  phone: string | null;
  customerName: string;
  milestone: Milestone;
  extra?: string;
}) {
  if (!input.phone) {
    return { sent: false, reason: "guest_no_phone" as const };
  }

  const salonName = (await getSalonSettings()).salonName;
  const body = MESSAGES[input.milestone](input.customerName, salonName, input.extra);

  const supabase = getSupabaseAdmin();
  const { data: notification, error } = await supabase.from("notifications").insert({
    channel: "sms",
    recipient: input.phone,
    milestone: input.milestone,
    body,
    status: config.smsApiKey && config.smsGatewayUrl ? "queued" : "logged",
  }).select("id").maybeSingle();
  if (error) {
    console.warn("notifications insert skipped:", error.message);
  }

  if (!config.smsApiKey || !config.smsGatewayUrl) {
    console.info("[sms:stub]", { to: input.phone, milestone: input.milestone, body });
    return { sent: false, reason: "gateway_not_configured" as const };
  }

  const response = await fetch(config.smsGatewayUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.smsApiKey}`,
    },
    body: JSON.stringify({ to: input.phone, message: body }),
  });

  if (!response.ok) {
    throw new Error(`SMS gateway error (${response.status})`);
  }

  if (notification?.id) {
    const { error: updateError } = await supabase
      .from("notifications")
      .update({ status: "sent" })
      .eq("id", notification.id);
    if (updateError) console.error("Queue notification status update failed:", updateError.message);
  }

  return { sent: true as const };
}
