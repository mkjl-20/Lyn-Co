import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

type SmsHookEvent = {
  user?: { phone?: string };
  sms?: { otp?: string };
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sendSms(phone: string, otp: string) {
  const smsApiUrl = Deno.env.get("IPROGSMS_API_URL");
  const smsApiKey = Deno.env.get("IPROGSMS_API_KEY");
  if (!smsApiUrl || !smsApiKey) {
    throw new Error("SMS provider configuration is incomplete.");
  }

  // Supabase generates and verifies this OTP, so deliver it through iProgSMS's
  // regular SMS endpoint rather than asking iProgSMS to generate a second OTP.
  const response = await fetch(smsApiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_token: smsApiKey,
      phone_number: phone,
      message: `Your LynQ verification code is ${otp}.`,
    }),
  });

  if (!response.ok) {
    throw new Error(`SMS provider returned HTTP ${response.status}.`);
  }

  const responseText = await response.text();
  let result: Record<string, unknown>;
  try {
    result = JSON.parse(responseText) as Record<string, unknown>;
  } catch {
    throw new Error("SMS provider returned a non-JSON response.");
  }

  if (result.status !== 200 && result.status !== "success") {
    throw new Error("SMS provider did not confirm the request.");
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse(405, { error: { message: "Method not allowed." } });
  }

  const hookSecret = Deno.env.get("SEND_SMS_HOOK_SECRET");
  if (!hookSecret) {
    console.error("SMS hook configuration is incomplete.");
    return jsonResponse(500, { error: { message: "SMS delivery is not configured." } });
  }

  let event: SmsHookEvent;
  try {
    const payload = await request.text();
    const signingSecret = hookSecret.replace(/^v1,whsec_/, "");
    event = new Webhook(signingSecret).verify(
      payload,
      Object.fromEntries(request.headers),
    ) as SmsHookEvent;
  } catch (error) {
    console.error("SMS hook signature verification failed:", error);
    return jsonResponse(401, { error: { message: "Invalid hook signature." } });
  }

  const phone = event.user?.phone;
  const otp = event.sms?.otp;
  if (!phone || !otp || !/^\d{6}$/.test(otp)) {
    return jsonResponse(400, { error: { message: "The SMS hook payload is invalid." } });
  }

  try {
    await sendSms(phone, otp);
    return jsonResponse(200, {});
  } catch (error) {
    console.error("OTP delivery request failed:", error);
    return jsonResponse(502, { error: { message: "Unable to deliver the verification code." } });
  }
});
