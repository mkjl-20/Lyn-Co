import { supabaseClient } from "../../../shared/lib/supabaseClient";
import type { CreateStaffAccountPayload } from "../../../shared/types/auth.types";

export interface StaffAccountRow {
  id: string;
  username: string;
  fullName: string;
  staffRole: string | null;
  isActive: boolean;
}

export async function fetchStaffAccounts(): Promise<StaffAccountRow[]> {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, username, full_name, staff_role, is_active")
    .eq("account_role", "staff")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    staffRole: row.staff_role,
    isActive: row.is_active,
  }));
}

export async function createStaffAccount(payload: CreateStaffAccountPayload): Promise<void> {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  if (!accessToken) {
    throw new Error("No active session.");
  }

  const { data, error } = await supabaseClient.functions.invoke("create-staff", {
    body: payload,
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (error) {
    throw new Error(error.message ?? "Failed to create staff account.");
  }

  if (data?.error) {
    throw new Error(data.error);
  }
}