import { supabaseClient } from "../../../shared/lib/supabaseClient";
import { apiRequest } from "../../../shared/lib/apiClient";

export type QueueStatus = "waiting" | "in_service" | "completed" | "cancelled" | "no_show";
export type PriorityType = "regular" | "senior" | "pwd" | "vip";
export type ArrivalType = "walk_in" | "appointment";
export type ServiceItemStatus = "pending" | "in_service" | "completed" | "cancelled";

export interface QueueEntryServiceItem {
  id: string;
  serviceId: string;
  name: string;
  category: string;
  price: number;
  estimatedDuration: number;
  status: ServiceItemStatus;
  customerStage: "waiting" | "called" | "in_service" | "completed" | "cancelled";
  stationId: string | null;
  stationReservedUntil: string | null;
  stationQueuePosition: number | null;
  stationLabel: string | null;
  customerServiceSeatId: string | null;
  customerServiceSeatLabel: string | null;
  staffUpdate: string | null;
  staffUpdatedAt: string | null;
  preferredStaffId: string | null;
  assignedStaffId: string | null;
  canStaffHandle?: boolean;
  canManageStation?: boolean;
  startedAt: string | null;
  serviceStartedAt: string | null;
  completedAt: string | null;
}

export interface QueueSmsResult {
  sent: boolean;
  reason?: string;
}

export interface QueueCrowdStatus {
  waiting: number;
  threshold: number;
  crowded: boolean;
}

export type StaffAvailability = "available" | "on_break";

export async function fetchStaffAvailability(): Promise<StaffAvailability> {
  const result = await apiRequest<{ status: StaffAvailability }>("/api/queue/staff/availability");
  return result.status;
}

export async function updateStaffAvailability(status: StaffAvailability): Promise<StaffAvailability> {
  const result = await apiRequest<{ status: StaffAvailability }>("/api/queue/staff/availability", {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  return result.status;
}

export interface StaffRebalanceRequest {
  id: string;
  entryId: string;
  ticketNumber: number;
  customerName: string;
  serviceName: string;
  serviceCategory: string;
  fromStaffName: string;
  requestedByName: string;
  createdAt: string;
}

export async function fetchStaffRebalanceRequests(): Promise<StaffRebalanceRequest[]> {
  const result = await apiRequest<{ requests: StaffRebalanceRequest[] }>("/api/queue/staff/rebalance-requests");
  return result.requests;
}

export async function respondToStaffRebalanceRequest(
  requestId: string,
  response: "accepted" | "declined",
): Promise<void> {
  await apiRequest(`/api/queue/staff/rebalance-requests/${requestId}`, {
    method: "PATCH",
    body: JSON.stringify({ response }),
  });
}

export async function requestWorkloadRebalance(serviceItemId: string, staffId: string): Promise<void> {
  await apiRequest("/api/admin/workspace/queue/rebalance", {
    method: "POST",
    body: JSON.stringify({ serviceItemId, staffId }),
  });
}

export interface QueueAddOnService {
  id: string;
  name: string;
  category: string | null;
  price: number;
  duration_minutes: number;
}

export type ServiceLane = "hair" | "nails" | "other";

export function serviceLaneForCategory(category: string | null | undefined): ServiceLane {
  const normalized = (category ?? "").trim().toLowerCase();
  if (/hair|rebond|hairstyl|make[\s_-]?up|brows?|eyebrows?|lash/.test(normalized)) return "hair";
  if (/nail|mani|pedi|foot/.test(normalized)) return "nails";
  return "other";
}

function categoriesMatch(serviceCategory: string, stationCategory: string) {
  const normalizedService = serviceCategory.trim().toLowerCase();
  const normalizedStation = stationCategory.trim().toLowerCase();
  if (normalizedService === normalizedStation) return true;
  const lane = serviceLaneForCategory(normalizedService);
  return lane !== "other" && lane === serviceLaneForCategory(normalizedStation);
}

export interface QueueEntryRow {
  id: string;
  ticketNumber: number;
  customerName: string;
  contactNumber: string;
  preferredStaffId: string | null;
  assignedStaffId: string | null;
  priorityType: PriorityType;
  arrivalType: ArrivalType;
  status: QueueStatus;
  position: number | null;
  estimatedDuration: number;
  additionalNotes: string | null;
  packageTitle: string | null;
  packageType: "service_bundle" | "prepaid_sessions" | null;
  promotionId: string | null;
  promotionTitle: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  appointmentAt: string | null;
  noShowRiskReason: string | null;
  services: QueueEntryServiceItem[];
}

function mapQueueRow(
  row: any,
  stationLabels: Map<string, string>,
  customerSeatLabels: Map<string, string>,
  noShowRisks: Map<string, string>
): QueueEntryRow {
  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    customerName: row.customer_name,
    contactNumber: row.contact_number,
    preferredStaffId: row.preferred_staff_id,
    assignedStaffId: row.assigned_staff_id,
    priorityType: row.priority_type,
    arrivalType: row.arrival_type,
    status: row.status,
    position: row.position,
    appointmentAt: row.appointment_at ?? null,
    noShowRiskReason: noShowRisks.get(row.id) ?? null,
    estimatedDuration: row.estimated_duration,
    additionalNotes: row.additional_notes,
    packageTitle: row.service_packages?.title ?? null,
    packageType: row.service_packages?.package_type ?? null,
    promotionId: row.promotion_id ?? null,
    promotionTitle: row.promotions?.name ?? null,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    services: (row.queue_entry_services ?? []).map((s: any) => ({
      id: s.id,
      serviceId: s.service_id,
      name: s.services?.name ?? "Unknown service",
      category: s.services?.category ?? "",
      price: s.price,
      estimatedDuration: s.estimated_duration,
      status: s.status,
      customerStage: s.service_stage,
      stationId: s.station_id,
      stationReservedUntil: s.station_reserved_until ?? null,
      stationQueuePosition: s.station_queue_position ?? null,
      stationLabel: s.station_id ? stationLabels.get(s.station_id) ?? null : null,
      customerServiceSeatId: s.customer_service_seat_id ?? null,
      customerServiceSeatLabel: s.customer_service_seat_id
        ? customerSeatLabels.get(s.customer_service_seat_id) ?? null
        : null,
      staffUpdate: s.staff_update,
      staffUpdatedAt: s.staff_updated_at,
      preferredStaffId: s.preferred_staff_id ?? null,
      assignedStaffId: s.assigned_staff_id,
      startedAt: s.started_at,
      serviceStartedAt: s.service_started_at ?? null,
      completedAt: s.completed_at,
    })),
  };
}

const QUEUE_SELECT = `
  *,
  service_packages (
    title,
    package_type
  ),
  promotions (
    name
  ),
  queue_entry_services (
    id,
    service_id,
    price,
    estimated_duration,
    status,
    service_stage,
    station_id,
    station_reserved_until,
    station_queue_position,
    customer_service_seat_id,
    staff_update,
    staff_updated_at,
    preferred_staff_id,
    assigned_staff_id,
    started_at,
    service_started_at,
    completed_at,
    services ( name, category )
  )
`;

export interface QueueCustomerDetails {
  isVip: boolean;
  tags: { name: string; color: string }[];
}

export async function fetchQueueCustomerDetails(contactNumbers: string[]) {
  if (contactNumbers.length === 0) return {} as Record<string, QueueCustomerDetails>;
  const result = await apiRequest<{ customers: { contact_number: string; is_vip: boolean; tags: QueueCustomerDetails["tags"] }[] }>(
    "/api/admin/workspace/queue/customer-tags",
    {
      method: "POST",
      body: JSON.stringify({ contactNumbers }),
    }
  );
  return Object.fromEntries(result.customers.map((customer) => [
    customer.contact_number,
    { isVip: customer.is_vip, tags: customer.tags },
  ])) as Record<string, QueueCustomerDetails>;
}

export async function fetchQueueAddOnServices(): Promise<QueueAddOnService[]> {
  const { services } = await apiRequest<{ services: QueueAddOnService[] }>("/api/catalog/services");
  return services;
}

export async function fetchQueueCrowdStatus(): Promise<QueueCrowdStatus> {
  const result = await apiRequest<QueueCrowdStatus>("/api/forecast/crowd-status");
  return result;
}

export async function addServiceToQueue(entryId: string, serviceId: string): Promise<void> {
  await apiRequest(`/api/queue/${entryId}/services`, {
    method: "POST",
    body: JSON.stringify({ serviceId }),
  });
}

export async function addManualQueueEntry(input: {
  customerName: string;
  contactNumber: string;
  serviceIds: string[];
  priorityType: PriorityType;
  arrivalType: ArrivalType;
  appointmentAt: string | null;
  privacyConsent: boolean;
}): Promise<void> {
  await apiRequest("/api/queue/manual", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchActiveQueue(): Promise<QueueEntryRow[]> {
  const [
    { data, error },
    { data: stations, error: stationsError },
    { data: customerSeats, error: customerSeatsError },
    { risks },
  ] = await Promise.all([
    supabaseClient
      .from("queue_entries")
      .select(QUEUE_SELECT)
      .in("status", ["waiting", "in_service"])
      .order("position", { ascending: true, nullsFirst: false }),
    supabaseClient.from("stations").select("id, label"),
    supabaseClient.from("customer_service_seats").select("id, label"),
    apiRequest<{ risks: { entryId: string; reason: string }[] }>("/api/queue/no-show-risk"),
  ]);

  if (error) throw new Error(error.message);
  if (stationsError) throw new Error(stationsError.message);
  if (customerSeatsError) throw new Error(customerSeatsError.message);
  const stationLabels = new Map((stations ?? []).map((station) => [station.id, station.label]));
  const customerSeatLabels = new Map((customerSeats ?? []).map((seat) => [seat.id, seat.label]));
  const noShowRisks = new Map(risks.map((risk) => [risk.entryId, risk.reason]));
  return (data ?? []).map((row) => mapQueueRow(row, stationLabels, customerSeatLabels, noShowRisks));
}

export async function fetchStaffQueue(staffId: string, isQueueManager = false): Promise<QueueEntryRow[]> {
  const [entries, { data: stations, error }] = await Promise.all([
    fetchActiveQueue(),
    supabaseClient
      .from("stations")
      .select("id, category")
      .eq("home_staff_id", staffId)
      .eq("is_active", true),
  ]);

  if (error) throw new Error(error.message);

  const assignedStations = stations ?? [];
  const staffEntries = entries.map((entry) => ({
    ...entry,
    services: entry.services.map((service) => ({
      ...service,
      canManageStation: Boolean(
        service.stationId && assignedStations.some((station) => station.id === service.stationId)
      ),
      canStaffHandle: service.preferredStaffId
        ? service.preferredStaffId === staffId
        : entry.preferredStaffId === staffId
          || entry.assignedStaffId === staffId
          || service.assignedStaffId === staffId
          || assignedStations.some((station) =>
            (!service.stationId || station.id === service.stationId)
            && categoriesMatch(service.category, station.category)
          ),
    })),
  }));

  return staffEntries.filter((entry) =>
    isQueueManager
    || entry.preferredStaffId === staffId
    || entry.assignedStaffId === staffId
    || entry.services.some((service) =>
      service.preferredStaffId === staffId
      || service.assignedStaffId === staffId
      || (service.status === "pending" && service.canStaffHandle)
    )
  ).sort((first, second) => {
    const firstPosition = first.services.find((service) => service.status === "pending" && service.canStaffHandle);
    const secondPosition = second.services.find((service) => service.status === "pending" && service.canStaffHandle);
    return (firstPosition?.stationQueuePosition ?? first.position ?? Number.MAX_SAFE_INTEGER)
      - (secondPosition?.stationQueuePosition ?? second.position ?? Number.MAX_SAFE_INTEGER);
  });
}

/** Subscribe to live changes on queue_entries AND queue_entry_services —
 * per-service start/complete actions update the child table, and the admin
 * queue view needs to react to those just as much as whole-entry changes. */
export function subscribeToQueueChanges(onChange: () => void): () => void {
  const channel = supabaseClient
    .channel("admin-queue-entries")
    .on("postgres_changes", { event: "*", schema: "public", table: "queue_entries" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "queue_entry_services" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "staff_availability" }, onChange)
    .subscribe();

  return () => {
    supabaseClient.removeChannel(channel);
  };
}

/** Cancel or no-show the WHOLE visit — distinct from finishing one service
 * among several, which is handled per-item below. */
export async function updateQueueEntryStatus(
  entryId: string,
  status: "cancelled" | "no_show"
): Promise<void> {
  await apiRequest(`/api/admin/workspace/queue/${entryId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function assignStaff(entryId: string, staffId: string | null): Promise<void> {
  await apiRequest(`/api/admin/workspace/queue/${entryId}/assignment`, {
    method: "PATCH",
    body: JSON.stringify({ staffId }),
  });
}

/** Start one service item; the database prevents another service for the same
 * customer from starting until this service is complete. */
export async function startServiceItem(
  itemId: string,
  stationId: string,
  staffId: string,
  customerServiceSeatId: string,
): Promise<QueueSmsResult | null> {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Your session has expired. Please sign in again.");

  const result = await apiRequest<{ sms: QueueSmsResult | null }>(`/api/queue/service/${itemId}/start`, {
    method: "POST",
    body: JSON.stringify({
      ...(stationId === "auto" ? {} : { stationId }),
      staffId,
      customerServiceSeatId,
    }),
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return result.sms;
}

export async function completeServiceItem(itemId: string): Promise<void> {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Your session has expired. Please sign in again.");

  await apiRequest(`/api/queue/service/${itemId}/complete`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function updateServiceProgress(itemId: string, message: string): Promise<void> {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Your session has expired. Please sign in again.");

  await apiRequest(`/api/queue/service/${itemId}/progress`, {
    method: "PATCH",
    body: JSON.stringify({ message }),
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function cancelStaffServiceItem(itemId: string): Promise<void> {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Your session has expired. Please sign in again.");

  await apiRequest(`/api/queue/service/${itemId}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function cancelStaffQueueEntry(entryId: string, reason: string): Promise<void> {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Your session has expired. Please sign in again.");

  await apiRequest(`/api/queue/${entryId}/staff-cancel`, {
    method: "POST",
    body: JSON.stringify({ reason }),
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function swapStationQueueEntries(
  stationId: string,
  firstEntryId: string,
  secondEntryId: string
): Promise<void> {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Your session has expired. Please sign in again.");

  await apiRequest(`/api/queue/station/${stationId}/queue/swap`, {
    method: "POST",
    body: JSON.stringify({ firstEntryId, secondEntryId }),
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function callStaffServiceItem(
  itemId: string,
  assignment?: { customerServiceSeatId: string; staffId?: string },
): Promise<QueueSmsResult | null> {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Your session has expired. Please sign in again.");

  const result = await apiRequest<{ sms?: QueueSmsResult | null }>(`/api/queue/service/${itemId}/call`, {
    method: "POST",
    ...(assignment ? { body: JSON.stringify(assignment) } : {}),
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return result.sms ?? null;
}

export async function beginStaffServiceItem(itemId: string): Promise<QueueSmsResult | null> {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Your session has expired. Please sign in again.");

  const result = await apiRequest<{ sms?: QueueSmsResult | null }>(`/api/queue/service/${itemId}/begin`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return result.sms ?? null;
}

export interface AvailableStation {
  id: string;
  label: string;
  category: string;
  homeStaffId: string | null;
}

export interface ServiceSeatOption {
  id: string;
  label: string;
  category: string;
  status: "free" | "busy" | "reserved";
  isEligible: boolean;
}

function serviceSeatMatchesCategory(serviceCategory: string, seatCategory: string, seatLabel: string) {
  return categoriesMatch(serviceCategory, seatCategory)
    || categoriesMatch(serviceCategory, seatLabel);
}

/** Active stations of a given category that are not currently reserved by
 * another service. */
export async function fetchAvailableStations(
  category: string,
  staffId?: string,
  serviceItemId?: string
): Promise<AvailableStation[]> {
  let occupiedQuery = supabaseClient
    .from("queue_entry_services")
    .select("station_id, station_reserved_until")
    .in("status", ["pending", "in_service"])
    .not("station_id", "is", null);
  if (serviceItemId) occupiedQuery = occupiedQuery.neq("id", serviceItemId);

  const [{ data: occupied, error: occupiedError }, { data: stations, error: stationsError }] = await Promise.all([
    occupiedQuery,
    supabaseClient
      .from("stations")
      .select("id, label, category, home_staff_id")
      .eq("is_active", true)
      .order("label"),
  ]);

  if (occupiedError) throw new Error(occupiedError.message);
  if (stationsError) throw new Error(stationsError.message);
  const now = Date.now();
  const occupiedIds = (occupied ?? [])
    .filter((reservation) =>
      reservation.station_reserved_until === null
      || new Date(reservation.station_reserved_until).getTime() > now
    )
    .map((reservation) => reservation.station_id);
  let eligibleStations = (stations ?? []).filter((station) =>
    categoriesMatch(category, station.category) && !occupiedIds.includes(station.id)
  );

  if (staffId) {
    const { data: assignedStations, error: assignedStationsError } = await supabaseClient
      .from("stations")
      .select("id")
      .eq("home_staff_id", staffId)
      .eq("is_active", true);
    if (assignedStationsError) throw new Error(assignedStationsError.message);

    const assignedIds = new Set((assignedStations ?? []).map((station) => station.id));
    eligibleStations = eligibleStations.filter((station) =>
      assignedIds.size > 0 ? assignedIds.has(station.id) : station.home_staff_id === null
    );
  }

  return eligibleStations.map((station) => ({
    id: station.id,
    label: station.label,
    category: station.category,
    homeStaffId: station.home_staff_id,
  }));
}

export async function fetchServiceSeatOptions(
  category: string,
  serviceItemId: string,
): Promise<ServiceSeatOption[]> {
  const [{ data: seats, error: seatsError }, { data: reservations, error: reservationsError }] = await Promise.all([
    supabaseClient
      .from("customer_service_seats")
      .select("id, label, category")
      .eq("is_active", true)
      .order("label"),
    supabaseClient
      .from("queue_entry_services")
      .select("id, customer_service_seat_id, customer_seat_reserved_until, status")
      .in("status", ["pending", "in_service"])
      .not("customer_service_seat_id", "is", null)
      .neq("id", serviceItemId),
  ]);
  if (seatsError) throw new Error(seatsError.message);
  if (reservationsError) throw new Error(reservationsError.message);

  const now = Date.now();
  const reservedStatuses = new Map((reservations ?? [])
    .filter((reservation) =>
      reservation.customer_seat_reserved_until === null
      || new Date(reservation.customer_seat_reserved_until).getTime() > now
    )
    .filter((reservation): reservation is typeof reservation & { customer_service_seat_id: string } =>
      Boolean(reservation.customer_service_seat_id)
    )
    .map((reservation) => [reservation.customer_service_seat_id, reservation.status] as const));

  return (seats ?? []).map((seat) => {
    const reservationStatus = reservedStatuses.get(seat.id);
    return {
      id: seat.id,
      label: seat.label,
      category: seat.category,
      status: reservationStatus === "in_service" ? "busy" : reservationStatus ? "reserved" : "free",
      isEligible: serviceSeatMatchesCategory(category, seat.category, seat.label),
    };
  });
}

/**
 * Move an entry to a new position within the waiting queue (only applies
 * before any service has started — see reorder_queue_entry's own check).
 */
export async function reorderQueueEntry(entryId: string, newPosition: number, reason: string): Promise<void> {
  await apiRequest(`/api/admin/workspace/queue/${entryId}/position`, {
    method: "PATCH",
    body: JSON.stringify({ position: newPosition, reason }),
  });
}

export async function startStaffServiceItem(
  itemId: string,
  stationId: string,
  customerServiceSeatId: string,
): Promise<void> {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Your session has expired. Please sign in again.");

  await apiRequest(`/api/queue/service/${itemId}/start`, {
    method: "POST",
    body: JSON.stringify({
      ...(stationId === "auto" ? {} : { stationId }),
      customerServiceSeatId,
    }),
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}