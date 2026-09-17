import { supabaseClient } from "../../../shared/lib/supabaseClient";
import type { LoginCredentials, UserProfile } from "../../../shared/types/auth.types";

const INTERNAL_EMAIL_DOMAIN = "@lynq.internal";

export async function signInWithUsername(credentials: LoginCredentials): Promise<UserProfile> {
  const internalEmail = `${credentials.username}${INTERNAL_EMAIL_DOMAIN}`;

  const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
    email: internalEmail,
    password: credentials.password,
  });

  if (authError || !authData.user) {
    throw new Error("Invalid username or password.");
  }

  return fetchCurrentUserProfile(authData.user.id);
}

export async function fetchCurrentUserProfile(userId: string): Promise<UserProfile> {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, username, full_name, account_role, staff_role, is_active")
    .eq("id", userId)
    .single();

  if (error || !data) {
    throw new Error("Failed to load user profile.");
  }

  if (!data.is_active) {
    await supabaseClient.auth.signOut();
    throw new Error("This account has been deactivated.");
  }

  return {
    id: data.id,
    username: data.username,
    fullName: data.full_name,
    accountRole: data.account_role,
    staffRole: data.staff_role,
    isActive: data.is_active,
  };
}

export async function signOut(): Promise<void> {
  const { error } = await supabaseClient.auth.signOut();
  if (error) throw new Error("Failed to sign out.");
}