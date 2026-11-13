import { Router } from "express";
import { createSupabaseAuthClient, getSupabaseAdmin } from "../lib/supabase.js";
import { bodyIdentityKey, rateLimit, requestIpKey } from "../middleware/rateLimit.js";
import { getAuthenticatedUser } from "./auth.js";

export const customerRouter = Router();

const CUSTOMER_ACCOUNT_PRIVACY_NOTICE_VERSION = "customer-account-v1";
const customerLoginRateLimit = rateLimit([
  { key: requestIpKey, limit: 30, windowMs: 15 * 60 * 1000 },
  { key: bodyIdentityKey("identifier"), limit: 10, windowMs: 15 * 60 * 1000 },
], "Too many sign-in attempts. Please try again later.");

async function getCustomerAccount(userId: string) {
  return getSupabaseAdmin()
    .from("customer_accounts")
    .select("user_id, display_name, contact_number, privacy_consent_at, privacy_notice_version")
    .eq("user_id", userId)
    .maybeSingle();
}

async function ensureCustomerUser(userId: string) {
  const supabase = getSupabaseAdmin();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("account_role")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (profile && profile.account_role !== "customer") return false;
  return true;
}

customerRouter.post("/login", customerLoginRateLimit, async (req, res) => {
  const identifier = typeof req.body?.identifier === "string" ? req.body.identifier.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
  const isPhone = /^\+639\d{9}$/.test(identifier);
  if ((!isEmail && !isPhone) || !password) {
    res.status(400).json({ success: false, message: "Enter a valid email address or Philippine mobile number and password." });
    return;
  }

  try {
    const auth = createSupabaseAuthClient();
    const { data, error } = await auth.auth.signInWithPassword(
      isEmail
        ? { email: identifier.toLowerCase(), password }
        : { phone: identifier, password },
    );
    if (error || !data.user || !data.session) {
      res.status(401).json({ success: false, message: "Invalid customer sign-in." });
      return;
    }

    const { data: profile, error: profileError } = await getSupabaseAdmin()
      .from("profiles")
      .select("account_role, is_active")
      .eq("id", data.user.id)
      .maybeSingle();
    if (profileError) throw profileError;

    const isCustomer = profile
      ? profile.account_role === "customer" && profile.is_active
      : data.user.user_metadata?.account_role === "customer";
    if (!isCustomer) {
      res.status(403).json({ success: false, message: "Staff and admin accounts must use the staff portal." });
      return;
    }

    res.json({ success: true, session: data.session });
  } catch (error) {
    console.error("Customer login failed:", error);
    res.status(500).json({ success: false, message: "Unable to process customer sign-in." });
  }
});

customerRouter.get("/account", async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ success: false, message: "Sign in to load your customer account." });
      return;
    }
    if (!await ensureCustomerUser(user.id)) {
      res.status(403).json({ success: false, message: "This account is not a customer account." });
      return;
    }
    const { data, error } = await getCustomerAccount(user.id);
    if (error) throw error;
    if (!data) {
      res.json({ success: true, account: null, privacyConsentRequired: true });
      return;
    }
    const privacyConsentRequired = data.privacy_notice_version !== CUSTOMER_ACCOUNT_PRIVACY_NOTICE_VERSION
      || !data.privacy_consent_at;
    res.json({
      success: true,
      account: privacyConsentRequired ? null : data,
      privacyConsentRequired,
    });
  } catch (error) {
    console.error("Customer account load failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to load customer account." });
  }
});

customerRouter.post("/account", async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ success: false, message: "Sign in to set up your customer account." });
      return;
    }
    if (!await ensureCustomerUser(user.id)) {
      res.status(403).json({ success: false, message: "This account is not a customer account." });
      return;
    }

    if (req.body?.privacyConsent !== true
      || req.body?.privacyNoticeVersion !== CUSTOMER_ACCOUNT_PRIVACY_NOTICE_VERSION) {
      res.status(400).json({ success: false, message: "Please review and accept the current customer-account privacy notice." });
      return;
    }

    const existing = await getCustomerAccount(user.id);
    if (existing.error) throw existing.error;
    if (existing.data) {
      const { data, error } = await getSupabaseAdmin()
        .from("customer_accounts")
        .update({
          privacy_consent_at: new Date().toISOString(),
          privacy_notice_version: CUSTOMER_ACCOUNT_PRIVACY_NOTICE_VERSION,
        })
        .eq("user_id", user.id)
        .select("user_id, display_name, contact_number, privacy_consent_at, privacy_notice_version")
        .single();
      if (error) throw error;
      res.json({ success: true, account: data });
      return;
    }

    const displayName = typeof req.body?.displayName === "string"
      ? req.body.displayName.trim()
      : typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";
    const contactNumber = typeof req.body?.contactNumber === "string"
      ? req.body.contactNumber.trim()
      : typeof user.user_metadata?.contact_number === "string" ? user.user_metadata.contact_number.trim() : "";
    if (!displayName || displayName.length > 100 || !/^09\d{9}$/.test(contactNumber)) {
      res.status(400).json({ success: false, message: "Enter your name and a valid Philippine mobile number." });
      return;
    }

    const { data, error } = await getSupabaseAdmin()
      .from("customer_accounts")
      .insert({
        user_id: user.id,
        display_name: displayName,
        contact_number: contactNumber,
        privacy_consent_at: new Date().toISOString(),
        privacy_notice_version: CUSTOMER_ACCOUNT_PRIVACY_NOTICE_VERSION,
      })
      .select("user_id, display_name, contact_number, privacy_consent_at, privacy_notice_version")
      .single();
    if (error) throw error;
    res.status(201).json({ success: true, account: data });
  } catch (error) {
    console.error("Customer account setup failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to set up customer account." });
  }
});

customerRouter.patch("/account", async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ success: false, message: "Sign in to update your customer account." });
      return;
    }
    if (!await ensureCustomerUser(user.id)) {
      res.status(403).json({ success: false, message: "This account is not a customer account." });
      return;
    }

    const displayName = typeof req.body?.displayName === "string" ? req.body.displayName.trim() : "";
    const contactNumber = typeof req.body?.contactNumber === "string" ? req.body.contactNumber.trim() : "";
    if (!displayName || displayName.length > 100 || !/^09\d{9}$/.test(contactNumber)) {
      res.status(400).json({ success: false, message: "Enter your name and a valid Philippine mobile number." });
      return;
    }
    const verifiedPhoneDigits = (user.phone ?? "").replace(/\D/g, "");
    const verifiedPhone = /^639\d{9}$/.test(verifiedPhoneDigits)
      ? `0${verifiedPhoneDigits.slice(2)}`
      : /^09\d{9}$/.test(verifiedPhoneDigits) ? verifiedPhoneDigits : "";
    if (verifiedPhone !== contactNumber) {
      res.status(403).json({ success: false, message: "Verify this mobile number before saving it to your profile." });
      return;
    }

    const existing = await getCustomerAccount(user.id);
    if (existing.error) throw existing.error;
    if (!existing.data
      || existing.data.privacy_notice_version !== CUSTOMER_ACCOUNT_PRIVACY_NOTICE_VERSION
      || !existing.data.privacy_consent_at) {
      res.status(403).json({ success: false, message: "Complete the current privacy notice before updating your account." });
      return;
    }

    const { data, error } = await getSupabaseAdmin()
      .from("customer_accounts")
      .update({ display_name: displayName, contact_number: contactNumber })
      .eq("user_id", user.id)
      .select("user_id, display_name, contact_number, privacy_consent_at, privacy_notice_version")
      .single();
    if (error) throw error;

    res.json({ success: true, account: data });
  } catch (error) {
    console.error("Customer account update failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to update customer account." });
  }
});

customerRouter.get("/transactions", async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ success: false, message: "Sign in to view your transaction history." });
      return;
    }
    if (!await ensureCustomerUser(user.id)) {
      res.status(403).json({ success: false, message: "This account is not a customer account." });
      return;
    }
    const account = await getCustomerAccount(user.id);
    if (account.error) throw account.error;
    if (!account.data
      || account.data.privacy_notice_version !== CUSTOMER_ACCOUNT_PRIVACY_NOTICE_VERSION
      || !account.data.privacy_consent_at) {
      res.status(403).json({ success: false, message: "Accept the current customer-account privacy notice to view transaction history." });
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data: entries, error: entriesError } = await supabase
      .from("queue_entries")
      .select("id")
      .eq("customer_account_id", user.id)
      .order("created_at", { ascending: false })
      .limit(500);
    if (entriesError) throw entriesError;
    const entryIds = (entries ?? []).map((entry) => entry.id);
    if (entryIds.length === 0) {
      res.json({ success: true, transactions: [] });
      return;
    }

    const { data: transactions, error: transactionsError } = await supabase
      .from("pos_transactions")
      .select("id, queue_entry_id, ticket_number, subtotal, discount_amount, total_amount, payment_method, status, created_at, pos_transaction_items ( service_name, quantity, unit_price )")
      .in("queue_entry_id", entryIds)
      .eq("status", "paid")
      .order("created_at", { ascending: false })
      .limit(100);
    if (transactionsError) throw transactionsError;
    res.json({ success: true, transactions: transactions ?? [] });
  } catch (error) {
    console.error("Customer transaction history load failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to load transaction history." });
  }
});
