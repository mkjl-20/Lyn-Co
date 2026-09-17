import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config.js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    const key = config.supabaseServiceRoleKey || config.supabaseAnonKey;
    client = createClient(config.supabaseUrl, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return client;
}
