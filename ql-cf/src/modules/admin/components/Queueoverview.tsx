import { useEffect, useState } from "react";
import {
  fetchActiveQueue,
  subscribeToQueueChanges,
  updateQueueEntryStatus,
  reorderQueueEntry,
  startServiceItem,
  completeServiceItem,
  fetchAvailableStations,
  type QueueEntryRow,
  type QueueEntryServiceItem,
  type AvailableStation,
} from "../services/queueAdminService";
import { fetchStaffAccounts, type StaffAccountRow } from "../services/adminService";

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

export function QueueOverview() {
  const [entries, setEntries] = useState<QueueEntryRow[]>([]);
  const [staff, setStaff] = useState<StaffAccountRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [queueSearch, setQueueSearch] = useState("");
  const [queueStatus, setQueueStatus] = useState<"all" | "waiting" | "in_service">("all");

  // Which service item is currently showing its station/staff picker.
  const [startingItemId, setStartingItemId] = useState<string | null>(null);
  const [availableStations, setAvailableStations] = useState<AvailableStation[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string>("");
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [stationsLoading, setStationsLoading] = useState(false);

  async function loadQueue() {
    try {
      const [entryRows, staffRows] = await Promise.all([fetchActiveQueue(), fetchStaffAccounts()]);
      setEntries(entryRows);
      setStaff(staffRows);
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

  async function handleOpenStartPicker(item: QueueEntryServiceItem) {
    setStartingItemId(item.id);
    setSelectedStationId("");
    setSelectedStaffId("");
    setStationsLoading(true);
    try {
      setAvailableStations(await fetchAvailableStations(item.category));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load stations.");
    } finally {
      setStationsLoading(false);
    }
  }

  async function handleConfirmStart(itemId: string) {
    if (!selectedStationId || !selectedStaffId) {
      setErrorMessage("Please select both a station and a staff member.");
      return;
    }
    try {
      await startServiceItem(itemId, selectedStationId, selectedStaffId);
      setStartingItemId(null);
      loadQueue();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to start service.");
    }
  }

  async function handleCompleteItem(itemId: string) {
    try {
      await completeServiceItem(itemId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to complete service.");
    }
  }

  async function handleEntryStatusChange(entryId: string, status: "cancelled" | "no_show") {
    const previous = entries;
    setEntries((current) => current.filter((e) => e.id !== entryId));
    try {
      await updateQueueEntryStatus(entryId, status);
    } catch (error) {
      setEntries(previous);
      setErrorMessage(error instanceof Error ? error.message : "Failed to update status.");
    }
  }

  async function handleMove(entry: QueueEntryRow, direction: "up" | "down") {
    if (entry.position == null) return;
    const targetPosition = direction === "up" ? entry.position - 1 : entry.position + 1;
    if (targetPosition < 1) return;
    try {
      await reorderQueueEntry(entry.id, targetPosition);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to reorder queue.");
    }
  }

  const visibleEntries = entries.filter((entry) => {
    const query = queueSearch.trim().toLowerCase();
    const matchesSearch = !query || `${entry.customerName} ${entry.contactNumber} ${entry.services.map((service) => service.name).join(" ")}`.toLowerCase().includes(query);
    return matchesSearch && (queueStatus === "all" || entry.status === queueStatus);
  });

  if (isLoading) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-porcelain" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display text-lg font-semibold text-ink">Live queue</h2>
        <div className="flex gap-2"><input value={queueSearch} onChange={(event) => setQueueSearch(event.target.value)} placeholder="Search queue..." className="border border-mist px-3 py-2 text-xs outline-none focus:border-sage sm:w-56" aria-label="Search queue" /><select value={queueStatus} onChange={(event) => setQueueStatus(event.target.value as typeof queueStatus)} className="border border-mist bg-white px-3 py-2 text-xs outline-none focus:border-sage" aria-label="Filter queue status"><option value="all">All statuses</option><option value="waiting">Waiting</option><option value="in_service">In service</option></select></div>
      </div>
      {errorMessage && (
        <p role="alert" className="mt-2 text-sm text-clay">
          {errorMessage}
        </p>
      )}

      {visibleEntries.length === 0 ? (
        <p className="mt-6 text-sm text-ink/50">No active queue entries.</p>
      ) : (
        <ul className="mt-6 max-h-[calc(100vh-18rem)] space-y-3 overflow-y-auto pr-2">
          {visibleEntries.map((entry) => (
            <li key={entry.id} className="rounded-lg border border-mist/60 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  {entry.status === "waiting" && (
                    <div className="flex flex-col pt-0.5">
                      <button
                        onClick={() => handleMove(entry, "up")}
                        disabled={entry.position === 1}
                        className="text-ink/30 hover:text-ink disabled:opacity-20"
                        aria-label="Move up"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => handleMove(entry, "down")}
                        className="text-ink/30 hover:text-ink disabled:opacity-20"
                        aria-label="Move down"
                      >
                        ▼
                      </button>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-ink">{entry.customerName}</p>
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
                    </div>
                    <p className="text-xs text-ink/50">
                      {entry.status === "waiting" ? `Position ${entry.position ?? "—"}` : "In progress"} ·{" "}
                      {entry.contactNumber}
                    </p>
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

              {/* Each service tracked and started independently — this is what
                  allows hair and nails to run at the same time for one customer. */}
              <div className="mt-3 space-y-2 border-t border-mist/50 pt-3">
                {entry.services.map((item) => (
                  <div key={item.id} className="rounded-md bg-porcelain/40 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium text-ink">
                          {item.name} <span className="text-ink/40">· {item.category}</span>
                        </p>
                        <p className="text-[11px] text-ink/45">
                          {item.status === "pending" && "Waiting to start"}
                          {item.status === "in_service" && "In progress"}
                          {item.status === "completed" && "Done"}
                          {item.status === "cancelled" && "Cancelled"}
                        </p>
                      </div>

                      {item.status === "pending" && startingItemId !== item.id && (
                        <button
                          onClick={() => handleOpenStartPicker(item)}
                          className="rounded-md bg-sage-deep px-3 py-1 text-[11px] font-semibold text-white"
                        >
                          Start
                        </button>
                      )}
                      {item.status === "in_service" && (
                        <button
                          onClick={() => handleCompleteItem(item.id)}
                          className="rounded-md bg-sage-deep px-3 py-1 text-[11px] font-semibold text-white"
                        >
                          Done
                        </button>
                      )}
                    </div>

                    {startingItemId === item.id && (
                      <div className="mt-2 rounded-md border border-sage/30 bg-sage/5 p-2">
                        {stationsLoading ? (
                          <div className="h-8 animate-pulse rounded bg-porcelain" />
                        ) : availableStations.length === 0 ? (
                          <p className="text-[11px] text-clay">No free stations for this category right now.</p>
                        ) : (
                          <select
                            value={selectedStationId}
                            onChange={(e) => setSelectedStationId(e.target.value)}
                            className="w-full rounded-md border border-mist px-2 py-1.5 text-xs outline-none focus:border-sage"
                          >
                            <option value="">Choose a station…</option>
                            {availableStations.map((station) => (
                              <option key={station.id} value={station.id}>
                                {station.label}
                              </option>
                            ))}
                          </select>
                        )}
                        <select
                          value={selectedStaffId}
                          onChange={(e) => setSelectedStaffId(e.target.value)}
                          className="mt-2 w-full rounded-md border border-mist px-2 py-1.5 text-xs outline-none focus:border-sage"
                        >
                          <option value="">Choose staff…</option>
                          {staff.map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.fullName}
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
                            disabled={!selectedStationId || !selectedStaffId}
                            className="flex-1 rounded-md bg-sage-deep py-1 text-[11px] font-semibold text-white disabled:opacity-40"
                          >
                            Confirm
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}