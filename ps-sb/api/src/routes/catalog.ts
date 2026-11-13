import { Router } from "express";
import { fromDatabasePromotionDiscountType } from "../lib/promotionDiscount.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { getSalonSettings } from "../services/systemSettings.js";

export const catalogRouter = Router();

catalogRouter.get("/theme", async (_req, res) => {
  try {
    const settings = await getSalonSettings();
    res.json({
      success: true,
      themeColor: settings.themeColor,
      queueUrl: settings.queueUrl,
      logoDataUrl: settings.logoDataUrl,
      bannerDataUrl: settings.bannerDataUrl,
    });
  } catch (error) {
    console.error("Public theme load failed:", error);
    res.status(500).json({ success: false, message: "Unable to load the salon theme." });
  }
});

catalogRouter.get("/hours", async (_req, res) => {
  try {
    const { openingTime, closingTime } = await getSalonSettings();
    res.json({ success: true, openingTime, closingTime });
  } catch (error) {
    console.error("Public salon hours load failed:", error);
    res.status(500).json({ success: false, message: "Unable to load salon business hours." });
  }
});

function removeDuplicateServices<T extends { name: string; category: string | null }>(services: T[]): T[] {
  const seen = new Set<string>();
  return services.filter((service) => {
    const key = `${service.name.trim().toLocaleLowerCase()}::${(service.category ?? "Other").trim().toLocaleLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

catalogRouter.get("/services", async (_req, res) => {
  const { data, error } = await getSupabaseAdmin()
    .from("services")
    .select(
      "id, category, name, description, price, price_type, duration_minutes, is_visible, is_available, display_order"
    )
    .eq("is_visible", true)
    .eq("is_available", true)
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    res.status(500).json({ success: false, message: error.message });
    return;
  }

  res.json({ success: true, services: removeDuplicateServices(data ?? []) });
});

catalogRouter.get("/packages", async (_req, res) => {
  const { data, error } = await getSupabaseAdmin()
    .from("service_packages")
    .select("id, title, description, package_type, price, sessions_count, image_data_url, service_package_items ( service_id, quantity, services ( id, name, category, price, duration_minutes, is_visible, is_available ) )")
    .eq("is_active", true)
    .eq("package_type", "service_bundle")
    .order("created_at", { ascending: false });

  if (error) {
    res.status(500).json({ success: false, message: error.message });
    return;
  }

  const packages = (data ?? []).filter((packageItem) =>
    packageItem.service_package_items.length > 0
    && packageItem.service_package_items.every((item) => item.quantity === 1)
    && packageItem.service_package_items.every((item) => {
      const service = Array.isArray(item.services) ? item.services[0] : item.services;
      return service?.is_visible && service.is_available;
    })
  );
  res.json({ success: true, packages });
});

catalogRouter.get("/promotions", async (_req, res) => {
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from("promotions")
    .select("id, title:name, description, discount_type, discount_value, starts_at:start_date, ends_at:end_date, image_data_url, eligible_service_ids, minimum_spend, maximum_discount, usage_limit, redemption_count, one_per_customer, exclude_packages")
    .eq("is_active", true)
    .lte("start_date", now)
    .gte("end_date", now)
    .order("start_date", { ascending: false });

  if (error) {
    res.status(500).json({ success: false, message: error.message });
    return;
  }

  res.json({
    success: true,
    promotions: (data ?? [])
      .filter((promotion) => promotion.usage_limit === null || promotion.redemption_count < promotion.usage_limit)
      .map((promotion) => ({
      ...promotion,
      discount_type: fromDatabasePromotionDiscountType(promotion.discount_type),
      })),
  });
});

// Human-readable labels for the fixed staff_role enum values.
// No catalog table — this list is the single source of truth for display labels.
const STAFF_ROLE_LABELS: Record<string, string> = {
  hairstylist: "Hairstylist",
  nail_technician: "Nail Technician",
  manicurist: "Nail Technician",
  pedicurist: "Nail Technician",
  receptionist: "Receptionist",
};

catalogRouter.get("/staff", async (_req, res) => {
  const { data, error } = await getSupabaseAdmin()
    .from("profiles")
    .select("id, full_name, account_role, staff_role, is_active")
    .in("account_role", ["staff", "admin"])
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (error) {
    res.status(500).json({ success: false, message: error.message });
    return;
  }

  const staff = (data ?? [])
    .filter((profile) => profile.staff_role !== "receptionist"
      && (profile.account_role === "staff"
        || (profile.account_role === "admin" && profile.staff_role === "hairstylist")))
    .map((profile) => ({
      ...profile,
      staff_role_label: profile.account_role === "admin"
        ? "Manager / Hairstylist"
        : STAFF_ROLE_LABELS[profile.staff_role ?? ""] ?? profile.staff_role,
      service_lane: profile.staff_role === "hairstylist" ? "hair"
        : ["nail_technician", "manicurist", "pedicurist"].includes(profile.staff_role ?? "") ? "nails" : "other",
    }));

  res.json({ success: true, staff });
});