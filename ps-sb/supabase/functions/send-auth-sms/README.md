# Supabase Auth OTP via iProgSMS

This Edge Function is a starting point for the Supabase **Send SMS Hook**. It
verifies Supabase's signed webhook request, forwards Supabase's OTP to iProgSMS,
and does not generate or verify a second code.

## iProgSMS request format

The `sendSms` function in `index.ts` sends a `POST` request to iProgSMS's regular
SMS endpoint with a JSON body containing `api_token`, `phone_number`, and
`message`. Configure `IPROGSMS_API_URL` as:

```text
https://www.iprogsms.com/api/v1/sms_messages
```

The function expects JSON success when `status` is `200` or `"success"`, as
documented by iProgSMS. Supabase generates and verifies its own OTP, so this
hook forwards that code using iProgSMS's regular SMS endpoint. Do not switch it
to iProgSMS's `/otp/send_otp` endpoint: that endpoint generates a separate OTP
that Supabase would not verify.

## Setup

1. In Supabase, enable customer phone sign-up and phone confirmations.
2. From the repository's `ps-sb` directory, link the Supabase CLI to the
   correct project if it is not already linked:

   ```powershell
   supabase link --project-ref <your-project-ref>
   ```

3. Configure the function secrets. Use the real endpoint and credentials from
   iProgSMS, but enter them only in your terminal/Supabase secrets:

   ```powershell
   supabase secrets set IPROGSMS_API_URL="https://www.iprogsms.com/api/v1/sms_messages"
   supabase secrets set IPROGSMS_API_KEY="<iprogsms-api-key>"
   ```

4. Deploy the hook function. JWT verification is disabled because Supabase Auth
   calls it as a webhook; the function verifies the Supabase Standard Webhooks
   signature instead:

   ```powershell
   supabase functions deploy send-auth-sms --no-verify-jwt
   ```

5. In **Supabase Dashboard → Authentication → Hooks → Send SMS Hook**, select
   the HTTP hook and enter:

   ```text
   https://<your-project-ref>.supabase.co/functions/v1/send-auth-sms
   ```

   Copy the signing secret from the hook configuration into the Function
   secret named `SEND_SMS_HOOK_SECRET`:

   ```powershell
   supabase secrets set SEND_SMS_HOOK_SECRET="<hook-signing-secret>"
   ```

   Deploy again if your project requires redeployment after changing secrets.
6. Test with a phone number you control. Check the Edge Function logs and
   iProgSMS delivery dashboard. Never log or share OTPs, API keys, or full
   provider responses.

The signing secret and iProgSMS API key are separate values. LynQ's browser
code continues to call Supabase Auth directly, and no secret belongs in
`ql-cf/.env.local` or a `VITE_` variable. Queue milestone SMS remains separate
and continues to use the API's `SMS_GATEWAY_URL` and `SMS_API_KEY`.
