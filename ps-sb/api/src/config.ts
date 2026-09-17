import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../.env.local") });
dotenv.config({ path: path.resolve(here, "../.env") });

export const config = {
  port: Number(process.env.PORT ?? 4000),
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  smsGatewayUrl: process.env.SMS_GATEWAY_URL ?? "",
  smsApiKey: process.env.SMS_API_KEY ?? "",
  crowdThreshold: Number(process.env.CROWD_THRESHOLD ?? 8),
  salonName: "Lyn & Co Salon and Spa",
};

export function assertConfig() {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY in ps-sb/api/.env.local");
  }
}
