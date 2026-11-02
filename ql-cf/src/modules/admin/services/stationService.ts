import { apiRequest } from "../../../shared/lib/apiClient";

export interface StationRow {
  id: string;
  label: string;
  category: string;
  homeStaffId: string | null;
  homeStaffName: string | null;
  isActive: boolean;
  isOutOfService: boolean;
  outOfServiceReason: string | null;
}

function mapStationRow(row: {
  id: string;
  label: string;
  category: string;
  home_staff_id: string | null;
  home_staff_name?: string | null;
  is_active: boolean;
  is_out_of_service: boolean;
  out_of_service_reason: string | null;
}): StationRow {
  return {
    id: row.id,
    label: row.label,
    category: row.category,
    homeStaffId: row.home_staff_id,
    homeStaffName: row.home_staff_name ?? null,
    isActive: row.is_active,
    isOutOfService: row.is_out_of_service,
    outOfServiceReason: row.out_of_service_reason,
  };
}

export async function fetchStations(): Promise<StationRow[]> {
  const { stations } = await apiRequest<{ stations: Parameters<typeof mapStationRow>[0][] }>("/api/admin/workspace/stations");
  return stations.map(mapStationRow);
}

export interface StationInput {
  label: string;
  category: string;
  homeStaffId: string | null;
}

export async function createStation(input: StationInput): Promise<void> {
  await apiRequest("/api/admin/workspace/stations", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateStation(id: string, input: StationInput): Promise<void> {
  await apiRequest(`/api/admin/workspace/stations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function setStationActive(id: string, isActive: boolean): Promise<void> {
  await apiRequest(`/api/admin/workspace/stations/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });
}

export async function setStationOutOfService(id: string, isOutOfService: boolean, reason?: string): Promise<void> {
  await apiRequest(`/api/admin/workspace/stations/${id}/out-of-service`, {
    method: "PATCH",
    body: JSON.stringify({ isOutOfService, reason }),
  });
}