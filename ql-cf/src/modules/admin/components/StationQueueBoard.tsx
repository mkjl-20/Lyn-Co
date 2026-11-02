import { useCallback, useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { apiRequest } from "@/shared/lib/apiClient";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { formatTicketNumber } from "@/shared/lib/ticketNumber";

interface StationQueueCustomer {
  id: string;
  ticketNumber: number;
  customerName: string;
  serviceSeatLabel: string | null;
  serviceName: string;
  customerTypeTags: string[];
  status: string;
}

interface StationQueue {
  id: string;
  label: string;
  category: string;
  status: "available" | "waiting" | "called" | "in_service";
  current: StationQueueCustomer | null;
  nextUp: StationQueueCustomer[];
  waitingCount: number;
}

interface StationQueueResponse {
  stationBoard: StationQueue[];
}

export function StationQueueBoard() {
  const [stations, setStations] = useState<StationQueue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await apiRequest<StationQueueResponse>("/api/forecast/now-serving");
      setStations(data.stationBoard);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load station queues.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return (
    <section className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-[var(--app-shadow)]" aria-busy={isLoading}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-ink">Queues by station</h2>
        <p className="text-sm text-ink/55">Updates every 10 seconds</p>
      </div>
      {errorMessage ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3" role="alert">
          <p className="text-sm text-clay">{errorMessage}</p>
          <button type="button" onClick={() => void refresh()} className="min-h-11 rounded-md px-3 text-sm font-semibold text-sage-deep">Retry</button>
        </div>
      ) : isLoading ? (
        <p className="mt-4 text-sm text-ink/55" role="status">Loading station queues…</p>
      ) : stations.length === 0 ? (
        <p className="mt-4 text-sm text-ink/55">No active stations.</p>
      ) : (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {stations.map((station) => (
            <li key={station.id} className="group rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4 transition duration-150 hover:-translate-y-0.5 hover:border-[var(--app-accent)]/50 hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold text-ink">{station.label}</h3>
                  <p className="text-sm text-ink/55">{station.category}</p>
                </div>
                <StatusBadge status={station.status} className="shrink-0 px-3 py-1.5 text-sm">
                  {station.status === "in_service" ? "In service" : station.status === "called" ? "Called" : station.status === "waiting" ? "Waiting" : "Available"}
                </StatusBadge>
              </div>

              <div className="mt-4 rounded-lg bg-[var(--app-canvas)] p-3 transition-colors group-hover:bg-[var(--app-surface-soft)]">
                <p className="text-sm font-semibold text-ink/70">Currently serving</p>
                {station.current ? (
                  <div className="mt-2 flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sage-light text-sage-deep">
                      <UserRound size={20} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{formatTicketNumber(station.current.ticketNumber)} · {station.current.customerName}</p>
                      <p className="text-sm text-ink/60">{station.current.serviceName}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {station.current.customerTypeTags.map((tag) => (
                          <span key={tag} className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-ink/65">{tag}</span>
                        ))}
                      </div>
                      <p className="mt-1 text-sm font-semibold text-sage-deep">Seat: {station.current.serviceSeatLabel ?? "Not assigned"}</p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-ink/55">No customer being served.</p>
                )}
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-ink/70">Next in line</p>
                  <span className="text-sm text-ink/55">{station.waitingCount} waiting</span>
                </div>
                {station.nextUp.length > 0 ? (
                  <ol className="mt-2 space-y-2 border-l-2 border-mist pl-3">
                    {station.nextUp.map((customer, index) => (
                      <li key={customer.id} className="flex items-start gap-3 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2.5 transition-colors hover:border-[var(--app-accent)]/40 hover:bg-[var(--app-surface-soft)]">
                        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sage-light text-sage-deep">
                          <UserRound size={18} aria-hidden="true" />
                          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-sage-deep text-[9px] font-bold text-white">{index + 1}</span>
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-ink">{index === 0 ? "Next · " : ""}{formatTicketNumber(customer.ticketNumber)} · {customer.customerName}</p>
                          <p className="text-sm text-ink/60">{customer.serviceName}</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {customer.customerTypeTags.map((tag) => (
                              <span key={tag} className="rounded-full bg-sage-light px-2 py-0.5 text-[10px] font-semibold text-sage-deep">{tag}</span>
                            ))}
                            {customer.status === "called" && (
                              <span className="rounded-full bg-gold-light px-2 py-0.5 text-[10px] font-semibold text-ink">Called</span>
                            )}
                          </div>
                          <p className="text-sm font-semibold text-sage-deep">Seat: {customer.serviceSeatLabel ?? "Not assigned"}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-2 text-sm text-ink/55">No customers waiting for this station.</p>
                )}
                {station.waitingCount > station.nextUp.length && (
                  <p className="mt-2 text-right text-sm text-ink/55">+{station.waitingCount - station.nextUp.length} more in line</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}