import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../.env.local") });
dotenv.config({ path: path.resolve(here, "../.env") });
// Keep local development compatible with the shared workspace env file.
dotenv.config({ path: path.resolve(here, "../../../ql-cf/.env.local") });

export const config = {
  port: Number(process.env.PORT ?? 4000),
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  webAppUrl: process.env.WEB_APP_URL ?? "",
  smsGatewayUrl: process.env.SMS_GATEWAY_URL ?? "",
  smsApiKey: process.env.SMS_API_KEY ?? "",
  crowdThreshold: Number(process.env.CROWD_THRESHOLD ?? 8),
  backupDirectory: process.env.LYNQ_BACKUP_DIR?.trim() ?? "",
  backupTime: process.env.LYNQ_BACKUP_TIME ?? "20:30",
  backupTimeZone: process.env.LYNQ_BACKUP_TIME_ZONE ?? "Asia/Manila",
  salonName: "Lyn & Co Salon and Spa",
};

export function assertConfig() {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(config.backupTime)) {
    throw new Error("LYNQ_BACKUP_TIME must use 24-hour HH:mm format, for example 20:30.");
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: config.backupTimeZone });
  } catch {
    throw new Error("LYNQ_BACKUP_TIME_ZONE must be a valid IANA timezone, for example Asia/Manila.");
  }

  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY in ps-sb/api/.env.local");
  }
  if (process.env.NODE_ENV === "production") {
    if (!config.webAppUrl) {
      throw new Error("Missing WEB_APP_URL; production CORS requires an explicit web application origin.");
    }
    if (!config.supabaseServiceRoleKey) {
      throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY; production API routes require server-side Supabase access.");
    }
    if (!config.webAppUrl.startsWith("https://") || !config.supabaseUrl.startsWith("https://")) {
      throw new Error("Production WEB_APP_URL and SUPABASE_URL must use HTTPS.");
    }
  }
}
