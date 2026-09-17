import { apiRequest } from "@/shared/lib/apiClient";

export interface CatalogService {
  id: string;
  category: string | null;
  name: string;
  description: string | null;
  price: number;
  price_type: "fixed" | "starting";
  duration_minutes: number;
  is_visible: boolean;
  is_available: boolean;
  display_order: number;
}

export interface CatalogStaff {
  id: string;
  full_name: string;
  staff_role: string | null;
  is_active: boolean;
}

export async function fetchJoinCatalog() {
  const [servicesRes, staffRes] = await Promise.all([
    apiRequest<{ services: CatalogService[] }>("/api/catalog/services"),
    apiRequest<{ staff: CatalogStaff[] }>("/api/catalog/staff"),
  ]);

  return {
    services: servicesRes.services,
    staff: staffRes.staff,
  };
}

export async function joinQueue(payload: {
  customerName: string;
  contactNumber: string;
  additionalNotes: string;
  preferredStaffId: string;
  serviceIds: string[];
  arrivalType: "walk_in" | "appointment";
  priorityType: "regular" | "senior" | "pwd";
  appointmentAt: string | null;
  source: "qr_mobile" | "kiosk";
}) {
  return apiRequest<{
    entry: { id: string };
    wait: { ewtMinutes: number };
  }>("/api/queue/join", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchQueueStatus(entryId: string) {
  return apiRequest<{
    entry: {
      id: string;
      customer_name: string;
      status: string;
      position: number | null;
      estimated_duration: number;
      additional_notes: string | null;
      created_at: string;
    };
    peopleAhead: number | null;
    wait: { ewtMinutes: number };
  }>(`/api/queue/${entryId}`);
}

export async function cancelQueueEntry(entryId: string) {
  return apiRequest(`/api/queue/${entryId}/cancel`, { method: "POST" });
}
