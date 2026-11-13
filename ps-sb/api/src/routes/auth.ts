import { Router, type Request } from "express";
import { createSupabaseAuthClient, getSupabase, getSupabaseAdmin } from "../lib/supabase.js";
import { config } from "../config.js";
import { writeAuditLog } from "../lib/auditLog.js";
import { bodyIdentityKey, rateLimit, requestIpKey } from "../middleware/rateLimit.js";

export const authRouter = Router();

const loginRateLimit = rateLimit([
  { key: requestIpKey, limit: 30, windowMs: 15 * 60 * 1000 },
  { key: bodyIdentityKey("username"), limit: 10, windowMs: 15 * 60 * 1000 },
], "Too many sign-in attempts. Please try again later.");

const passwordResetRateLimit = rateLimit([
  { key: requestIpKey, limit: 10, windowMs: 60 * 60 * 1000 },
  { key: bodyIdentityKey("email"), limit: 3, windowMs: 60 * 60 * 1000 },
], "Too many password reset requests. Please try again later.");

export async function getAuthenticatedUser(req: Request) {
  const authorization = req.headers.authorization;
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";

  if (!token) return null;

  const { data, error } = await getSupabase().auth.getUser(token);
  return error ? null : data.user;
}

authRouter.post("/login", loginRateLimit, async (req, res) => {
  const username = typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!username || !password) {
    res.status(400).json({ success: false, message: !username ? "Username is required." : "Password is required." });
    return;
  }

  try {
    const supabase = getSupabase();
    let canonicalUsername = username;

    if (!username.includes("@")) {
      const { data: profiles, error: profileLookupError } = await getSupabaseAdmin()
        .from("profiles")
        .select("username, account_role, is_active, must_change_password")
        .eq("is_active", true);
      if (profileLookupError) throw profileLookupError;
      const normalized = username.replace(/(\D)0+(\d)/, "$1$2");
      const profile = (profiles ?? []).find((candidate) => {
        const candidateUsername = String(candidate.username).toLowerCase();
        return candidateUsername === username || candidateUsername.replace(/(\D)0+(\d)/, "$1$2") === normalized;
      });
      if (profile) {
        canonicalUsername = String(profile.username).toLowerCase();
      }
    }

    const emailCandidates = canonicalUsername.includes("@")
      ? [canonicalUsername]
      : [`${canonicalUsername}@lynq.internal`, canonicalUsername];
    let data: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>["data"] = { user: null, session: null };
    let error: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>["error"] = null;

    for (const email of emailCandidates) {
      const result = await supabase.auth.signInWithPassword({ email, password });
      if (!result.error && result.data.user) {
        data = result.data;
        error = null;
        break;
      }
      error = result.error;
    }

    if (error || !data.user?.email) {
      res.status(401).json({ success: false, message: "Invalid username or password." });
      return;
    }

    const { data: profileData, error: profileError } = await getSupabaseAdmin()
      .from("profiles")
      .select("id, username, full_name, account_role, staff_role, is_active, must_change_password")
      .eq("id", data.user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profileData
      || !profileData.is_active
      || (profileData.account_role !== "staff" && profileData.account_role !== "admin")) {
      res.status(401).json({ success: false, message: "Invalid username or password." });
      return;
    }

    const accountRole = profileData.account_role;
    await writeAuditLog({
      actorId: data.user.id,
      action: "auth.login",
      entityType: "session",
      entityId: data.user.id,
      summary: `${profileData.full_name ?? canonicalUsername} signed in.`,
      metadata: { username: profileData.username, accountRole },
    });
    res.json({
      success: true,
      accountRole,
      profile: {
        id: data.user.id,
        username: profileData.username,
        full_name: profileData.full_name ?? canonicalUsername,
        account_role: accountRole,
        staff_role: profileData.staff_role,
        is_active: profileData.is_active,
        must_change_password: profileData.must_change_password,
      },
      session: data.session,
    });
  } catch (error) {
    console.error("Login error:", error);
    const auditFailed = error instanceof Error && error.message.startsWith("Unable to record audit event");
    res.status(500).json({
      success: false,
      message: auditFailed
        ? "Unable to record sign-in activity. Please retry or contact an administrator."
        : "Unable to process login.",
    });
  }
});

authRouter.post("/password-reset", passwordResetRateLimit, async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ success: false, message: "Enter a valid email address." });
    return;
  }

  try {
    if (!config.webAppUrl) {
      res.status(503).json({ success: false, message: "Password reset is not configured. Set WEB_APP_URL in the API environment." });
      return;
    }
    const redirectTo = new URL("/customer-account", config.webAppUrl).toString();
    const { error } = await createSupabaseAuthClient().auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
    res.json({
      success: true,
      message: "If an account exists for that email, a password reset link will be sent.",
    });
  } catch (error) {
    console.error("Password reset request failed:", error);
    res.status(500).json({ success: false, message: "Unable to process the password reset request." });
  }
});

authRouter.post("/logout", async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ success: false, message: "You must be signed in." });
      return;
    }

    const { data: profile, error } = await getSupabaseAdmin()
      .from("profiles")
      .select("username, full_name")
      .eq("id", user.id)
      .maybeSingle();
    if (error) throw error;

    if (!profile) {
      console.warn(`Logout audit skipped: no staff profile exists for authenticated user ${user.id}.`);
      res.json({ success: true, auditRecorded: false });
      return;
    }

    await writeAuditLog({
      actorId: user.id,
      action: "auth.logout",
      entityType: "session",
      entityId: user.id,
      summary: `${profile.full_name ?? profile.username} signed out.`,
      metadata: { username: profile.username },
    });
    res.json({ success: true });
  } catch (error) {
    console.error("Logout audit failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to record logout." });
  }
});

authRouter.patch("/profile", async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ success: false, message: "You must be signed in." });
      return;
    }

    const fullName = typeof req.body?.fullName === "string" ? req.body.fullName.trim() : "";
    if (!fullName || fullName.length > 120) {
      res.status(400).json({ success: false, message: "Enter a name between 1 and 120 characters." });
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data: profile, error } = await supabase
      .from("profiles")
      .update({ full_name: fullName })
      .eq("id", user.id)
      .select("id, username, full_name, account_role, staff_role, is_active, must_change_password")
      .maybeSingle();
    if (error) throw error;
    if (!profile) {
      res.status(404).json({ success: false, message: "Account profile was not found." });
      return;
    }

    await writeAuditLog({
      actorId: user.id,
      action: "profile.updated",
      entityType: "profile",
      entityId: user.id,
      summary: `Updated account profile for ${profile.full_name}.`,
      metadata: { fullName: profile.full_name },
    });
    res.json({ success: true, profile });
  } catch (error) {
    console.error("Profile update failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to update profile." });
  }
});

authRouter.post("/change-password", async (req, res) => {
  const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
  const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";

  if (!currentPassword || !newPassword) {
    res.status(400).json({ success: false, message: "Current and new passwords are required." });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ success: false, message: "New password must be at least 8 characters." });
    return;
  }
  if (currentPassword === newPassword) {
    res.status(400).json({ success: false, message: "New password must be different from the current password." });
    return;
  }

  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ success: false, message: "You must be signed in." });
      return;
    }

    if (!user.email) {
      res.status(400).json({ success: false, message: "The account has no email address to verify." });
      return;
    }

    const { error: verificationError } = await createSupabaseAuthClient().auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (verificationError) {
      res.status(400).json({ success: false, message: "Current password is incorrect." });
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, username, full_name, must_change_password")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) {
      res.status(403).json({ success: false, message: "Account profile was not found." });
      return;
    }

    const { error: passwordError } = await getSupabaseAdmin().auth.admin.updateUserById(user.id, { password: newPassword });
    if (passwordError) {
      res.status(400).json({ success: false, message: passwordError.message });
      return;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", user.id);
    if (updateError) throw updateError;

    await writeAuditLog({
      actorId: user.id,
      action: "auth.password_changed",
      entityType: "profile",
      entityId: user.id,
      summary: `Password changed for ${profile.full_name ?? profile.username}.`,
      metadata: { username: profile.username },
    });
    res.json({ success: true, message: "Password changed successfully." });
  } catch (error) {
    console.error("Change password error:", error);
    const message = error instanceof Error ? error.message : "Unable to change password.";
    res.status(message.includes("SUPABASE_SERVICE_ROLE_KEY") ? 503 : 500).json({ success: false, message });
  }
});