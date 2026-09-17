import { supabaseClient } from "../../../shared/lib/supabaseClient";

export type QueueStatus = "waiting" | "in_service" | "completed" | "cancelled" | "no_show" | "scheduled";
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
  stationId: string | null;
  assignedStaffId: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface QueueEntryRow {
  id: string;
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
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  services: QueueEntryServiceItem[];
}

function mapQueueRow(row: any): QueueEntryRow {
  return {
    id: row.id,
    customerName: row.customer_name,
    contactNumber: row.contact_number,
    preferredStaffId: row.preferred_staff_id,
    assignedStaffId: row.assigned_staff_id,
    priorityType: row.priority_type,
    arrivalType: row.arrival_type,
    status: row.status,
    position: row.position,
    estimatedDuration: row.estimated_duration,
    additionalNotes: row.additional_notes,
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
      stationId: s.station_id,
      assignedStaffId: s.assigned_staff_id,
      startedAt: s.started_at,
      completedAt: s.completed_at,
    })),
  };
}

const QUEUE_SELECT = `
  *,
  queue_entry_services (
    id,
    service_id,
    price,
    estimated_duration,
    status,
    station_id,
    assigned_staff_id,
    started_at,
    completed_at,
    services ( name, category )
  )
`;

export async function fetchActiveQueue(): Promise<QueueEntryRow[]> {
  const { data, error } = await supabaseClient
    .from("queue_entries")
    .select(QUEUE_SELECT)
    .in("status", ["waiting", "in_service"])
    .order("position", { ascending: true, nullsFirst: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapQueueRow);
}

/** Subscribe to live changes on queue_entries AND queue_entry_services —
 * per-service start/complete actions update the child table, and the admin
 * queue view needs to react to those just as much as whole-entry changes. */
export function subscribeToQueueChanges(onChange: () => void): () => void {
  const channel = supabaseClient
    .channel("admin-queue-entries")
    .on("postgres_changes", { event: "*", schema: "public", table: "queue_entries" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "queue_entry_services" }, onChange)
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
  const { error } = await supabaseClient
    .from("queue_entries")
    .update({ status, position: null })
    .eq("id", entryId);
  if (error) throw new Error(error.message);
}

export async function assignStaff(entryId: string, staffId: string | null): Promise<void> {
  const { error } = await supabaseClient
    .from("queue_entries")
    .update({ assigned_staff_id: staffId })
    .eq("id", entryId);

  if (error) throw new Error(error.message);
}

/** Start ONE service item. The customer's other services stay untouched and
 * can be started independently — at a different station, by a different
 * staff member, at the same time. This is what makes simultaneous hair +
 * nails possible. */
export async function startServiceItem(itemId: string, stationId: string, staffId: string): Promise<void> {
  const { error } = await supabaseClient.rpc("start_service_item", {
    p_item_id: itemId,
    p_station_id: stationId,
    p_staff_id: staffId,
  });

  if (error) {
    if (error.code === "23505") {
      throw new Error("That station is currently occupied by another service.");
    }
    throw new Error(error.message);
  }
}

export async function completeServiceItem(itemId: string): Promise<void> {
  const { error } = await supabaseClient.rpc("complete_service_item", { p_item_id: itemId });
  if (error) throw new Error(error.message);
}

export interface AvailableStation {
  id: string;
  label: string;
  category: string;
}

/** Stations of a given category that are active and not currently occupied
 * by another in-progress SERVICE — not another visit. Two different services
 * for two different customers can now run at two different stations at once,
 * and one customer's two services can run at two stations simultaneously too. */
export async function fetchAvailableStations(category: string): Promise<AvailableStation[]> {
  const { data: occupied, error: occupiedError } = await supabaseClient
    .from("queue_entry_services")
    .select("station_id")
    .eq("status", "in_service")
    .not("station_id", "is", null);

  if (occupiedError) throw new Error(occupiedError.message);
  const occupiedIds = (occupied ?? []).map((r) => r.station_id);

  let query = supabaseClient.from("stations").select("id, label, category").eq("is_active", true);

  if (occupiedIds.length > 0) {
    query = query.not("id", "in", `(${occupiedIds.join(",")})`);
  }

  const { data, error } = await query.eq("category", category).order("label");
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Move an entry to a new position within the waiting queue (only applies
 * before any service has started — see reorder_queue_entry's own check).
 */
export async function reorderQueueEntry(entryId: string, newPosition: number): Promise<void> {
  const { error } = await supabaseClient.rpc("reorder_queue_entry", {
    p_entry_id: entryId,
    p_new_position: newPosition,
  });

  if (error) throw new Error(error.message);
}