import { config } from "../config.js";
import { getSupabase } from "../lib/supabase.js";

export type Milestone = "joined" | "almost_your_turn" | "your_turn";

const MESSAGES: Record<Milestone, (name: string, extra?: string) => string> = {
  joined: (name, extra) =>
    `Hi ${name}, you have joined the Lyn & Co queue. ${extra ?? ""}`.trim(),
  almost_your_turn: (name) =>
    `Hi ${name}, you are almost next at Lyn & Co Salon and Spa.`,
  your_turn: (name) =>
    `Hi ${name}, it's your turn at Lyn & Co Salon and Spa. Please proceed.`,
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

  const body = MESSAGES[input.milestone](input.customerName, input.extra);

  const supabase = getSupabase();
  const { error } = await supabase.from("notifications").insert({
    channel: "sms",
    recipient: input.phone,
    milestone: input.milestone,
    body,
    status: config.smsApiKey && config.smsGatewayUrl ? "queued" : "logged",
  });
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

  return { sent: true as const };
}
