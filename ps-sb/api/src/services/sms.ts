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
  | "service_completed";

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
    `Hi ${name}, ${extra ?? "Your service is complete."} You can now proceed to the front desk for payment. Thank you for choosing ${salonName}.`,
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

  if (!config.smsApiKey || !config.smsGatewayUrl) {
    console.info("[sms:stub]", { to: input.phone, milestone: input.milestone, body });
    return { sent: false, reason: "gateway_not_configured" as const };
  }

  const response = await fetch(config.smsGatewayUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      api_token: config.smsApiKey,
      phone_number: input.phone,
      message: body,
    }),
  });

  const responseBody = await response.text();
  if (!response.ok) {
    throw new Error(`SMS gateway error (${response.status}): ${responseBody.slice(0, 300)}`);
  }

  let gatewayResult: unknown;
  try {
    gatewayResult = JSON.parse(responseBody);
  } catch {
    throw new Error(`SMS gateway returned an invalid response (${response.status}).`);
  }
  if (!gatewayResult || typeof gatewayResult !== "object") {
    throw new Error("SMS gateway returned an unexpected response.");
  }

  const result = gatewayResult as Record<string, unknown>;
  if (result.status !== 200 && result.status !== "success") {
    const detail = typeof result.message === "string" ? `: ${result.message}` : "";
    throw new Error(`SMS gateway rejected the message${detail}`);
  }

  return { sent: true as const };
}
