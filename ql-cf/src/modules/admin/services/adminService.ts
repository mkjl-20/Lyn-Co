import { supabaseClient } from "../../../shared/lib/supabaseClient";
import { apiRequest } from "../../../shared/lib/apiClient";
import type { CreateStaffAccountPayload } from "../../../shared/types/auth.types";

export interface StaffAccountRow {
  id: string;
  username: string;
  fullName: string;
  staffRole: string | null;
  accountRole: "admin" | "staff";
  isActive: boolean;
}

export async function fetchStaffAccounts(): Promise<StaffAccountRow[]> {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, username, full_name, account_role, staff_role, is_active")
    .in("account_role", ["staff", "admin"])
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((row) => row.account_role === "staff"
      || (row.account_role === "admin" && row.staff_role === "hairstylist"))
    .map((row) => ({
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    staffRole: row.staff_role,
    accountRole: row.account_role,
    isActive: row.is_active,
  }));
}

export async function createStaffAccount(payload: CreateStaffAccountPayload): Promise<void> {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  if (!accessToken) {
    throw new Error("No active session.");
  }

  await apiRequest("/api/admin/staff", {
    method: "POST",
    body: JSON.stringify({
      username: payload.username,
      full_name: payload.fullName,
      staff_role: payload.staffRole,
      password: payload.temporaryPassword,
    }),
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}