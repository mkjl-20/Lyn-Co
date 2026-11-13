import { Router } from "express";
import { getSupabase, getSupabaseAdmin } from "../lib/supabase.js";
import { getAuthenticatedUser } from "./auth.js";

export const staffRouter = Router();
const ALLOWED_ROLES = ["hairstylist", "manicurist", "pedicurist", "receptionist"] as const;

async function writeStaffAudit(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  actorId: string,
  action: string,
  staffId: string,
  summary: string,
  metadata: Record<string, unknown> = {},
) {
  const { error } = await supabase.from("admin_audit_logs").insert({
    actor_user_id: actorId,
    action,
    entity_type: "staff",
    entity_id: staffId,
    summary,
    metadata,
  });
  if (error) throw error;
}

staffRouter.post("/", async (req, res) => {
  const { username, password, full_name: fullName, staff_role: staffRole } = req.body ?? {};

  if (typeof username !== "string" || !username.trim()) {
    res.status(400).json({ success: false, message: "Username is required." });
    return;
  }
  if (typeof password !== "string" || password.length < 6) {
    res.status(400).json({ success: false, message: "Password must be at least 6 characters." });
    return;
  }
  if (typeof fullName !== "string" || !fullName.trim()) {
    res.status(400).json({ success: false, message: "Full name is required." });
    return;
  }
  if (!ALLOWED_ROLES.includes(staffRole)) {
    res.status(400).json({ success: false, message: "Invalid staff role." });
    return;
  }

  const cleanUsername = username.trim().toLowerCase();
  const cleanFullName = fullName.trim();
  const supabase = getSupabase();

  try {
    const adminSupabase = getSupabaseAdmin();
    const caller = await getAuthenticatedUser(req);
    if (!caller) {
      res.status(401).json({ success: false, message: "You must be signed in as an administrator." });
      return;
    }

    const { data: callerProfile, error: callerProfileError } = await supabase
      .from("profiles")
      .select("account_role")
      .eq("id", caller.id)
      .maybeSingle();
    if (callerProfileError) throw callerProfileError;
    if (callerProfile?.account_role !== "admin") {
      res.status(403).json({ success: false, message: "Only administrators can create staff accounts." });
      return;
    }

    const { data: existingProfile, error: usernameError } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", cleanUsername)
      .maybeSingle();

    if (usernameError) throw usernameError;
    if (existingProfile) {
      res.status(409).json({ success: false, message: "Username is already taken." });
      return;
    }

    const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
      email: `${cleanUsername}@lynq.internal`,
      password,
      email_confirm: true,
      user_metadata: { username: cleanUsername, full_name: cleanFullName, account_role: "staff", staff_role: staffRole, must_change_password: true },
    });

    if (authError || !authData.user) {
      res.status(400).json({ success: false, message: authError?.message ?? "Authentication user was not created." });
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .insert({ id: authData.user.id, username: cleanUsername, full_name: cleanFullName, account_role: "staff", staff_role: staffRole, is_active: true, must_change_password: true })
      .select("id, username, full_name, account_role, staff_role, is_active")
      .single();

    if (profileError) {
      await adminSupabase.auth.admin.deleteUser(authData.user.id);
      throw profileError;
    }

    await writeStaffAudit(adminSupabase, caller.id, "staff.created", profile.id, `Created staff account for ${cleanFullName}.`, { username: cleanUsername, staffRole });
    res.status(201).json({ success: true, message: "Staff account created successfully.", staff: profile });
  } catch (error) {
    console.error("Create staff error:", error);
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    const status = message.includes("SUPABASE_SERVICE_ROLE_KEY") ? 503 : 500;
    res.status(status).json({ success: false, message });
  }
});

staffRouter.patch("/:staffId", async (req, res) => {
  try {
    const caller = await getAuthenticatedUser(req);
    if (!caller) {
      res.status(401).json({ success: false, message: "You must be signed in as an administrator." });
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data: callerProfile, error: callerProfileError } = await supabase
      .from("profiles")
      .select("account_role, is_active")
      .eq("id", caller.id)
      .maybeSingle();
    if (callerProfileError) throw callerProfileError;
    if (!callerProfile?.is_active || callerProfile.account_role !== "admin") {
      res.status(403).json({ success: false, message: "Only active administrators can update staff accounts." });
      return;
    }

    const { full_name: fullName, staff_role: staffRole, is_active: isActive } = req.body ?? {};
    const updates: Record<string, string | boolean> = {};
    if (fullName !== undefined) {
      if (typeof fullName !== "string" || !fullName.trim() || fullName.trim().length > 120) {
        res.status(400).json({ success: false, message: "Enter a staff name between 1 and 120 characters." });
        return;
      }
      updates.full_name = fullName.trim();
    }
    if (staffRole !== undefined) {
      if (typeof staffRole !== "string" || !ALLOWED_ROLES.includes(staffRole as typeof ALLOWED_ROLES[number])) {
        res.status(400).json({ success: false, message: "Choose a valid staff role." });
        return;
      }
      updates.staff_role = staffRole;
    }
    if (isActive !== undefined) {
      if (typeof isActive !== "boolean") {
        res.status(400).json({ success: false, message: "Staff account status must be active or inactive." });
        return;
      }
      updates.is_active = isActive;
    }
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ success: false, message: "Provide a name, role, or account status to update." });
      return;
    }

    const { data: staff, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", req.params.staffId)
      .eq("account_role", "staff")
      .select("id, username, full_name, account_role, staff_role, is_active")
      .maybeSingle();
    if (error) throw error;
    if (!staff) {
      res.status(404).json({ success: false, message: "Staff account not found." });
      return;
    }

    const action = isActive !== undefined ? "staff.status_updated" : "staff.updated";
    const summary = isActive !== undefined
      ? `${isActive ? "Activated" : "Deactivated"} staff account for ${staff.full_name}.`
      : `Updated staff account for ${staff.full_name}.`;
    await writeStaffAudit(supabase, caller.id, action, staff.id, summary, updates);
    res.json({ success: true, staff });
  } catch (error) {
    console.error("Staff account update failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to update staff account." });
  }
});