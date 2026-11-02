import type { SupabaseClient } from "@supabase/supabase-js";

export function isMissingTable(error: { code?: string; message?: string }, tableName: string) {
  return ["PGRST205", "42P01"].includes(error.code ?? "")
    || Boolean(error.message?.includes(`public.${tableName}`));
}

export function isMissingStaffAvailabilityTable(error: { code?: string; message?: string }) {
  return isMissingTable(error, "staff_availability");
}

export async function loadUnavailableStaffIds(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("staff_availability")
    .select("staff_id")
    .eq("status", "on_break");
  if (error) {
    if (isMissingStaffAvailabilityTable(error)) {
      console.warn("staff_availability table is missing; apply 20261101090000_queue_availability_and_sms_outbox.sql.");
      return { staffIds: new Set<string>(), configured: false };
    }
    throw new Error(error.message);
  }
  return {
    staffIds: new Set((data ?? []).map((row) => row.staff_id)),
    configured: true,
  };
}
