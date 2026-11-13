import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, Coffee, Play } from "lucide-react";
import { useAuth } from "@/shared/context/useAuth";
import { BackButton } from "@/shared/components/BackButton";
import { PhilippinePhoneInput } from "@/shared/components/PhilippinePhoneInput";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { QueueProgress } from "@/shared/components/QueueProgress";
import { formatTicketNumber } from "@/shared/lib/ticketNumber";
import {
  completeServiceItem,
  callStaffServiceItem,
  fetchAvailableStations,
  fetchServiceSeatOptions,
  type QueueEntryRow,
  type QueueEntryServiceItem,
  type AvailableStation,
  type ServiceSeatOption,
  startStaffServiceItem,
  fetchStaffQueue,
  fetchQueueReferencePhoto,
  fetchQueueNoShowRisks,
  subscribeToQueueChanges,
  fetchQueueAddOnServices,
  addServiceToQueue,
  cancelStaffQueueEntry,
  addManualQueueEntry,
  type QueueAddOnService,
  fetchQueueCrowdStatus,
  type QueueCrowdStatus,
  fetchStaffAvailability,
  updateStaffAvailability,
  fetchStaffRebalanceRequests,
  respondToStaffRebalanceRequest,
  type StaffRebalanceRequest,
  type StaffAvailability,
} from "../../../../admin/features/queue/services/queueAdminService";
import { ServiceSeatMapPicker } from "../../../../admin/features/queue/components/SalonMap";
import { useSalonHours } from "@/shared/hooks/useSalonHours";
import { formatSalonTime, isAppointmentWithinSalonHours } from "@/shared/lib/salonHours";

export default function StaffQueuePage() {
  const { currentUser } = useAuth();
  const { salonHours, salonHoursError } = useSalonHours();
  const [entries, setEntries] = useState<QueueEntryRow[]>([]);
  const [queueSearch, setQueueSearch] = useState("");
  const [queueFilter, setQueueFilter] = useState<"all" | "waiting" | "in_service">("all");
  const [crowdStatus, setCrowdStatus] = useState<QueueCrowdStatus | null>(null);
  const [staffAvailability, setStaffAvailability] = useState<StaffAvailability>("available");
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [rebalanceRequests, setRebalanceRequests] = useState<StaffRebalanceRequest[]>([]);
  const [respondingToRebalanceId, setRespondingToRebalanceId] = useState<string | null>(null);
  const [isUpdatingAvailability, setIsUpdatingAvailability] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [startingItemId, setStartingItemId] = useState<string | null>(null);
  const [callingItemId, setCallingItemId] = useState<string | null>(null);
  const [availableStations, setAvailableStations] = useState<AvailableStation[]>([]);
  const [availableServiceSeats, setAvailableServiceSeats] = useState<ServiceSeatOption[]>([]);
  const [serviceSeatOptions, setServiceSeatOptions] = useState<ServiceSeatOption[]>([]);
  const [selectedStationId, setSelectedStationId] = useState("");
  const [selectedServiceSeatId, setSelectedServiceSeatId] = useState("");
  const [stationsLoading, setStationsLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [calling, setCalling] = useState(false);
  const [completingItemId, setCompletingItemId] = useState<string | null>(null);
  const [addOnServices, setAddOnServices] = useState<QueueAddOnService[]>([]);
  const [selectedAddOnByEntry, setSelectedAddOnByEntry] = useState<Record<string, string>>({});
  const [addingServiceEntryId, setAddingServiceEntryId] = useState<string | null>(null);
  const [pendingCancellation, setPendingCancellation] = useState<{ entryId: string; customerName: string; ticketNumber: number } | null>(null);
  const [referencePhoto, setReferencePhoto] = useState<string | null>(null);
  const [loadingReferencePhotoId, setLoadingReferencePhotoId] = useState<string | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [isCancellingEntry, setIsCancellingEntry] = useState(false);
  const [isAddingWalkIn, setIsAddingWalkIn] = useState(false);
  const [manualCustomerName, setManualCustomerName] = useState("");
  const [manualContactNumber, setManualContactNumber] = useState("");
  const [manualServiceIds, setManualServiceIds] = useState<string[]>([]);
  const [manualPriority, setManualPriority] = useState<"regular" | "senior" | "pwd" | "vip">("regular");
  const [manualArrivalType, setManualArrivalType] = useState<"walk_in" | "appointment">("walk_in");
  const [manualAppointmentAt, setManualAppointmentAt] = useState("");
  const [manualPrivacyConsent, setManualPrivacyConsent] = useState(false);
  const [isSavingWalkIn, setIsSavingWalkIn] = useState(false);
  const noShowRisksRef = useRef(new Map<string, string>());
  const staffId = currentUser?.id;
  const isReceptionist = currentUser?.staffRole === "receptionist";

  const loadQueue = useCallback(async () => {
    if (!staffId) return;

    try {
      const queueEntries = await fetchStaffQueue(staffId, isReceptionist);
      setEntries(queueEntries.map((entry) => ({
        ...entry,
        noShowRiskReason: noShowRisksRef.current.get(entry.id) ?? null,
      })));
      setErrorMessage(null);
      setIsLoading(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load queue.");
    } finally {
      setIsLoading(false);
    }
  }, [staffId, isReceptionist]);

  useEffect(() => {
    let active = true;
    const refreshQueueExtras = async () => {
      void fetchQueueCrowdStatus()
        .then((crowd) => {
          if (active) setCrowdStatus(crowd);
        })
        .catch((error: unknown) => {
          if (active) setErrorMessage(error instanceof Error ? error.message : "Unable to load queue crowd status.");
        });
      void fetchStaffAvailability()
        .then((availability) => {
          if (active) setStaffAvailability(availability);
        })
        .catch((error: unknown) => {
          if (active) setErrorMessage(error instanceof Error ? error.message : "Unable to load your availability.");
        });
      void fetchStaffRebalanceRequests()
        .then((requests) => {
          if (active) setRebalanceRequests(requests);
        })
        .catch((error: unknown) => {
          if (active) setErrorMessage(error instanceof Error ? error.message : "Unable to load workload requests.");
        });
      try {
        const risks = await fetchQueueNoShowRisks();
        if (!active) return;
        const riskByEntry = new Map(risks.map((risk) => [risk.entryId, risk.reason]));
        noShowRisksRef.current = riskByEntry;
        setEntries((current) => current.map((entry) => ({
          ...entry,
          noShowRiskReason: riskByEntry.get(entry.id) ?? null,
        })));
      } catch (error) {
        if (active) setErrorMessage(error instanceof Error ? error.message : "Unable to load queue risk alerts.");
      }
    };
    void refreshQueueExtras();
    const timer = window.setInterval(() => void refreshQueueExtras(), 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  async function handleToggleAvailability() {
    setIsUpdatingAvailability(true);
    setErrorMessage(null);
    try {
      const nextStatus = staffAvailability === "available" ? "on_break" : "available";
      setStaffAvailability(await updateStaffAvailability(nextStatus));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update your availability.");
    } finally {
      setIsUpdatingAvailability(false);
    }
  }

  async function handleRebalanceResponse(request: StaffRebalanceRequest, response: "accepted" | "declined") {
    setRespondingToRebalanceId(request.id);
    setErrorMessage(null);
    try {
      await respondToStaffRebalanceRequest(request.id, response);
      setRebalanceRequests((current) => current.filter((item) => item.id !== request.id));
      setErrorMessage(null);
      await loadQueue();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to respond to workload request.");
    } finally {
      setRespondingToRebalanceId(null);
    }
  }

  useEffect(() => {
    // Load initial queue data and subscribe to external realtime updates.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadQueue();
    const unsubscribe = subscribeToQueueChanges(loadQueue);
    const timer = window.setInterval(() => void loadQueue(), 15_000);
    return () => {
      window.clearInterval(timer);
      unsubscribe();
    };
  }, [loadQueue]);

  useEffect(() => {
    void fetchQueueAddOnServices()
      .then(setAddOnServices)
      .catch((error: unknown) => setErrorMessage(error instanceof Error ? error.message : "Unable to load services."));
  }, []);

  async function handleComplete(itemId: string) {
    setCompletingItemId(itemId);
    setErrorMessage(null);
    try {
      await completeServiceItem(itemId);
      await loadQueue();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to complete service.");
    } finally {
      setCompletingItemId(null);
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
      await loadQueue();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to add service.");
    } finally {
      setAddingServiceEntryId(null);
    }
  }

  async function handleCancelEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pendingCancellation || !cancellationReason.trim()) return;
    setIsCancellingEntry(true);
    setErrorMessage(null);
    try {
      await cancelStaffQueueEntry(pendingCancellation.entryId, cancellationReason.trim());
      setPendingCancellation(null);
      setCancellationReason("");
      await loadQueue();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to cancel queue visit.");
    } finally {
      setIsCancellingEntry(false);
    }
  }

  async function handleViewReferencePhoto(entryId: string) {
    setLoadingReferencePhotoId(entryId);
    setErrorMessage(null);
    try {
      setReferencePhoto(await fetchQueueReferencePhoto(entryId));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to open the reference photo.");
    } finally {
      setLoadingReferencePhotoId(null);
    }
  }

  async function handleAddWalkIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    if (manualArrivalType === "appointment") {
      if (!salonHours) {
        setErrorMessage(salonHoursError ?? "Salon business hours are still loading. Please try again.");
        return;
      }
      if (!isAppointmentWithinSalonHours(manualAppointmentAt, salonHours)) {
        setErrorMessage(`Appointments must start during salon hours (${formatSalonTime(salonHours.openingTime)}–${formatSalonTime(salonHours.closingTime)}).`);
        return;
      }
    }
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
      await loadQueue();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to add walk-in.");
    } finally {
      setIsSavingWalkIn(false);
    }
  }

  async function handleOpenCall(item: QueueEntryServiceItem) {
    if (staffAvailability === "on_break") {
      setErrorMessage("End your break before calling a customer.");
      return;
    }
    if (!currentUser) {
      setErrorMessage("Your staff session is unavailable. Please sign in again.");
      return;
    }

    setErrorMessage(null);
    setCallingItemId(item.id);
    setSelectedServiceSeatId("");
    setStationsLoading(true);
    try {
      const serviceSeats = await fetchServiceSeatOptions(item.category, item.id);
      setServiceSeatOptions(serviceSeats);
      const availableSeats = serviceSeats.filter((seat) =>
        seat.isEligible && (seat.status === "free" || seat.sharedWithVisit)
      );
      setAvailableServiceSeats(availableSeats);
      const assignedSeat = availableSeats.find((seat) => seat.id === item.customerServiceSeatId);
      const serviceSeat = assignedSeat ?? (availableSeats.length === 1 ? availableSeats[0] : null);
      if (availableSeats.length === 0) {
        setCallingItemId(null);
        setErrorMessage("No free service chair matches this service right now.");
      } else {
        setSelectedServiceSeatId(serviceSeat?.id ?? "");
      }
    } catch (error) {
      setCallingItemId(null);
      setServiceSeatOptions([]);
      setAvailableServiceSeats([]);
      setErrorMessage(error instanceof Error ? error.message : "Failed to load service chairs.");
    } finally {
      setStationsLoading(false);
    }
  }

  async function handleCall(itemId: string) {
    if (!currentUser || !selectedServiceSeatId) {
      setErrorMessage("Please select a service chair before calling the customer.");
      return;
    }

    setCalling(true);
    setErrorMessage(null);
    try {
      await callStaffServiceItem(itemId, { customerServiceSeatId: selectedServiceSeatId });
      setCallingItemId(null);
      setSelectedServiceSeatId("");
      await loadQueue();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to call the customer.");
    } finally {
      setCalling(false);
    }
  }

  async function handleOpenAccept(item: QueueEntryServiceItem) {
    if (staffAvailability === "on_break") {
      setErrorMessage("End your break before starting a new service.");
      return;
    }
    if (!currentUser) {
      setErrorMessage("Your staff session is unavailable. Please sign in again.");
      return;
    }
    if (item.customerStage !== "called" || !item.customerServiceSeatId) {
      setErrorMessage("Call the customer and assign a service chair before starting.");
      return;
    }

    setErrorMessage(null);
    setStartingItemId(item.id);
    setSelectedStationId("");
    setSelectedServiceSeatId("");
    setStationsLoading(true);
    try {
      const [stations, serviceSeats] = await Promise.all([
        fetchAvailableStations(item.category, currentUser.id, item.id),
        fetchServiceSeatOptions(item.category, item.id),
      ]);
      setAvailableStations(stations);
      setServiceSeatOptions(serviceSeats);
      const availableSeats = serviceSeats.filter((seat) =>
        seat.isEligible && (seat.status === "free" || seat.sharedWithVisit)
      );
      setAvailableServiceSeats(availableSeats);
      const reservedStation = stations.find((station) => station.id === item.stationId);
      const station = reservedStation ?? (stations.length === 1 ? stations[0] : null);
      const serviceSeat = availableSeats.find((seat) => seat.id === item.customerServiceSeatId);
      if (stations.length === 0 || !serviceSeat) {
        setStartingItemId(null);
        if (stations.length === 0) {
          setErrorMessage("No free station matches this service right now.");
        } else if (availableSeats.length > 0) {
          setCallingItemId(item.id);
          setSelectedServiceSeatId(availableSeats.length === 1 ? availableSeats[0].id : "");
          setErrorMessage("The called chair is no longer available. Choose another chair and call the customer again.");
        } else {
          setErrorMessage("The called chair is no longer available, and no free service chair matches this service.");
        }
      } else {
        setSelectedStationId(station?.id ?? "");
        setSelectedServiceSeatId(serviceSeat.id);
      }
    } catch (error) {
      setStartingItemId(null);
      setServiceSeatOptions([]);
      setAvailableServiceSeats([]);
      setErrorMessage(error instanceof Error ? error.message : "Failed to load stations and service chairs.");
    } finally {
      setStationsLoading(false);
    }
  }

  async function handleAccept(itemId: string) {
    if (staffAvailability === "on_break") {
      setErrorMessage("End your break before starting a new service.");
      return;
    }
    if (!currentUser || !selectedStationId || !selectedServiceSeatId) {
      setErrorMessage("Please select a station and confirm the assigned service chair first.");
      return;
    }

    setStarting(true);
    setErrorMessage(null);
    try {
      await startStaffServiceItem(itemId, selectedStationId, selectedServiceSeatId);
      setStartingItemId(null);
      setSelectedStationId("");
      setSelectedServiceSeatId("");
      await loadQueue();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to start this service.");
    } finally {
      setStarting(false);
    }
  }

  const visibleServiceItems = entries.flatMap((entry) =>
    entry.services
      .filter((item: QueueEntryServiceItem) => isReceptionist || item.canStaffHandle || item.status !== "pending")
      .map((item) => ({ entry, item }))
  ).filter(({ entry, item }) => {
    const query = queueSearch.trim().toLowerCase();
    const matchesSearch = !query
      || `${entry.customerName} ${entry.contactNumber} ${entry.ticketNumber} ${item.name}`.toLowerCase().includes(query);
    const matchesStatus = queueFilter === "all" || item.status === queueFilter;
    return matchesSearch && matchesStatus;
  });
  const waitingVisits = entries.filter((entry) => entry.status === "waiting").length;
  const inServiceVisits = entries.filter((entry) => entry.status === "in_service").length;
  const assignedServices = entries.reduce((count, entry) =>
    count + entry.services.filter((item) => item.canStaffHandle && item.status === "pending").length, 0
  );
  const notificationCount = rebalanceRequests.length + entries.filter((entry) => entry.noShowRiskReason).length;

  return (
    <div className="pastel-pink-gradient-page min-h-screen text-ink">
      <header className="sticky top-0 z-40 border-b border-[var(--app-border)] bg-white/70 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <BackButton to="/lyn-co/staff" label="Back to staff dashboard" />
            <h1 className="ui-section-title">{isReceptionist ? "Queue Desk" : "My Queue"}</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                aria-label={notificationCount ? `Notifications, ${notificationCount} unread` : "Notifications"}
                aria-haspopup="dialog"
                aria-expanded={isNotificationsOpen}
                onClick={() => setIsNotificationsOpen((open) => !open)}
                className="relative inline-flex h-11 w-11 items-center justify-center rounded-lg border border-mist bg-white text-ink/70 transition hover:bg-porcelain focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage-deep"
              >
                <Bell size={18} aria-hidden="true" />
                {notificationCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-clay px-1 text-[10px] font-bold text-white" aria-hidden="true">
                    {notificationCount > 9 ? "9+" : notificationCount}
                  </span>
                )}
              </button>
              {isNotificationsOpen && (
                <section
                  role="dialog"
                  aria-label="Staff notifications"
                  className="absolute right-0 top-12 z-50 max-h-[min(70dvh,28rem)] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-mist bg-white p-4 text-ink shadow-xl"
                >
                  <h2 className="text-sm font-semibold">Notifications</h2>
                  {notificationCount === 0 ? (
                    <p className="mt-2 text-xs leading-5 text-ink/60">You’re all caught up. Queue alerts and workload requests will appear here.</p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {entries.filter((entry) => entry.noShowRiskReason).map((entry) => (
                        <li key={`risk-${entry.id}`} className="rounded-lg border border-clay/20 bg-red-50 p-3">
                          <p className="text-xs font-semibold text-ink">
                            No-show risk · Ticket {formatTicketNumber(entry.ticketNumber)}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-ink/70">
                            {entry.customerName}: {entry.noShowRiskReason}
                          </p>
                        </li>
                      ))}
                      {rebalanceRequests.map((request) => (
                        <li key={`rebalance-${request.id}`} className="rounded-lg border border-sage/25 bg-sage-light/40 p-3">
                          <p className="text-xs font-semibold text-ink">Workload request · Ticket {formatTicketNumber(request.ticketNumber)}</p>
                          <p className="mt-1 text-xs leading-5 text-ink/70">
                            {request.requestedByName} requested that you take {request.serviceName} for {request.customerName}.
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </div>
            <button
              type="button"
              onClick={() => void handleToggleAvailability()}
              disabled={isUpdatingAvailability}
              className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-bold shadow-sm transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage-deep disabled:cursor-not-allowed disabled:opacity-50 ${
                staffAvailability === "available"
                  ? "border border-gold/40 bg-gold-light text-ink"
                  : "bg-sage-deep text-white"
              }`}
            >
              {staffAvailability === "available" ? <Coffee size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
              {isUpdatingAvailability ? "Saving…" : staffAvailability === "available" ? "Start break" : "End break"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
        {staffAvailability === "on_break" && (
          <p role="status" className="mb-4 rounded-lg border border-gold/30 bg-gold-light px-4 py-3 text-sm text-ink/75">
            You are on break. New services are paused; you can finish a service already in progress.
          </p>
        )}
        {rebalanceRequests.length > 0 && (
          <section aria-labelledby="rebalance-requests-title" className="mb-5 rounded-xl border border-sage/30 bg-white p-4 shadow-sm">
            <h2 id="rebalance-requests-title" className="font-display text-lg font-semibold text-ink">Workload rebalance requests</h2>
            <p className="mt-1 text-sm text-ink/60">Accepting assigns you the waiting service; declining leaves the current assignment unchanged.</p>
            <ul className="mt-3 space-y-3">
              {rebalanceRequests.map((request) => (
                <li key={request.id} className="flex flex-col gap-3 rounded-lg border border-mist p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      Ticket {formatTicketNumber(request.ticketNumber)} · {request.customerName}
                    </p>
                    <p className="mt-1 text-xs text-ink/60">{request.serviceName} · {request.serviceCategory}</p>
                    <p className="mt-1 text-xs text-ink/50">Proposed by {request.requestedByName} from {request.fromStaffName}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={respondingToRebalanceId === request.id || staffAvailability === "on_break"}
                      onClick={() => void handleRebalanceResponse(request, "accepted")}
                      className="ui-button-primary min-h-9 rounded-lg px-3 text-xs disabled:opacity-40"
                    >
                      {respondingToRebalanceId === request.id ? "Saving…" : "Accept"}
                    </button>
                    <button
                      type="button"
                      disabled={respondingToRebalanceId === request.id}
                      onClick={() => void handleRebalanceResponse(request, "declined")}
                      className="min-h-9 rounded-lg border border-mist px-3 text-xs font-semibold text-ink/70 disabled:opacity-40"
                    >
                      Decline
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="mb-4 flex justify-end">
          <button type="button" onClick={() => setIsAddingWalkIn((open) => !open)} className="ui-button-primary">
            {isAddingWalkIn ? "Close walk-in form" : "Add walk-in"}
          </button>
        </div>
        {isAddingWalkIn && (
          <form onSubmit={(event) => void handleAddWalkIn(event)} className="mb-5 grid gap-3 rounded-xl border border-mist bg-white p-4 shadow-sm sm:grid-cols-2">
            <label className="text-xs font-medium text-ink/70">
              Customer name
              <input required maxLength={100} value={manualCustomerName} onChange={(event) => setManualCustomerName(event.target.value)} className="dashboard-filter-control mt-1 block w-full" />
            </label>
            <label className="text-xs font-medium text-ink/70">
              Mobile number
              <PhilippinePhoneInput required value={manualContactNumber} onChange={setManualContactNumber} className="mt-1" />
            </label>
            <fieldset className="rounded-lg border border-mist p-3 sm:col-span-2">
              <legend className="px-1 text-xs font-medium text-ink/70">Select services</legend>
              <div className="grid max-h-36 gap-2 overflow-y-auto sm:grid-cols-2">
                {addOnServices.map((service) => (
                  <label key={service.id} className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={manualServiceIds.includes(service.id)} onChange={(event) => setManualServiceIds((current) => event.target.checked ? [...current, service.id] : current.filter((id) => id !== service.id))} />
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
                <input required type="datetime-local" value={manualAppointmentAt} onChange={(event) => setManualAppointmentAt(event.target.value)} disabled={!salonHours} className="dashboard-filter-control mt-1 block w-full" />
              </label>
            )}
            {manualArrivalType === "appointment" && (
              salonHoursError
                ? <p role="alert" className="text-xs text-clay sm:col-span-2">Unable to verify appointment times: {salonHoursError}</p>
                : salonHours
                  ? <p className="text-xs text-ink/65 sm:col-span-2">Appointments must start during salon hours ({formatSalonTime(salonHours.openingTime)}–{formatSalonTime(salonHours.closingTime)}).</p>
                  : <p role="status" className="text-xs text-ink/65 sm:col-span-2">Loading salon hours…</p>
            )}
            <label className="flex items-start gap-2 text-xs text-ink/70">
              <input type="checkbox" checked={manualPrivacyConsent} onChange={(event) => setManualPrivacyConsent(event.target.checked)} className="mt-0.5" />
              Customer was informed of the privacy notice and consented to joining the queue.
            </label>
            <button type="submit" disabled={isSavingWalkIn || manualServiceIds.length === 0 || !manualPrivacyConsent || (manualArrivalType === "appointment" && !salonHours)} className="ui-button-primary sm:col-span-2">
              {isSavingWalkIn ? "Adding…" : "Add to queue"}
            </button>
          </form>
        )}
        {errorMessage && (
          <p role="alert" className="dashboard-error-message mb-4">
            {errorMessage}
          </p>
        )}
        {crowdStatus?.crowded && (
          <p role="alert" className="dashboard-error-message mb-4 font-semibold">
            Queue crowding alert: {crowdStatus.waiting} customers are waiting (threshold {crowdStatus.threshold}).
          </p>
        )}

        <section aria-label="Queue summary" className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            { label: "Waiting visits", value: waitingVisits },
            { label: "In service", value: inServiceVisits },
            { label: isReceptionist ? "Queue entries" : "Services for you", value: isReceptionist ? entries.length : assignedServices },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-mist bg-white p-3 shadow-sm sm:p-4">
              <p className="ui-metadata font-semibold">{stat.label}</p>
              <p className="mt-1 font-display text-2xl font-semibold text-ink">{stat.value}</p>
            </div>
          ))}
        </section>

        <div className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label htmlFor="staff-queue-search" className="sr-only">Search queue</label>
          <input
            id="staff-queue-search"
            type="search"
            value={queueSearch}
            onChange={(event) => setQueueSearch(event.target.value)}
            placeholder="Search customer, ticket, phone, or service"
            className="dashboard-filter-control min-h-11 w-full"
          />
          <label className="sr-only" htmlFor="staff-queue-filter">Filter queue status</label>
          <select
            id="staff-queue-filter"
            value={queueFilter}
            onChange={(event) => setQueueFilter(event.target.value as typeof queueFilter)}
            className="dashboard-filter-control min-h-11 min-w-40"
          >
            <option value="all">All active visits</option>
            <option value="waiting">Waiting</option>
            <option value="in_service">In service</option>
          </select>
        </div>

        {isLoading ? (
          <div className="h-40 animate-pulse rounded-2xl bg-white" />
        ) : visibleServiceItems.length === 0 ? (
          <div className="rounded-2xl border border-mist bg-white p-10 text-center">
            <p className="text-sm font-semibold">{entries.length === 0 ? "No active queue visits" : "No visits match your search or filter"}</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {visibleServiceItems.map(({ entry, item }) => {
              const isFirstVisibleItem = visibleServiceItems.find(({ entry: candidate }) => candidate.id === entry.id)?.item.id === item.id;
              const serviceQueueLabel = item.status === "pending" && entry.status === "in_service"
                ? "Up next"
                : item.status === "pending"
                  ? item.customerStage === "called" ? "Called" : "Waiting"
                  : item.status === "in_service" ? "In service"
                    : item.status === "completed" ? "Completed" : "Cancelled";
              return (
              <li key={item.id} className="rounded-xl border border-mist bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-ink">{item.name}</p>
                    <p className="mt-1 text-sm text-ink/60">Ticket {formatTicketNumber(entry.ticketNumber)} · {entry.customerName}</p>
                    <p className="text-sm text-ink/55">{entry.status === "waiting" ? `Queue position ${entry.position ?? "—"}` : "Visit in progress"} · {entry.contactNumber}</p>
                    {item.preferredStaffId && (
                      <p className="mt-1 text-sm font-medium text-ink/65">
                        Customer requested {item.preferredStaffId === currentUser?.id ? "you" : "another stylist"}
                      </p>
                    )}
                    {entry.noShowRiskReason && (
                      <p className="mt-1 text-sm font-medium text-clay">No-show risk: {entry.noShowRiskReason}</p>
                    )}
                    {isFirstVisibleItem && (entry.additionalNotes || entry.referencePhotoPath) && (
                      <div className="mt-2 rounded-lg bg-porcelain/70 p-3">
                        {entry.additionalNotes && <p className="text-sm italic text-ink/70">Note: {entry.additionalNotes}</p>}
                        {entry.referencePhotoPath && (
                          <button
                            type="button"
                            onClick={() => void handleViewReferencePhoto(entry.id)}
                            disabled={loadingReferencePhotoId === entry.id}
                            className="mt-2 rounded-lg border border-mist px-3 py-1.5 text-xs font-semibold text-sage-deep hover:bg-sage-light disabled:opacity-50"
                          >
                            {loadingReferencePhotoId === entry.id ? "Opening photo…" : "View reference photo"}
                          </button>
                        )}
                      </div>
                    )}
                    <p className="mt-1 text-sm font-semibold text-sage-deep">
                      Station: {item.stationLabel ?? "Not assigned"} · Service seat: {item.customerServiceSeatLabel ?? "Not assigned"}
                    </p>
                    <p className="mt-1 text-sm text-ink/60">
                      {serviceQueueLabel}
                    </p>
                  </div>
                  <StatusBadge status={item.status === "pending" ? item.customerStage : item.status}>
                    {serviceQueueLabel}
                  </StatusBadge>
                </div>
                {isFirstVisibleItem && (
                  <div className="mt-3">
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

                <div className="mt-3 border-t border-mist pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    {item.status === "in_service" && item.staffUpdate && (
                      <p className="min-w-0 flex-1 text-sm text-ink/65">{item.staffUpdate}</p>
                    )}
                    {item.status === "pending" && item.canStaffHandle && (
                      <button
                        type="button"
                        onClick={() => void (item.customerStage === "called" && item.customerServiceSeatId
                          ? handleOpenAccept(item)
                          : handleOpenCall(item))}
                        disabled={startingItemId === item.id || callingItemId === item.id || staffAvailability === "on_break"}
                        className="ui-button-primary disabled:opacity-50"
                      >
                        {callingItemId === item.id ? "Calling..." : startingItemId === item.id
                          ? "Loading..."
                          : item.customerStage === "called" && item.customerServiceSeatId
                            ? "Start service"
                            : "Call customer"}
                      </button>
                    )}
                    {item.status === "in_service" && item.assignedStaffId === currentUser?.id && (
                      <button
                        type="button"
                        onClick={() => handleComplete(item.id)}
                        disabled={completingItemId === item.id}
                        className="ui-button-primary disabled:opacity-50"
                      >
                        {completingItemId === item.id ? "Completing..." : "Complete service"}
                      </button>
                    )}
                  </div>
                </div>
                {isFirstVisibleItem && (entry.status === "waiting" || entry.status === "in_service") && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-mist pt-3">
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
                      className="dashboard-primary-action min-h-10 rounded-md px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {addingServiceEntryId === entry.id ? "Adding…" : "Add service"}
                    </button>
                  </div>
                )}
                {isFirstVisibleItem && entry.status === "waiting" && (
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setPendingCancellation({
                          entryId: entry.id,
                          customerName: entry.customerName,
                          ticketNumber: entry.ticketNumber,
                        });
                        setCancellationReason("");
                      }}
                      className="min-h-10 rounded-md border border-clay/40 px-4 text-sm font-semibold text-clay transition-colors hover:bg-clay-light"
                    >
                      Cancel visit
                    </button>
                  </div>
                )}
              </li>
              );
            })}
          </ul>
        )}
      </main>
      {startingItemId && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/35 p-0 backdrop-blur-sm sm:items-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget && !starting) { setStartingItemId(null); setSelectedStationId(""); } }}>
          <section role="dialog" aria-modal="true" aria-labelledby="station-dialog-title" className="max-h-[min(92dvh,900px)] w-full min-w-0 overflow-y-auto rounded-t-2xl border border-[var(--app-border)] bg-white p-5 shadow-2xl sm:max-w-2xl sm:rounded-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sage-deep">Start service</p>
                <h2 id="station-dialog-title" className="mt-1 font-display text-xl font-semibold text-ink">Assign a station and chair</h2>
                <p className="mt-1 text-sm text-ink/60">{visibleServiceItems.find(({ item }) => item.id === startingItemId)?.item.name}</p>
              </div>
              <button type="button" aria-label="Close dialog" disabled={starting} onClick={() => { setStartingItemId(null); setSelectedStationId(""); }} className="dashboard-icon-control flex h-9 w-9 items-center justify-center text-ink/65 transition-colors hover:text-ink disabled:opacity-50">×</button>
            </div>
            {stationsLoading ? <p className="mt-5 rounded-lg bg-sage-light/60 p-4 text-sm text-ink/65">Finding available stations and service chairs…</p> : (
              <div className="mt-5 space-y-3">
                {availableStations.length === 0 ? <p role="alert" className="dashboard-error-message">No free station matches this service right now.</p> : (
                  <label className="block text-xs font-semibold text-ink/65">Available station
                    <select value={selectedStationId} onChange={(event) => setSelectedStationId(event.target.value)} disabled={starting} className="dashboard-filter-control mt-1 w-full" aria-label="Select station">
                      <option value="">Select station</option>
                      {availableStations.map((station) => <option key={station.id} value={station.id}>{station.label}</option>)}
                    </select>
                  </label>
                )}
                {serviceSeatOptions.length === 0 ? (
                  <p role="alert" className="dashboard-error-message">No service chairs are configured on the salon map.</p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-ink/65">Customer's called chair</p>
                    <ServiceSeatMapPicker
                      seats={serviceSeatOptions}
                      selectedSeatId={selectedServiceSeatId}
                      onSelect={setSelectedServiceSeatId}
                      disabled={starting || visibleServiceItems.find(({ item }) => item.id === startingItemId)?.item.customerStage === "called"}
                    />
                    {availableServiceSeats.length === 0 && (
                      <p role="alert" className="dashboard-error-message text-xs">No free service chair matches this service right now.</p>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" disabled={starting} onClick={() => { setStartingItemId(null); setSelectedStationId(""); }} className="form-cancel-action rounded-lg px-4 text-sm font-semibold">Cancel</button>
              <button type="button" onClick={() => void handleAccept(startingItemId)} disabled={stationsLoading || starting || !selectedStationId || !selectedServiceSeatId} className="dashboard-primary-action rounded-lg px-4 text-sm font-semibold disabled:opacity-50">{starting ? "Starting..." : "Confirm and start"}</button>
            </div>
          </section>
        </div>
      )}
      {callingItemId && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/35 p-0 backdrop-blur-sm sm:items-center sm:p-5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !calling) {
              setCallingItemId(null);
              setSelectedServiceSeatId("");
            }
          }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="call-customer-title" className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-[var(--app-border)] bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sage-deep">Call customer</p>
                <h2 id="call-customer-title" className="mt-1 font-display text-xl font-semibold text-ink">Assign a chair and send the call</h2>
                <p className="mt-1 text-sm text-ink/60">{visibleServiceItems.find(({ item }) => item.id === callingItemId)?.item.name}</p>
              </div>
              <button type="button" aria-label="Close dialog" disabled={calling} onClick={() => { setCallingItemId(null); setSelectedServiceSeatId(""); }} className="dashboard-icon-control flex h-9 w-9 items-center justify-center text-ink/65 transition-colors hover:text-ink disabled:opacity-50">×</button>
            </div>
            {stationsLoading ? (
              <p className="mt-5 rounded-lg bg-sage-light/60 p-4 text-sm text-ink/65">Finding available service chairs…</p>
            ) : serviceSeatOptions.length === 0 ? (
              <p role="alert" className="dashboard-error-message mt-5">No service chairs are configured on the salon map.</p>
            ) : (
              <div className="mt-5 space-y-2">
                <p className="text-xs font-semibold text-ink/65">Choose an available chair for the customer to proceed to</p>
                <ServiceSeatMapPicker
                  seats={serviceSeatOptions}
                  selectedSeatId={selectedServiceSeatId}
                  onSelect={setSelectedServiceSeatId}
                  disabled={calling}
                />
              </div>
            )}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" disabled={calling} onClick={() => { setCallingItemId(null); setSelectedServiceSeatId(""); }} className="form-cancel-action rounded-lg px-4 text-sm font-semibold">Cancel</button>
              <button type="button" onClick={() => void handleCall(callingItemId)} disabled={stationsLoading || calling || !selectedServiceSeatId} className="dashboard-primary-action rounded-lg px-4 text-sm font-semibold disabled:opacity-50">{calling ? "Calling..." : "Call customer"}</button>
            </div>
          </section>
        </div>
      )}
      {pendingCancellation && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/35 p-0 backdrop-blur-sm sm:items-center sm:p-5">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-visit-title"
            onSubmit={(event) => void handleCancelEntry(event)}
            className="w-full rounded-t-2xl border border-[var(--app-border)] bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-2xl sm:p-6"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-clay">Queue update</p>
            <h2 id="cancel-visit-title" className="mt-1 font-display text-xl font-semibold text-ink">
              Cancel ticket {formatTicketNumber(pendingCancellation.ticketNumber)}?
            </h2>
            <p className="mt-1 text-sm text-ink/60">{pendingCancellation.customerName}'s waiting visit will be removed from the active queue.</p>
            <label htmlFor="cancellation-reason" className="mt-4 block text-sm font-semibold text-ink/75">
              Reason
              <textarea
                id="cancellation-reason"
                required
                maxLength={240}
                value={cancellationReason}
                onChange={(event) => setCancellationReason(event.target.value)}
                className="dashboard-filter-control mt-1.5 min-h-24 w-full resize-y"
                placeholder="For example: customer requested cancellation"
              />
            </label>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={isCancellingEntry}
                onClick={() => setPendingCancellation(null)}
                className="form-cancel-action min-h-10 rounded-lg px-4 text-sm font-semibold"
              >
                Keep visit
              </button>
              <button
                type="submit"
                disabled={isCancellingEntry || !cancellationReason.trim()}
                className="ui-button-danger disabled:opacity-50"
              >
                {isCancellingEntry ? "Cancelling…" : "Confirm cancellation"}
              </button>
            </div>
          </form>
        </div>
      )}
      {referencePhoto && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-ink/60 p-4" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setReferencePhoto(null);
        }}>
          <div role="dialog" aria-modal="true" aria-labelledby="staff-reference-photo-title" className="w-full max-w-2xl rounded-2xl border border-mist bg-white p-4 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="staff-reference-photo-title" className="font-display text-lg font-semibold text-ink">Customer reference photo</h2>
              <button type="button" aria-label="Close reference photo" onClick={() => setReferencePhoto(null)} className="rounded-lg px-2 text-xl text-ink/50 hover:bg-porcelain">×</button>
            </div>
            <img src={referencePhoto} alt="Customer-provided service reference" className="mx-auto max-h-[75dvh] max-w-full rounded-lg object-contain" />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
