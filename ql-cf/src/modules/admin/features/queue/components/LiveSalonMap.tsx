import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SalonMap, { mapServiceSeatsToLayout, type MapSeat } from "./SalonMap";
import { subscribeToQueueChanges } from "../services/queueAdminService";
import { fetchStaffAccounts, type StaffAccountRow } from "../../staff/services/adminService";
import { supabaseClient } from "../../../../../shared/lib/supabaseClient";

interface SeatMapService {
  customerServiceSeatId: string | null;
  status: string;
  customerStage: string;
  name: string;
  assignedStaffId: string | null;
  preferredStaffId: string | null;
}

interface SeatMapQueueEntry {
  ticketNumber: number;
  customerName: string;
  assignedStaffId: string | null;
  preferredStaffId: string | null;
  services: SeatMapService[];
}

interface CustomerServiceSeat {
  id: string;
  label: string;
  category: string;
}

async function fetchSeatMapQueue(): Promise<SeatMapQueueEntry[]> {
  const { data, error } = await supabaseClient
    .from("queue_entries")
    .select("ticket_number, customer_name, assigned_staff_id, preferred_staff_id, queue_entry_services ( status, service_stage, customer_service_seat_id, assigned_staff_id, preferred_staff_id, services ( name ) )")
    .in("status", ["waiting", "in_service"]);
  if (error) throw new Error(error.message);

  return (data ?? []).map((entry) => ({
    ticketNumber: entry.ticket_number,
    customerName: entry.customer_name,
    assignedStaffId: entry.assigned_staff_id,
    preferredStaffId: entry.preferred_staff_id,
    services: (entry.queue_entry_services ?? []).map((service) => {
      const serviceDetails = Array.isArray(service.services) ? service.services[0] : service.services;
      return {
        customerServiceSeatId: service.customer_service_seat_id,
        status: service.status,
        customerStage: service.service_stage ?? "waiting",
        name: serviceDetails?.name ?? "Service",
        assignedStaffId: service.assigned_staff_id,
        preferredStaffId: service.preferred_staff_id,
      };
    }),
  }));
}

function mapSeats(
  seats: CustomerServiceSeat[],
  entries: SeatMapQueueEntry[],
  staff: StaffAccountRow[],
): MapSeat[] {
  const staffById = new Map(staff.map((member) => [member.id, member.fullName]));
  const seatsByLayout = mapServiceSeatsToLayout(seats);
  const assignmentsBySeat = new Map<string, { entry: SeatMapQueueEntry; service: SeatMapService }>();

  for (const entry of entries) {
    for (const service of entry.services) {
      const seatId = service.customerServiceSeatId;
      if (!seatId || !["pending", "in_service"].includes(service.status)) continue;
      const existing = assignmentsBySeat.get(seatId);
      if (!existing || (service.status === "in_service" && existing.service.status !== "in_service")) {
        assignmentsBySeat.set(seatId, { entry, service });
      }
    }
  }

  return [...seatsByLayout.entries()].map(([layoutId, seat]) => {
    const assignment = assignmentsBySeat.get(seat.id);
    const serviceStatus = assignment?.service.status;
    const status = serviceStatus === "in_service"
      || assignment?.service.customerStage === "in_service"
      ? "busy"
      : assignment
        ? "reserved"
        : "free";

    return {
      id: layoutId,
      label: seat.label,
      status,
      occupant: assignment?.entry.customerName,
      ticket: assignment?.entry.ticketNumber,
      service: assignment?.service.name,
      staff: assignment
        ? staffById.get(
          assignment.service.assignedStaffId
          ?? assignment.service.preferredStaffId
          ?? assignment.entry.assignedStaffId
          ?? assignment.entry.preferredStaffId
          ?? "",
        )
        : undefined,
    };
  });
}

export function LiveSalonMap() {
  const [seats, setSeats] = useState<CustomerServiceSeat[]>([]);
  const [entries, setEntries] = useState<SeatMapQueueEntry[]>([]);
  const [staff, setStaff] = useState<StaffAccountRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isMounted = useRef(false);
  const isRefreshing = useRef(false);
  const refreshPending = useRef(false);
  const staticDataLoadedAt = useRef(0);

  const loadMap = useCallback(async () => {
    if (isRefreshing.current) {
      refreshPending.current = true;
      return;
    }

    isRefreshing.current = true;
    const shouldRefreshStaticData = Date.now() - staticDataLoadedAt.current >= 60_000;
    try {
      const queueRowsRequest = fetchSeatMapQueue();
      if (shouldRefreshStaticData) {
        const [queueRows, { data: seatRows, error: seatsError }, staffRows] = await Promise.all([
          queueRowsRequest,
          supabaseClient
            .from("customer_service_seats")
            .select("id, label, category")
            .eq("is_active", true)
            .order("label", { ascending: true }),
          fetchStaffAccounts(),
        ]);
        if (seatsError) throw new Error(seatsError.message);
        if (!isMounted.current) return;
        setSeats(seatRows ?? []);
        setStaff(staffRows);
        staticDataLoadedAt.current = Date.now();
        setEntries(queueRows);
      } else {
        const queueRows = await queueRowsRequest;
        if (!isMounted.current) return;
        setEntries(queueRows);
      }
      if (!isMounted.current) return;
      setErrorMessage(null);
    } catch (error) {
      if (isMounted.current) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to load live customer seats.");
      }
    } finally {
      isRefreshing.current = false;
      if (isMounted.current) setIsLoading(false);
      if (refreshPending.current && isMounted.current) {
        refreshPending.current = false;
        void loadMap();
      }
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    isMounted.current = true;
    const refresh = () => {
      if (mounted) void loadMap();
    };
    const initialLoad = window.setTimeout(refresh, 0);
    const unsubscribe = subscribeToQueueChanges(refresh);
    const timer = window.setInterval(refresh, 15_000);

    return () => {
      mounted = false;
      isMounted.current = false;
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
      unsubscribe();
    };
  }, [loadMap]);

  const mapData = useMemo(() => mapSeats(seats, entries, staff), [entries, seats, staff]);

  if (isLoading) {
    return <div className="h-72 animate-pulse rounded-2xl bg-[var(--app-surface)] shadow-[var(--app-shadow)]" role="status">Loading salon map…</div>;
  }

  return (
    <div className="space-y-3">
      {errorMessage && <p role="alert" className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-3 text-sm text-[var(--color-ink)]">{errorMessage}</p>}
      <SalonMap seats={mapData} />
      <p className="text-center text-xs text-[var(--app-ink-muted)]">
        This map shows customer service seats. Staff stations are assigned to staff and managed separately.
      </p>
    </div>
  );
}
