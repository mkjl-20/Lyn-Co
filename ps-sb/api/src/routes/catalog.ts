import { Router } from "express";
import { getSupabase } from "../lib/supabase.js";

export const catalogRouter = Router();

catalogRouter.get("/services", async (_req, res) => {
  const { data, error } = await getSupabase()
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

  res.json({ success: true, services: data ?? [] });
});

catalogRouter.get("/staff", async (_req, res) => {
  const { data, error } = await getSupabase()
    .from("profiles")
    .select("id, full_name, staff_role, is_active")
    .eq("account_role", "staff")
    .eq("is_active", true)
    .neq("staff_role", "receptionist")
    .order("full_name", { ascending: true });

  if (error) {
    res.status(500).json({ success: false, message: error.message });
    return;
  }

  res.json({ success: true, staff: data ?? [] });
});
