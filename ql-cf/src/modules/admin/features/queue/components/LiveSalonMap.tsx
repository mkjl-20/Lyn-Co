import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SalonMap, { type MapSeat } from "./SalonMap";
import { mapServiceSeatsToLayout } from "./salonMapLayout";
import {
  createQueueRealtimeChannelName,
  subscribeToQueueChanges,
} from "../services/queueAdminService";
import { fetchStaffAccounts, type StaffAccountRow } from "../../staff/services/adminService";
import { supabaseClient } from "../../../../../shared/lib/supabaseClient";
import { apiRequest } from "../../../../../shared/lib/apiClient";
import { useFeedback } from "../../../../../shared/components/FeedbackContext";

interface SeatMapService {
  customerServiceSeatId: string | null;
  customerSeatReservedUntil: string | null;
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
  isActive: boolean;
  manualStatus: "available" | "reserved" | "unavailable";
}

async function fetchSeatMapQueue(): Promise<SeatMapQueueEntry[]> {
  const { data, error } = await supabaseClient
    .from("queue_entries")
    .select("ticket_number, customer_name, assigned_staff_id, preferred_staff_id, queue_entry_services ( status, service_stage, customer_service_seat_id, customer_seat_reserved_until, assigned_staff_id, preferred_staff_id, services ( name ) )")
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
        customerSeatReservedUntil: service.customer_seat_reserved_until,
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
  const assignmentsBySeat = new Map<string, { entry: SeatMapQueueEntry; services: SeatMapService[] }>();
  const now = Date.now();

  for (const entry of entries) {
    for (const service of entry.services) {
      const seatId = service.customerServiceSeatId;
      const isActivelyReserved = service.status === "in_service"
        || (service.status === "pending"
          && service.customerSeatReservedUntil !== null
          && new Date(service.customerSeatReservedUntil).getTime() > now);
      if (!seatId || !isActivelyReserved) continue;
      const existing = assignmentsBySeat.get(seatId);
      if (existing?.entry.ticketNumber === entry.ticketNumber) {
        existing.services.push(service);
      } else if (!existing || (service.status === "in_service"
        && !existing.services.some((item) => item.status === "in_service"))) {
        assignmentsBySeat.set(seatId, { entry, services: [service] });
      }
    }
  }

  return [...seatsByLayout.entries()].map(([layoutId, seat]) => {
    const assignment = assignmentsBySeat.get(seat.id);
    const isBusy = assignment?.services.some((service) =>
      service.status === "in_service" || service.customerStage === "in_service"
    );
    const queueReserved = Boolean(assignment) && !isBusy;
    const status = isBusy
      ? "busy"
      : assignment || seat.manualStatus === "reserved"
        ? "reserved"
        : seat.manualStatus === "unavailable" || !seat.isActive
          ? "unavailable"
          : "free";
    const serviceNames = [...new Set(assignment?.services.map((service) => service.name) ?? [])];
    const staffNames = [...new Set((assignment?.services ?? [])
      .map((service) => staffById.get(
        service.assignedStaffId
        ?? service.preferredStaffId
        ?? assignment?.entry.assignedStaffId
        ?? assignment?.entry.preferredStaffId
        ?? "",
      ))
      .filter((name): name is string => Boolean(name)))];

    return {
      id: layoutId,
      resourceId: seat.id,
      label: seat.label,
      status,
      manualStatus: seat.manualStatus,
      queueReserved,
      occupant: assignment?.entry.customerName,
      ticket: assignment?.entry.ticketNumber,
      service: serviceNames.join(" + ") || undefined,
      staff: staffNames.join(" + ") || undefined,
    };
  });
}

export function LiveSalonMap() {
  const { confirm, notify } = useFeedback();
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
            .select("id, label, category, is_active, manual_status")
            .order("label", { ascending: true }),
          fetchStaffAccounts(),
        ]);
        if (seatsError) throw new Error(seatsError.message);
        if (!isMounted.current) return;
        setSeats((seatRows ?? []).map((seat) => ({
          id: seat.id,
          label: seat.label,
          category: seat.category,
          isActive: seat.is_active,
          manualStatus: seat.manual_status,
        })));
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
    const seatChannel = supabaseClient
      .channel(createQueueRealtimeChannelName("admin-service-seat-map"))
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_service_seats" }, () => {
        staticDataLoadedAt.current = 0;
        refresh();
      })
      .subscribe();
    const timer = window.setInterval(refresh, 15_000);

    return () => {
      mounted = false;
      isMounted.current = false;
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
      unsubscribe();
      void supabaseClient.removeChannel(seatChannel);
    };
  }, [loadMap]);

  const mapData = useMemo(() => mapSeats(seats, entries, staff), [entries, seats, staff]);

  async function handleSetSeatStatus(
    seatId: string,
    status: "available" | "reserved" | "unavailable",
  ) {
    const seat = seats.find((item) => item.id === seatId);
    if (!seat) return;
    const reason = status === "unavailable"
      ? window.prompt(`Why is service seat "${seat.label}" unavailable?`)?.trim()
      : undefined;
    if (status === "unavailable" && !reason) return;
    if (status === "reserved" && !await confirm({
      title: "Reserve service seat",
      message: `Manually reserve service seat "${seat.label}"? It will not be assigned to a new queue service.`,
      confirmLabel: "Reserve seat",
    })) return;
    try {
      const { seat: updatedSeat } = await apiRequest<{ seat: { id: string; is_active: boolean; manual_status: CustomerServiceSeat["manualStatus"] } }>(`/api/admin/workspace/customer-service-seats/${seatId}/availability`, {
        method: "PATCH",
        body: JSON.stringify({ status, reason }),
      });
      setSeats((current) => current.map((item) => item.id === updatedSeat.id
        ? { ...item, isActive: updatedSeat.is_active, manualStatus: updatedSeat.manual_status }
        : item));
      setErrorMessage(null);
      notify("success", `Service seat "${seat.label}" updated to ${status}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update the service seat status.");
    }
  }

  if (isLoading) {
    return <div className="h-72 animate-pulse rounded-2xl bg-[var(--app-surface)] shadow-[var(--app-shadow)]" role="status">Loading salon map…</div>;
  }

  return (
    <div className="space-y-3">
      {errorMessage && <p role="alert" className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-3 text-sm text-[var(--color-ink)]">{errorMessage}</p>}
      <SalonMap seats={mapData} onSetStatus={(seatId, status) => void handleSetSeatStatus(seatId, status)} />
      <p className="text-center text-xs text-[var(--app-ink-muted)]">
        This map shows customer service seats. Staff stations are assigned to staff and managed separately.
      </p>
    </div>
  );
}
