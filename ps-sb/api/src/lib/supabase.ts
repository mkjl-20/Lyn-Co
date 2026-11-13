import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config.js";

let client: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    const key = config.supabaseAnonKey;
    client = createClient(config.supabaseUrl, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return client;
}

export function createSupabaseAuthClient(): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function getSupabaseAdmin(): SupabaseClient {
  if (!config.supabaseServiceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in ps-sb/api/.env.local. Staff account creation requires the Supabase service-role key.");
  }

  if (!adminClient) {
    adminClient = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return adminClient;
}

export function getSupabaseForUser(accessToken: string): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
