import { supabaseClient } from "../../../shared/lib/supabaseClient";

export interface StationRow {
  id: string;
  label: string;
  category: string;
  homeStaffId: string | null;
  homeStaffName: string | null;
  isActive: boolean;
}

function mapStationRow(row: any): StationRow {
  return {
    id: row.id,
    label: row.label,
    category: row.category,
    homeStaffId: row.home_staff_id,
    homeStaffName: row.profiles?.full_name ?? null,
    isActive: row.is_active,
  };
}

export async function fetchStations(): Promise<StationRow[]> {
  const { data, error } = await supabaseClient
    .from("stations")
    .select("id, label, category, home_staff_id, is_active, profiles ( full_name )")
    .order("category", { ascending: true })
    .order("label", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapStationRow);
}

export interface StationInput {
  label: string;
  category: string;
  homeStaffId: string | null;
}

export async function createStation(input: StationInput): Promise<void> {
  const { error } = await supabaseClient.from("stations").insert({
    label: input.label,
    category: input.category,
    home_staff_id: input.homeStaffId,
  });
  if (error) throw new Error(error.message);
}

export async function updateStation(id: string, input: StationInput): Promise<void> {
  const { error } = await supabaseClient
    .from("stations")
    .update({ label: input.label, category: input.category, home_staff_id: input.homeStaffId })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setStationActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabaseClient.from("stations").update({ is_active: isActive }).eq("id", id);
  if (error) throw new Error(error.message);
}