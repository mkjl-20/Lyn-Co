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
  staff_role_label: string | null;
  account_role: "admin" | "staff";
  service_lane: "hair" | "nails" | "other";
  is_active: boolean;
}

export interface CatalogPackage {
  id: string;
  title: string;
  description: string | null;
  package_type: "service_bundle" | "prepaid_sessions";
  price: number;
  sessions_count: number;
  image_data_url: string | null;
  service_package_items: {
    service_id: string;
    quantity: number;
    services: Pick<CatalogService, "id" | "name" | "price" | "duration_minutes"> | null;
  }[];
}

export interface WaitQuote {
  minutes: number | null;
  method?: string;
}

export interface PublicPromotion {
  id: string;
  title: string;
  description: string | null;
  discount_type: "percent" | "fixed";
  discount_value: number;
  starts_at: string;
  ends_at: string;
  image_data_url: string | null;
  eligible_service_ids: string[];
  minimum_spend: number | null;
  maximum_discount: number | null;
  usage_limit: number | null;
  redemption_count: number;
  one_per_customer: boolean;
  exclude_packages: boolean;
}

function removeDuplicateServices(services: CatalogService[]): CatalogService[] {
  const seen = new Set<string>();
  return services.filter((service) => {
    const key = `${service.name.trim().toLocaleLowerCase()}::${(service.category ?? "Other").trim().toLocaleLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function fetchJoinCatalog() {
  // Fetch both in parallel, but do NOT silently swallow staff errors —
  // the previous `.catch(() => ({ staff: [] }))` was hiding real 500s
  // from /api/catalog/staff, making the dropdown look "empty" with no
  // visible cause. Let both requests fail loudly so bugs surface.
  const [servicesRes, staffRes, packagesRes] = await Promise.all([
    apiRequest<{ services: CatalogService[] }>("/api/catalog/services"),
    apiRequest<{ staff: CatalogStaff[] }>("/api/catalog/staff"),
    apiRequest<{ packages: CatalogPackage[] }>("/api/catalog/packages"),
  ]);

  return {
    services: removeDuplicateServices(servicesRes.services),
    staff: staffRes.staff,
    packages: packagesRes.packages,
  };
}

export async function fetchPublicPromotions() {
  return apiRequest<{ promotions: PublicPromotion[] }>("/api/catalog/promotions");
}

export async function joinQueue(payload: {
  customerName: string;
  contactNumber: string;
  additionalNotes: string;
  preferredStaffId: string;
  serviceIds: string[];
  packageId: string | null;
  promotionId: string | null;
  arrivalType: "walk_in" | "appointment";
  priorityType: "regular" | "senior" | "pwd";
  appointmentAt: string | null;
  servicePreferences: { serviceId: string; staffId: string }[];
  source: "qr_mobile" | "kiosk";
  privacyConsent: boolean;
  marketingConsent: boolean;
  partyMembers?: {
    customerName: string;
    serviceIds: string[];
    servicePreferences: { serviceId: string; staffId: string }[];
  }[];
}) {
  return apiRequest<{
    entry: {
      id: string;
      ticket_number: number;
      assigned_service_seat_labels: string[];
    };
    wait: { ewtMinutes: number | null; source?: string };
    estimatedWaitMinutes: number | null;
    ewtMethod: string | null;
    party?: {
      id: string;
      entries: {
        id: string;
        customer_name: string;
        ticket_number: number;
        assigned_service_seat_labels: string[];
        wait: { ewtMinutes: number | null; source?: string };
      }[];
    };
  }>("/api/queue/join", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchWaitQuote(firstServiceId: string, preferredStaffId?: string) {
  return apiRequest<WaitQuote>("/api/queue/get-wait-quote", {
    method: "POST",
    body: JSON.stringify({
      firstServiceId,
      ...(preferredStaffId ? { preferredStaffId } : {}),
    }),
  });
}

export async function fetchQueueStatus(entryId: string) {
  return apiRequest<{
    entry: {
      id: string;
      ticket_number: number;
      customer_name: string;
      status: string;
      position: number | null;
      estimated_duration: number;
      additional_notes: string | null;
      created_at: string;
      predicted_wait_min: number | null;
      ewt_method: string | null;
      receipt: {
        subtotal: number;
        discountAmount: number;
        totalAmount: number;
        paymentMethod: string;
        paidAt: string;
        services: { name: string; quantity: number }[];
      } | null;
      receiptUnavailable?: boolean;
      assigned_service_seats: {
        id: string;
        serviceName: string;
        status: string;
        customerStage: string;
        startedAt: string | null;
        completedAt: string | null;
        serviceStartedAt: string | null;
        staffStationLabel: string | null;
        assignedStaffName: string | null;
        staffUpdate: string | null;
        staffUpdatedAt: string | null;
        serviceSeatLabel: string | null;
      }[];
    };
    peopleAhead: number | null;
    wait: { ewtMinutes: number | null; source?: string };
  }>(`/api/queue/${entryId}`);
}

export async function fetchQueueWaitEstimate(entryId: string) {
  return apiRequest<{
    wait: { ewtMinutes: number | null; source?: string };
  }>(`/api/queue/${entryId}/wait`);
}

export interface PublicLiveQueueTicket {
  ticketNumber: number;
  status: "waiting" | "in_service";
  position: number | null;
  services: {
    name: string;
    status: string;
    stage: string;
  }[];
}

export async function fetchPublicLiveQueue(entryId: string) {
  return apiRequest<{
    tickets: PublicLiveQueueTicket[];
    updatedAt: string;
  }>(`/api/queue/${entryId}/live`);
}

export async function cancelQueueEntry(entryId: string) {
  return apiRequest(`/api/queue/${entryId}/cancel`, { method: "POST" });
}