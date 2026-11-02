import { getSupabaseAdmin } from "../lib/supabase.js";
import { config } from "../config.js";

export interface SalonSettings {
  salonName: string;
  contactNumber: string;
  address: string;
  openingTime: string;
  closingTime: string;
  crowdThreshold: number;
  queueUrl: string;
  themeColor: ThemeColor;
  logoDataUrl: string;
}

export type ThemeColor = "monochrome" | "rose" | "sage" | "ocean" | "plum" | "lavender" | "forest" | "midnight";

export const DEFAULT_SALON_SETTINGS: SalonSettings = {
  salonName: "Lyn & Co Salon and Spa",
  contactNumber: "",
  address: "",
  openingTime: "09:00",
  closingTime: "21:00",
  crowdThreshold: config.crowdThreshold,
  queueUrl: "",
  themeColor: "monochrome",
  logoDataUrl: "",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSalonSettings(value: unknown): SalonSettings {
  if (!isRecord(value)) return DEFAULT_SALON_SETTINGS;
  return {
    salonName: typeof value.salonName === "string" ? value.salonName : DEFAULT_SALON_SETTINGS.salonName,
    contactNumber: typeof value.contactNumber === "string" ? value.contactNumber : "",
    address: typeof value.address === "string" ? value.address : "",
    openingTime: typeof value.openingTime === "string" ? value.openingTime : DEFAULT_SALON_SETTINGS.openingTime,
    closingTime: typeof value.closingTime === "string" ? value.closingTime : DEFAULT_SALON_SETTINGS.closingTime,
    crowdThreshold: typeof value.crowdThreshold === "number" && Number.isInteger(value.crowdThreshold)
      ? value.crowdThreshold
      : DEFAULT_SALON_SETTINGS.crowdThreshold,
    queueUrl: typeof value.queueUrl === "string" ? value.queueUrl : "",
    themeColor: isThemeColor(value.themeColor) ? value.themeColor : DEFAULT_SALON_SETTINGS.themeColor,
    logoDataUrl: isLogoDataUrl(value.logoDataUrl) ? value.logoDataUrl : "",
  };
}

function isLogoDataUrl(value: unknown): value is string {
  if (value === "") return true;
  if (typeof value !== "string") return false;
  const match = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  return Boolean(match && Buffer.byteLength(match[1], "base64") <= 375_000);
}

export function isThemeColor(value: unknown): value is ThemeColor {
  return value === "monochrome" || value === "rose" || value === "sage" || value === "ocean" || value === "plum"
    || value === "lavender" || value === "forest" || value === "midnight";
}

export async function getSalonSettings(): Promise<SalonSettings> {
  const { data, error } = await getSupabaseAdmin()
    .from("system_settings")
    .select("value")
    .eq("key", "salon_settings")
    .maybeSingle();
  if (error) throw new Error(`Unable to load salon settings: ${error.message}`);
  return parseSalonSettings(data?.value);
}

export async function getCrowdThreshold(): Promise<number> {
  return (await getSalonSettings()).crowdThreshold;
}

export function validateSalonSettings(value: unknown): SalonSettings | null {
  if (!isRecord(value)) return null;
  const { salonName, contactNumber, address, openingTime, closingTime, crowdThreshold, queueUrl, themeColor, logoDataUrl } = value;
  const validTime = (time: unknown): time is string =>
    typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  const validQueueUrl = (url: unknown): url is string => {
    if (typeof url !== "string" || url.length > 300) return false;
    if (!url.trim()) return true;
    try {
      const parsed = new URL(url);
      return (parsed.protocol === "http:" || parsed.protocol === "https:")
        && Boolean(parsed.hostname)
        && !parsed.username
        && !parsed.password;
    } catch {
      return false;
    }
  };
  if (typeof salonName !== "string" || !salonName.trim() || salonName.trim().length > 100
    || typeof contactNumber !== "string" || contactNumber.trim().length > 40
    || typeof address !== "string" || address.trim().length > 240
    || !validTime(openingTime) || !validTime(closingTime) || openingTime >= closingTime
    || typeof crowdThreshold !== "number" || !Number.isInteger(crowdThreshold)
    || crowdThreshold < 1 || crowdThreshold > 1000
    || !validQueueUrl(queueUrl)
    || !isThemeColor(themeColor)
    || !isLogoDataUrl(logoDataUrl)) {
    return null;
  }
  return {
    salonName: salonName.trim(),
    contactNumber: contactNumber.trim(),
    address: address.trim(),
    openingTime,
    closingTime,
    crowdThreshold,
    queueUrl: queueUrl.trim().replace(/\/+$/, ""),
    themeColor,
    logoDataUrl,
  };
}
