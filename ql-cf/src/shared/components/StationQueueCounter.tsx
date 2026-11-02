import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../lib/apiClient";
import { StatusBadge } from "./StatusBadge";
import { formatTicketNumber } from "../lib/ticketNumber";

interface StationQueueItem {
  ticketNumber: number;
  serviceName: string;
}

interface StationQueueCounterRow {
  id: string;
  label: string;
  category: string;
  status: "available" | "waiting" | "called" | "in_service";
  current: StationQueueItem | null;
  nextUp: StationQueueItem[];
  waitingCount: number;
}

interface StationQueueCounterResponse {
  stationBoard: StationQueueCounterRow[];
}

export function StationQueueCounter() {
  const [stations, setStations] = useState<StationQueueCounterRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadStations = useCallback(async () => {
    try {
      const data = await apiRequest<StationQueueCounterResponse>("/api/forecast/now-serving?view=customer");
      setStations(data.stationBoard);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load station counts.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStations();
    const timer = window.setInterval(() => void loadStations(), 10_000);
    return () => window.clearInterval(timer);
  }, [loadStations]);

  return (
    <section className="rounded-xl border border-mist bg-white p-4 sm:p-5" aria-label="Queues by station" aria-busy={isLoading}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-base font-semibold text-ink">Queues by station</h2>
        <p className="text-[10px] text-ink/45">Updates every 10 seconds</p>
      </div>
      {errorMessage ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2" role="alert">
          <p className="text-xs text-clay">{errorMessage}</p>
          <button type="button" onClick={() => void loadStations()} className="min-h-11 rounded-md px-3 text-xs font-semibold text-sage-deep">
            Retry
          </button>
        </div>
      ) : isLoading ? (
        <p className="mt-3 text-sm text-ink/50" role="status">Loading station counts…</p>
      ) : (
        <>
          {stations.length === 0 ? (
            <p className="mt-3 text-sm text-ink/50">No active stations.</p>
          ) : (
            <ul className="mt-2 divide-y divide-mist">
              {stations.map((station) => (
                <li key={station.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{station.label}</p>
                      <p className="truncate text-xs text-ink/50">{station.category}</p>
                    </div>
                    <StatusBadge status={station.status} className="shrink-0 px-2 py-1 text-[10px]">
                      {station.status === "in_service" ? "In service" : station.status === "called" ? "Called" : station.status === "waiting" ? "Waiting" : "Available"}
                    </StatusBadge>
                  </div>
                  {station.current && (
                    <p className="mt-2 text-xs text-ink/65">Serving {formatTicketNumber(station.current.ticketNumber)} · {station.current.serviceName}</p>
                  )}
                  {station.nextUp.length > 0 ? (
                    <ol className="mt-2 flex flex-wrap gap-2" aria-label={`Queue for ${station.label}`}>
                      {station.nextUp.slice(0, 3).map((customer, index) => (
                        <li key={`${station.id}-${customer.ticketNumber}`} className="rounded-md bg-porcelain px-2.5 py-1.5 text-xs text-ink/75">
                          {index === 0 ? "Next " : ""}{formatTicketNumber(customer.ticketNumber)} · {customer.serviceName}
                        </li>
                      ))}
                      {station.waitingCount > 3 && (
                        <li className="px-2 py-1.5 text-xs text-ink/50">+{station.waitingCount - 3} more</li>
                      )}
                    </ol>
                  ) : (
                    <p className="mt-2 text-xs text-ink/50">No one waiting for this station.</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
