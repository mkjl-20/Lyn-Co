import { useEffect, useState, type DragEvent, type FormEvent } from "react";
import { GripVertical } from "lucide-react";
import {
  fetchActiveQueue,
  fetchQueueCustomerDetails,
  fetchQueueAddOnServices,
  fetchQueueCrowdStatus,
  addServiceToQueue,
  addManualQueueEntry,
  subscribeToQueueChanges,
  updateQueueEntryStatus,
  reorderQueueEntry,
  requestWorkloadRebalance,
  startServiceItem,
  callStaffServiceItem,
  completeServiceItem,
  fetchAvailableStations,
  fetchServiceSeatOptions,
  serviceLaneForCategory,
  type QueueEntryRow,
  type QueueEntryServiceItem,
  type QueueCustomerDetails,
  type AvailableStation,
  type ServiceSeatOption,
  type QueueAddOnService,
  type QueueCrowdStatus,
} from "../services/queueAdminService";
import { ServiceSeatMapPicker } from "./SalonMap";
import { fetchStaffAccounts, type StaffAccountRow } from "../services/adminService";
import { fetchStations } from "../services/stationService";
import { formatTicketNumber } from "@/shared/lib/ticketNumber";
import { QueueProgress } from "@/shared/components/QueueProgress";

const PRIORITY_LABELS: Record<string, string> = {
  regular: "Regular",
  senior: "Senior",
  pwd: "PWD",
  vip: "VIP",
};

const PRIORITY_STYLES: Record<string, string> = {
  regular: "bg-porcelain text-ink/50",
  senior: "bg-gold-light text-gold",
  pwd: "bg-gold-light text-gold",
  vip: "bg-clay-light text-clay",
};

const TAG_STYLES: Record<string, string> = {
  sage: "bg-sage-light text-sage-deep",
  clay: "bg-clay-light text-clay",
  gold: "bg-gold-light text-ink/75",
  info: "bg-info-soft text-info",
};

function staffCanPerformCategory(staffLane: string, category: string) {
  return staffLane === serviceLaneForCategory(category);
}

export function QueueOverview() {
  const [entries, setEntries] = useState<QueueEntryRow[]>([]);
  const [customerDetails, setCustomerDetails] = useState<Record<string, QueueCustomerDetails>>({});
  const [staff, setStaff] = useState<StaffAccountRow[]>([]);
  const [crowdStatus, setCrowdStatus] = useState<QueueCrowdStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [queueMessage, setQueueMessage] = useState<string | null>(null);
  const [draggedEntryId, setDraggedEntryId] = useState<string | null>(null);
  const [dropTargetEntryId, setDropTargetEntryId] = useState<string | null>(null);
  const [pendingReorder, setPendingReorder] = useState<{ entryId: string; position: number; ticketNumber: number } | null>(null);
  const [reorderReason, setReorderReason] = useState("");
  const [isReordering, setIsReordering] = useState(false);
  const [rebalanceStaffByItem, setRebalanceStaffByItem] = useState<Record<string, string>>({});
  const [requestingRebalanceItemId, setRequestingRebalanceItemId] = useState<string | null>(null);
  const [queueSearch, setQueueSearch] = useState("");
  const [queueStatus, setQueueStatus] = useState<"all" | "waiting" | "in_service">("all");

  // Which service item is currently showing its station/staff picker.
  const [startingItemId, setStartingItemId] = useState<string | null>(null);
  const [availableStations, setAvailableStations] = useState<AvailableStation[]>([]);
  const [availableServiceSeats, setAvailableServiceSeats] = useState<ServiceSeatOption[]>([]);
  const [serviceSeatOptions, setServiceSeatOptions] = useState<ServiceSeatOption[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string>("");
  const [selectedServiceSeatId, setSelectedServiceSeatId] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [stationsLoading, setStationsLoading] = useState(false);
  const [staffWithAssignedStation, setStaffWithAssignedStation] = useState<Set<string>>(new Set());
  const [addOnServices, setAddOnServices] = useState<QueueAddOnService[]>([]);
  const [selectedAddOnByEntry, setSelectedAddOnByEntry] = useState<Record<string, string>>({});
  const [addingServiceEntryId, setAddingServiceEntryId] = useState<string | null>(null);
  const [isAddingWalkIn, setIsAddingWalkIn] = useState(false);
  const [manualCustomerName, setManualCustomerName] = useState("");
  const [manualContactNumber, setManualContactNumber] = useState("");
  const [manualServiceIds, setManualServiceIds] = useState<string[]>([]);
  const [manualPriority, setManualPriority] = useState<"regular" | "senior" | "pwd" | "vip">("regular");
  const [manualArrivalType, setManualArrivalType] = useState<"walk_in" | "appointment">("walk_in");
  const [manualAppointmentAt, setManualAppointmentAt] = useState("");
  const [manualPrivacyConsent, setManualPrivacyConsent] = useState(false);
  const [isSavingWalkIn, setIsSavingWalkIn] = useState(false);

  function activeWorkload(staffId: string) {
    return entries.reduce((count, entry) => count + entry.services.filter((item) =>
      item.assignedStaffId === staffId && (item.status === "pending" || item.status === "in_service")
    ).length, 0);
  }

  function rebalanceCandidates(item: QueueEntryServiceItem) {
    return staff
      .filter((member) =>
        member.accountRole === "staff"
        && member.id !== item.assignedStaffId
        && member.staffRole !== "receptionist"
        && staffCanPerformCategory(member.staffRole ?? "", item.category)
      )
      .sort((first, second) =>
        activeWorkload(first.id) - activeWorkload(second.id)
        || first.fullName.localeCompare(second.fullName)
      );
  }

  async function loadQueue() {
    try {
      const [entryRows, staffRows, crowd] = await Promise.all([
        fetchActiveQueue(),
        fetchStaffAccounts(),
        fetchQueueCrowdStatus(),
      ]);
      const details = await fetchQueueCustomerDetails([...new Set(entryRows.map((entry) => entry.contactNumber).filter(Boolean))]);
      setEntries(entryRows);
      setCustomerDetails(details);
      setStaff(staffRows);
      setCrowdStatus(crowd);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load queue.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadQueue();
    const unsubscribe = subscribeToQueueChanges(loadQueue);
    return unsubscribe;
  }, []);

  useEffect(() => {
    void fetchQueueAddOnServices()
      .then(setAddOnServices)
      .catch((error: unknown) => setErrorMessage(error instanceof Error ? error.message : "Unable to load services."));
  }, []);

  async function handleOpenStartPicker(item: QueueEntryServiceItem) {
    setStartingItemId(item.id);
    setSelectedStationId("");
    setSelectedServiceSeatId("");
    setSelectedStaffId("");
    setStationsLoading(true);
    try {
      const [stations, allStations, serviceSeats] = await Promise.all([
        fetchAvailableStations(item.category, undefined, item.id),
        fetchStations(),
        fetchServiceSeatOptions(item.category, item.id),
      ]);
      setAvailableStations(stations);
      setServiceSeatOptions(serviceSeats);
      const availableSeats = serviceSeats.filter((seat) => seat.isEligible && seat.status === "free");
      setAvailableServiceSeats(availableSeats);
      const reservedStation = stations.find((station) => station.id === item.stationId);
      if (reservedStation) setSelectedStationId(reservedStation.id);
      else if (stations.length === 1) setSelectedStationId(stations[0].id);
      const reservedSeat = availableSeats.find((seat) => seat.id === item.customerServiceSeatId);
      if (reservedSeat) setSelectedServiceSeatId(reservedSeat.id);
      else if (availableSeats.length === 1) setSelectedServiceSeatId(availableSeats[0].id);
      const requestedSpecialist = staff.find((member) => member.id === item.preferredStaffId);
      if (requestedSpecialist) setSelectedStaffId(requestedSpecialist.id);
      setStaffWithAssignedStation(new Set(allStations.flatMap((station) =>
        station.isActive && station.homeStaffId ? [station.homeStaffId] : []
      )));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load stations.");
    } finally {
      setStationsLoading(false);
    }
  }

  async function handleConfirmStart(itemId: string) {
    if (!selectedStationId || !selectedStaffId || !selectedServiceSeatId) {
      setErrorMessage("Please select a station, service seat, and staff member.");
      return;
    }
    try {
      const sms = await callStaffServiceItem(itemId, {
        customerServiceSeatId: selectedServiceSeatId,
        staffId: selectedStaffId,
      });
      await startServiceItem(itemId, selectedStationId, selectedStaffId, selectedServiceSeatId);
      setStartingItemId(null);
      if (sms?.sent === false) {
        setErrorMessage("Service started, but the customer SMS was not delivered. Please contact them directly.");
      }
      await loadQueue();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to start service.");
    }
  }

  async function handleCompleteItem(itemId: string) {
    try {
      await completeServiceItem(itemId);
      await loadQueue();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to complete service.");
    }
  }

  async function handleAddService(entryId: string) {
    const serviceId = selectedAddOnByEntry[entryId];
    if (!serviceId) return;
    setAddingServiceEntryId(entryId);
    setErrorMessage(null);
    try {
      await addServiceToQueue(entryId, serviceId);
      setSelectedAddOnByEntry((current) => ({ ...current, [entryId]: "" }));
      setQueueMessage("Service added. Queue estimates and station assignments have been recalculated.");
      await loadQueue();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to add service.");
    } finally {
      setAddingServiceEntryId(null);
    }
  }

  async function handleAddWalkIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSavingWalkIn(true);
    try {
      await addManualQueueEntry({
        customerName: manualCustomerName.trim(),
        contactNumber: manualContactNumber.trim(),
        serviceIds: manualServiceIds,
        priorityType: manualPriority,
        arrivalType: manualArrivalType,
        appointmentAt: manualAppointmentAt || null,
        privacyConsent: manualPrivacyConsent,
      });
      setManualCustomerName("");
      setManualContactNumber("");
      setManualServiceIds([]);
      setManualPriority("regular");
      setManualArrivalType("walk_in");
      setManualAppointmentAt("");
      setManualPrivacyConsent(false);
      setIsAddingWalkIn(false);
      setQueueMessage("Walk-in added to the live queue.");
      await loadQueue();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to add walk-in.");
    } finally {
      setIsSavingWalkIn(false);
    }
  }

  async function handleEntryStatusChange(entryId: string, status: "cancelled" | "no_show") {
    const action = status === "cancelled" ? "cancel" : "mark as a no-show";
    if (!window.confirm(`Are you sure you want to ${action} this queue visit?`)) return;
    const previous = entries;
    setEntries((current) => current.filter((e) => e.id !== entryId));
    try {
      await updateQueueEntryStatus(entryId, status);
      await loadQueue();
    } catch (error) {
      setEntries(previous);
      setErrorMessage(error instanceof Error ? error.message : "Failed to update status.");
    }
  }

  async function handleMove(entry: QueueEntryRow, direction: "up" | "down") {
    const waitingEntries = entries
      .filter((candidate) => candidate.status === "waiting")
      .sort((first, second) => (first.position ?? Number.MAX_SAFE_INTEGER) - (second.position ?? Number.MAX_SAFE_INTEGER));
    const currentRank = waitingEntries.findIndex((candidate) => candidate.id === entry.id) + 1;
    if (currentRank === 0) return;
    const targetPosition = currentRank + (direction === "up" ? -1 : 1);
    if (targetPosition < 1 || targetPosition > waitingEntries.length) return;
    setPendingReorder({ entryId: entry.id, position: targetPosition, ticketNumber: entry.ticketNumber });
    setReorderReason("");
  }

  function handleQueueDragStart(event: DragEvent<HTMLButtonElement>, entry: QueueEntryRow) {
    if (entry.status !== "waiting") {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", entry.id);
    setDraggedEntryId(entry.id);
    setQueueMessage(null);
  }

  async function handleQueueDrop(event: DragEvent<HTMLLIElement>, target: QueueEntryRow) {
    event.preventDefault();
    setDropTargetEntryId(null);
    const sourceId = event.dataTransfer.getData("text/plain") || draggedEntryId;
    const source = entries.find((candidate) => candidate.id === sourceId);
    setDraggedEntryId(null);
    if (!source || source.status !== "waiting" || target.status !== "waiting" || source.id === target.id) return;

    const waitingEntries = entries
      .filter((candidate) => candidate.status === "waiting")
      .sort((first, second) => (first.position ?? Number.MAX_SAFE_INTEGER) - (second.position ?? Number.MAX_SAFE_INTEGER));
    const sourceRank = waitingEntries.findIndex((candidate) => candidate.id === source.id) + 1;
    const targetRank = waitingEntries.findIndex((candidate) => candidate.id === target.id) + 1;
    if (sourceRank < 1 || targetRank < 1) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const dropAfter = event.clientY >= bounds.top + bounds.height / 2;
    const newPosition = targetRank + (sourceRank < targetRank
      ? (dropAfter ? 0 : -1)
      : (dropAfter ? 1 : 0));

    setPendingReorder({ entryId: source.id, position: newPosition, ticketNumber: source.ticketNumber });
    setReorderReason("");
  }

  async function handleConfirmReorder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pendingReorder || !reorderReason.trim()) return;
    setIsReordering(true);
    setErrorMessage(null);
    try {
      await reorderQueueEntry(pendingReorder.entryId, pendingReorder.position, reorderReason.trim());
      setQueueMessage(`Ticket ${formatTicketNumber(pendingReorder.ticketNumber)} moved to position ${pendingReorder.position}.`);
      setPendingReorder(null);
      setReorderReason("");
      await loadQueue();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to reorder queue.");
    } finally {
      setIsReordering(false);
    }
  }

  async function handleRequestRebalance(item: QueueEntryServiceItem) {
    const staffId = rebalanceStaffByItem[item.id];
    if (!staffId) {
      setErrorMessage("Choose an eligible staff member to receive the rebalance request.");
      return;
    }
    setRequestingRebalanceItemId(item.id);
    setErrorMessage(null);
    try {
      await requestWorkloadRebalance(item.id, staffId);
      setQueueMessage(`A workload rebalance request was sent for ${item.name}. The staff member must accept it before assignment changes.`);
      setRebalanceStaffByItem((current) => ({ ...current, [item.id]: "" }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to request workload rebalance.");
    } finally {
      setRequestingRebalanceItemId(null);
    }
  }

  const visibleEntries = entries.filter((entry) => {
    const query = queueSearch.trim().toLowerCase();
    const customer = customerDetails[entry.contactNumber];
    const matchesSearch = !query || `${entry.customerName} ${entry.contactNumber} ${entry.services.map((service) => service.name).join(" ")} ${customer?.tags.map((tag) => tag.name).join(" ") ?? ""}`.toLowerCase().includes(query);
    return matchesSearch && (queueStatus === "all" || entry.status === queueStatus);
  });
  const selectedStation = availableStations.find((station) => station.id === selectedStationId);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-[var(--app-shadow)]">
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-porcelain" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-mist bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display text-lg font-semibold text-ink">Live queue</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input value={queueSearch} onChange={(event) => setQueueSearch(event.target.value)} placeholder="Search queue..." className="dashboard-filter-control w-full outline-none focus:border-sage sm:w-56" aria-label="Search queue" />
          <select value={queueStatus} onChange={(event) => setQueueStatus(event.target.value as typeof queueStatus)} className="dashboard-filter-control w-full outline-none focus:border-sage sm:w-40" aria-label="Filter queue status"><option value="all">All statuses</option><option value="waiting">Waiting</option><option value="in_service">In service</option></select>
          <button type="button" onClick={() => setIsAddingWalkIn((open) => !open)} className="dashboard-primary-action min-h-10 rounded-lg px-4 text-sm font-semibold">
            {isAddingWalkIn ? "Close" : "Add walk-in"}
          </button>
        </div>
      </div>
      {isAddingWalkIn && (
        <form onSubmit={(event) => void handleAddWalkIn(event)} className="mt-4 grid gap-3 rounded-xl border border-mist bg-porcelain/40 p-4 sm:grid-cols-2">
          <label className="text-xs font-medium text-ink/70">
            Customer name
            <input required maxLength={100} value={manualCustomerName} onChange={(event) => setManualCustomerName(event.target.value)} className="dashboard-filter-control mt-1 block w-full" />
          </label>
          <label className="text-xs font-medium text-ink/70">
            Mobile number
            <input required type="tel" inputMode="numeric" pattern="09[0-9]{9}" maxLength={11} value={manualContactNumber} onChange={(event) => setManualContactNumber(event.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="09XXXXXXXXX" className="dashboard-filter-control mt-1 block w-full" />
          </label>
          <fieldset className="rounded-lg border border-mist bg-white p-3 sm:col-span-2">
            <legend className="px-1 text-xs font-medium text-ink/70">Select services</legend>
            <div className="grid max-h-36 gap-2 overflow-y-auto sm:grid-cols-2">
              {addOnServices.map((service) => (
                <label key={service.id} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={manualServiceIds.includes(service.id)}
                    onChange={(event) => setManualServiceIds((current) => event.target.checked
                      ? [...current, service.id]
                      : current.filter((id) => id !== service.id))}
                  />
                  <span>{service.name} · ₱{Number(service.price).toFixed(2)}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="text-xs font-medium text-ink/70">
            Customer type
            <select value={manualPriority} onChange={(event) => setManualPriority(event.target.value as typeof manualPriority)} className="dashboard-filter-control mt-1 block w-full">
              <option value="regular">Regular</option><option value="senior">Senior</option><option value="pwd">PWD</option><option value="vip">VIP</option>
            </select>
          </label>
          <label className="text-xs font-medium text-ink/70">
            Visit type
            <select value={manualArrivalType} onChange={(event) => setManualArrivalType(event.target.value as typeof manualArrivalType)} className="dashboard-filter-control mt-1 block w-full">
              <option value="walk_in">Walk-in</option><option value="appointment">Phone booking</option>
            </select>
          </label>
          {manualArrivalType === "appointment" && (
            <label className="text-xs font-medium text-ink/70">
              Appointment time
              <input required type="datetime-local" value={manualAppointmentAt} onChange={(event) => setManualAppointmentAt(event.target.value)} className="dashboard-filter-control mt-1 block w-full" />
            </label>
          )}
          <label className="flex items-start gap-2 text-xs text-ink/70">
            <input type="checkbox" checked={manualPrivacyConsent} onChange={(event) => setManualPrivacyConsent(event.target.checked)} className="mt-0.5" />
            Customer was informed of the privacy notice and consented to joining the queue.
          </label>
          <button type="submit" disabled={isSavingWalkIn || manualServiceIds.length === 0 || !manualPrivacyConsent} className="dashboard-primary-action min-h-10 rounded-lg px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 sm:col-span-2">
            {isSavingWalkIn ? "Adding…" : "Add to queue"}
          </button>
        </form>
      )}
      {errorMessage && (
        <p role="alert" className="mt-2 text-sm text-clay">
          {errorMessage}
        </p>
      )}
      {crowdStatus?.crowded && (
        <p role="alert" className="mt-3 rounded-lg border border-clay/30 bg-clay-light px-4 py-3 text-sm font-semibold text-clay">
          Queue crowding alert: {crowdStatus.waiting} customers are waiting (threshold {crowdStatus.threshold}).
        </p>
      )}
      {queueMessage && <p role="status" className="mt-2 text-sm text-sage-deep">{queueMessage}</p>}
      <p className="mt-2 text-xs text-ink/45">
        Drag a waiting ticket by its handle and drop it above or below another waiting ticket to change the queue order. In-service visits cannot be moved.
      </p>

      {visibleEntries.length === 0 ? (
        <p className="mt-6 text-sm text-ink/50">No active queue entries.</p>
      ) : (
        <ul className="mt-6 max-h-[calc(100vh-18rem)] space-y-3 overflow-y-auto pr-2">
          {visibleEntries.map((entry) => {
            const primaryService = entry.services.find((service) => service.status === "pending") ?? entry.services[0];
            return (
            <li
              key={entry.id}
              onDragOver={(event) => {
                if (draggedEntryId && entry.status === "waiting") {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropTargetEntryId(entry.id);
                }
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setDropTargetEntryId(null);
                }
              }}
              onDrop={(event) => void handleQueueDrop(event, entry)}
              className={`rounded-lg border px-4 py-3 transition duration-150 hover:-translate-y-0.5 hover:border-[var(--app-accent)]/50 hover:bg-[var(--app-surface)] hover:shadow-md ${
                dropTargetEntryId === entry.id ? "border-sage-deep bg-sage-light/40 ring-2 ring-sage/30" : "border-[var(--app-border)]/70"
              } ${draggedEntryId === entry.id ? "opacity-50" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  {primaryService && entry.status === "waiting" && (
                    <div className="flex flex-col items-center pt-0.5">
                      <button
                        type="button"
                        draggable
                        onDragStart={(event) => handleQueueDragStart(event, entry)}
                        onDragEnd={() => {
                          setDraggedEntryId(null);
                          setDropTargetEntryId(null);
                        }}
                        className="cursor-grab touch-none rounded p-1 text-ink/35 hover:bg-sage-light hover:text-sage-deep active:cursor-grabbing"
                        aria-label={`Drag ticket ${entry.ticketNumber} to reorder`}
                        title="Drag to reorder"
                      >
                        <GripVertical size={16} aria-hidden="true" />
                      </button>
                      <div className="flex flex-col">
                        <button
                          onClick={() => void handleMove(entry, "up")}
                          disabled={entry.position === 1}
                          className="text-ink/30 hover:text-ink disabled:opacity-20"
                          aria-label="Move up"
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => void handleMove(entry, "down")}
                          className="text-ink/30 hover:text-ink disabled:opacity-20"
                          aria-label="Move down"
                        >
                          ▼
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-ink">{entry.customerName}</p>
                      <span className="text-xs text-ink/60">Ticket {formatTicketNumber(entry.ticketNumber)}</span>
                      {entry.priorityType !== "regular" && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${PRIORITY_STYLES[entry.priorityType]}`}
                        >
                          {PRIORITY_LABELS[entry.priorityType]}
                        </span>
                      )}
                      {entry.arrivalType === "appointment" && (
                        <span className="rounded-full bg-sage-light px-2 py-0.5 text-[10px] font-semibold text-sage-deep">
                          Appointment
                        </span>
                      )}
                      {entry.noShowRiskReason && (
                        <span className="rounded-full bg-clay-light px-2 py-0.5 text-[10px] font-semibold text-clay" title={entry.noShowRiskReason}>
                          No-show risk
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-ink/50">{entry.status === "waiting" ? `Position ${entry.position ?? "—"}` : "In progress"} · {entry.contactNumber}</p>
                    {entry.noShowRiskReason && <p className="mt-1 text-xs text-clay">{entry.noShowRiskReason}</p>}
                    {(customerDetails[entry.contactNumber]?.isVip || customerDetails[entry.contactNumber]?.tags.length || entry.packageTitle || entry.promotionTitle) && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {customerDetails[entry.contactNumber]?.isVip && <span className="rounded-full bg-gold-light px-2 py-0.5 text-[10px] font-semibold text-ink/75">VIP customer</span>}
                        {customerDetails[entry.contactNumber]?.tags.map((tag) => <span key={tag.name} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${TAG_STYLES[tag.color] ?? "bg-porcelain text-ink/60"}`}>{tag.name}</span>)}
                        {entry.packageTitle && <span className="rounded-full bg-info-soft px-2 py-0.5 text-[10px] font-semibold text-info">Package: {entry.packageTitle}</span>}
                        {entry.promotionTitle && <span className="rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-semibold text-success">Offer: {entry.promotionTitle}</span>}
                      </div>
                    )}
                    {entry.additionalNotes && (
                      <p className="mt-1 text-xs italic text-ink/40">"{entry.additionalNotes}"</p>
                    )}
                  </div>
                </div>

                {entry.status === "waiting" && (
                  <button
                    onClick={() => handleEntryStatusChange(entry.id, "cancelled")}
                    className="rounded-md border border-mist px-3 py-1.5 text-xs font-medium text-ink/60"
                  >
                    Cancel visit
                  </button>
                )}
              </div>

              <div className="mt-3 border-t border-mist/50 pt-3">
                {entry.services.some((service) => service.status === "in_service") && (
                  <p className="mb-2 text-xs text-ink/50">Finish the current service before starting another.</p>
                )}
                <ul className="space-y-2">
                  {entry.services.map((item) => (
                  <li key={item.id} className="rounded-md bg-[var(--app-canvas)]/70 px-3 py-2 transition-colors hover:bg-[var(--app-surface-soft)]">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-ink">{item.name} <span className="text-ink/40">· {item.category}</span></p>
                        <p className="mt-1 text-xs text-ink/55">
                          {item.status === "pending" && entry.status === "in_service"
                            ? "Up next"
                            : item.status === "pending"
                              ? item.customerStage === "called" ? "Called" : "Waiting"
                              : item.status === "in_service" ? "In service"
                                : item.status === "completed" ? "Completed" : "Cancelled"}
                        </p>
                        {entry.services[0]?.id === item.id && (
                          <div className="mt-2">
                            <QueueProgress
                              status={entry.status}
                              customerStage={entry.services.some((service) => service.status === "in_service") ? "in_service" : "waiting"}
                              services={entry.services.map((service) => ({
                                id: service.id,
                                name: service.name,
                                status: service.status,
                                customerStage: service.customerStage,
                              }))}
                            />
                          </div>
                        )}
                        {item.preferredStaffId && (
                          <p className="mt-1 text-xs font-medium text-ink/65">
                            Requested stylist: {staff.find((member) => member.id === item.preferredStaffId)?.fullName ?? "Preference saved"}
                          </p>
                        )}
                        <p className="mt-1 text-xs font-medium text-sage-deep">Station: {item.stationLabel ?? "Not assigned"} · Service seat: {item.customerServiceSeatLabel ?? "Not assigned"}</p>
                      </div>

                      {item.status === "pending"
                        && startingItemId !== item.id && (
                        <button
                          onClick={() => handleOpenStartPicker(item)}
                          className="dashboard-primary-action rounded-md px-3 py-1 text-[11px] font-semibold"
                        >
                          Start
                        </button>
                      )}
                      {item.status === "in_service" && (
                        <button
                          onClick={() => handleCompleteItem(item.id)}
                          className="dashboard-primary-action rounded-md px-3 py-1 text-[11px] font-semibold"
                        >
                          Done
                        </button>
                      )}
                    </div>

                    {item.status === "pending" && entry.status === "waiting" && rebalanceCandidates(item).length > 0 && (
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                        <div className="sr-only">
                          Suggested staff are ordered by lowest active queue workload.
                        </div>
                        <select
                          aria-label={`Staff member to propose for ${item.name}`}
                          value={rebalanceStaffByItem[item.id] ?? ""}
                          onChange={(event) => setRebalanceStaffByItem((current) => ({
                            ...current,
                            [item.id]: event.target.value,
                          }))}
                          className="dashboard-filter-control min-h-9 flex-1 text-xs"
                        >
                          <option value="">Select eligible staff for rebalance</option>
                          {rebalanceCandidates(item).map((member, index) => (
                            <option key={member.id} value={member.id}>
                              {index === 0 ? "Suggested · " : ""}{member.fullName} · {activeWorkload(member.id)} active services
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={!rebalanceStaffByItem[item.id] || requestingRebalanceItemId === item.id}
                          onClick={() => void handleRequestRebalance(item)}
                          className="rounded-lg border border-sage/40 px-3 py-2 text-xs font-semibold text-sage-deep disabled:opacity-40"
                        >
                          {requestingRebalanceItemId === item.id ? "Sending…" : "Propose rebalance"}
                        </button>
                      </div>
                    )}

                    {startingItemId === item.id
                      && (
                      <div className="mt-2 rounded-md border border-sage/30 bg-sage/5 p-2">
                        {stationsLoading ? (
                          <div className="h-8 animate-pulse rounded bg-porcelain" />
                        ) : availableStations.length === 0 || availableServiceSeats.length === 0 ? (
                          <p className="text-[11px] text-clay">
                            {availableStations.length === 0
                              ? "No free stations for this category right now."
                              : "No free service seats for this category right now."}
                          </p>
                        ) : (
                          <>
                            <select
                              value={selectedStationId}
                              onChange={(e) => setSelectedStationId(e.target.value)}
                              className="dashboard-filter-control w-full outline-none focus:border-sage"
                              aria-label="Choose station"
                            >
                              <option value="">Choose a station…</option>
                              <option value="auto">Auto-assign first available</option>
                              {availableStations.map((station) => (
                                <option key={station.id} value={station.id}>{station.label}</option>
                              ))}
                            </select>
                          </>
                        )}
                        {serviceSeatOptions.length > 0 && (
                          <div className="mt-2 space-y-1">
                            <p className="text-[10px] font-semibold text-ink/60">Choose a chair from the salon map</p>
                            <ServiceSeatMapPicker
                              seats={serviceSeatOptions}
                              selectedSeatId={selectedServiceSeatId}
                              onSelect={setSelectedServiceSeatId}
                              disabled={stationsLoading || availableStations.length === 0 || availableServiceSeats.length === 0}
                            />
                          </div>
                        )}
                        <select
                          value={selectedStaffId}
                          onChange={(e) => setSelectedStaffId(e.target.value)}
                          className="dashboard-filter-control mt-2 w-full outline-none focus:border-sage"
                        >
                          <option value="">Choose staff…</option>
                          {staff.filter((member) =>
                            staffCanPerformCategory(serviceLaneForCategory(member.staffRole), entry.services.find((service) => service.id === startingItemId)?.category ?? "")
                            && (selectedStationId === "auto"
                              ? true
                              : selectedStation?.homeStaffId
                                ? member.id === selectedStation.homeStaffId
                                : !staffWithAssignedStation.has(member.id))
                          ).map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.fullName}{member.accountRole === "admin" ? " · Manager / Hairstylist" : ""}
                            </option>
                          ))}
                        </select>
                        <div className="mt-2 flex gap-2">
                          <button
                            onClick={() => setStartingItemId(null)}
                            className="flex-1 rounded-md border border-mist py-1 text-[11px] font-medium text-ink/60"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleConfirmStart(item.id)}
                            disabled={!selectedStationId || !selectedStaffId || !selectedServiceSeatId}
                            className="dashboard-primary-action flex-1 rounded-md py-1 text-[11px] font-semibold disabled:opacity-40"
                          >
                            Confirm
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                  ))}
                </ul>
                {entry.status === "waiting" || entry.status === "in_service" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <select
                      aria-label={`Add a service for ${entry.customerName}`}
                      value={selectedAddOnByEntry[entry.id] ?? ""}
                      onChange={(event) => setSelectedAddOnByEntry((current) => ({ ...current, [entry.id]: event.target.value }))}
                      className="dashboard-filter-control min-w-0 flex-1 outline-none focus:border-sage"
                    >
                      <option value="">Add an available service…</option>
                      {addOnServices.map((service) => (
                        <option key={service.id} value={service.id}>
                          {service.name} · ₱{Number(service.price).toFixed(2)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void handleAddService(entry.id)}
                      disabled={!selectedAddOnByEntry[entry.id] || addingServiceEntryId === entry.id}
                      className="dashboard-primary-action rounded-md px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {addingServiceEntryId === entry.id ? "Adding…" : "Add service"}
                    </button>
                  </div>
                ) : null}
              </div>
            </li>
          );
          })}
        </ul>
      )}
      {pendingReorder && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/35 p-0 backdrop-blur-sm sm:items-center sm:p-5">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="reorder-dialog-title"
            onSubmit={(event) => void handleConfirmReorder(event)}
            className="w-full rounded-t-2xl border border-[var(--app-border)] bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-2xl sm:p-6"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sage-deep">Queue adjustment</p>
            <h2 id="reorder-dialog-title" className="mt-1 font-display text-xl font-semibold text-ink">Reorder ticket {formatTicketNumber(pendingReorder.ticketNumber)}</h2>
            <p className="mt-1 text-sm text-ink/60">Moving it to position {pendingReorder.position}. Add a reason for the audit log.</p>
            <label htmlFor="reorder-reason" className="mt-4 block text-sm font-semibold text-ink/75">
              Reason
              <textarea
                id="reorder-reason"
                required
                maxLength={240}
                value={reorderReason}
                onChange={(event) => setReorderReason(event.target.value)}
                className="dashboard-filter-control mt-1.5 min-h-24 w-full resize-y"
                placeholder="For example: appointment time adjustment"
              />
            </label>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={isReordering}
                onClick={() => setPendingReorder(null)}
                className="min-h-10 rounded-lg border border-mist px-4 text-sm font-semibold text-ink/70 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isReordering || !reorderReason.trim()}
                className="dashboard-primary-action min-h-10 rounded-lg px-4 text-sm font-semibold disabled:opacity-50"
              >
                {isReordering ? "Saving…" : "Confirm reorder"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}