import { useCallback, useEffect, useMemo, useState } from "react";
import SalonMap, { mapServiceSeatsToLayout, type MapSeat } from "./SalonMap";
import { fetchActiveQueue, subscribeToQueueChanges, type QueueEntryRow } from "../services/queueAdminService";
import { fetchStaffAccounts, type StaffAccountRow } from "../services/adminService";
import { supabaseClient } from "../../../shared/lib/supabaseClient";

interface CustomerServiceSeat {
  id: string;
  label: string;
  category: string;
}

function activeServiceForSeat(entries: QueueEntryRow[], seatId: string) {
  return entries.flatMap((entry) =>
    entry.services
      .filter((service) =>
        service.customerServiceSeatId === seatId
        && ["pending", "in_service"].includes(service.status)
      )
      .map((service) => ({ entry, service }))
  ).sort((a, b) =>
    Number(b.service.status === "in_service") - Number(a.service.status === "in_service")
  )[0] ?? null;
}

function mapSeats(
  seats: CustomerServiceSeat[],
  entries: QueueEntryRow[],
  staff: StaffAccountRow[],
): MapSeat[] {
  const staffById = new Map(staff.map((member) => [member.id, member.fullName]));
  const seatsByLayout = mapServiceSeatsToLayout(seats);

  return [...seatsByLayout.entries()].map(([layoutId, seat]) => {
    const assignment = activeServiceForSeat(entries, seat.id);
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
  const [entries, setEntries] = useState<QueueEntryRow[]>([]);
  const [staff, setStaff] = useState<StaffAccountRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadMap = useCallback(async () => {
    try {
      const [{ data: seatRows, error: seatsError }, queueRows, staffRows] = await Promise.all([
        supabaseClient
          .from("customer_service_seats")
          .select("id, label, category")
          .eq("is_active", true)
          .order("label", { ascending: true }),
        fetchActiveQueue(),
        fetchStaffAccounts(),
      ]);
      if (seatsError) throw new Error(seatsError.message);
      setSeats(seatRows ?? []);
      setEntries(queueRows);
      setStaff(staffRows);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load live customer seats.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      if (mounted) void loadMap();
    };
    const initialLoad = window.setTimeout(refresh, 0);
    const unsubscribe = subscribeToQueueChanges(refresh);
    const timer = window.setInterval(refresh, 15_000);

    return () => {
      mounted = false;
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
