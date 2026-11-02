import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/shared/lib/apiClient";
import { BackButton } from "@/shared/components/BackButton";
import { DeviceHeartbeatReporter } from "@/features/deviceMonitoring/DeviceHeartbeatReporter";
import { formatTicketNumber } from "@/shared/lib/ticketNumber";
import { subscribeToQueueChanges } from "../services/queueAdminService";

interface NowServingData {
  stationBoard: {
    id: string;
    label: string;
    category: string;
    status: "available" | "waiting" | "called" | "in_service";
    current: StationQueueCustomer | null;
    nextUp: StationQueueCustomer[];
    waitingCount: number;
    estimatedWaitMinutes: number;
  }[];
}

interface StationQueueCustomer {
  id: string;
  ticketNumber: number;
  serviceSeatLabel: string | null;
  serviceName: string;
}

export function AdminTvPage() {
  const [display, setDisplay] = useState<NowServingData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [highlightedStations, setHighlightedStations] = useState<Set<string>>(new Set());
  const previousTickets = useRef(new Map<string, number | null>());
  const soundEnabledRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    let requestInFlight = false;
    const activeTimeouts = new Set<number>();

    function playChime() {
      if (!soundEnabledRef.current) return;
      const AudioContextConstructor = window.AudioContext;
      if (!AudioContextConstructor) return;
      const context = new AudioContextConstructor();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.42);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.45);
      window.setTimeout(() => void context.close(), 600);
    }

    async function refresh() {
      if (requestInFlight) return;
      requestInFlight = true;
      try {
        const data = await apiRequest<NowServingData>("/api/forecast/now-serving?view=customer");
        if (!mounted) return;
        const changes = data.stationBoard.filter((station) => {
          const previousTicket = previousTickets.current.get(station.id);
          const nextTicket = station.current?.ticketNumber ?? null;
          return previousTickets.current.has(station.id) && nextTicket !== null && nextTicket !== previousTicket;
        });
        previousTickets.current = new Map(data.stationBoard.map((station) => [
          station.id,
          station.current?.ticketNumber ?? null,
        ]));
        if (changes.length > 0) {
          const changedIds = changes.map((station) => station.id);
          setHighlightedStations((current) => new Set([...current, ...changedIds]));
          const timeout = window.setTimeout(() => {
            setHighlightedStations((current) => new Set([...current].filter((id) => !changedIds.includes(id))));
            activeTimeouts.delete(timeout);
          }, 8_000);
          activeTimeouts.add(timeout);
          setAlertMessage(changes.map((station) => `${station.label}, ticket ${station.current ? formatTicketNumber(station.current.ticketNumber) : ""}`).join("; "));
          playChime();
        }
        setDisplay(data);
        setErrorMessage(null);
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(error instanceof Error ? error.message : "Unable to load the live queue.");
      } finally {
        requestInFlight = false;
      }
    }

    void refresh();
    const timer = window.setInterval(() => void refresh(), 2_000);
    const unsubscribe = subscribeToQueueChanges(() => void refresh());
    window.addEventListener("online", refresh);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      window.removeEventListener("online", refresh);
      unsubscribe();
      activeTimeouts.forEach(window.clearTimeout);
    };
  }, []);

  function toggleSound() {
    const next = !soundEnabled;
    soundEnabledRef.current = next;
    setSoundEnabled(next);
  }

  return (
    <main className="tv-display pastel-pink-gradient-page min-h-screen p-4 text-ink sm:p-8">
      <DeviceHeartbeatReporter
        kind="tv"
        deviceId="tv-main"
        status={errorMessage ? "needs_attention" : "online"}
      />
      <div className="mx-auto max-w-7xl">
        <header className="flex items-center justify-between border-b border-white/15 pb-5">
          <div className="flex items-center gap-3">
            <BackButton to="/" label="Back to booking" className="text-white/75 hover:text-white focus-visible:outline-sage-light" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sage-light">Lyn &amp; Co</p>
              <h1 className="mt-1 font-display text-2xl sm:text-3xl">Station queues</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={toggleSound} className="min-h-11 rounded-lg border border-white/20 px-3 text-xs font-semibold text-white/80 hover:bg-white/10">
              {soundEnabled ? "Turn sound off" : "Enable alert sound"}
            </button>
            <p className="text-sm text-white/60">Live · instant updates with 2 sec sync</p>
          </div>
        </header>

        {errorMessage && (
          <p role="alert" className="mt-5 rounded-lg bg-clay/20 px-4 py-3 text-sm text-white">
            Live queue unavailable: {errorMessage}
          </p>
        )}
        {alertMessage && <p className="sr-only" aria-live="assertive">Now serving updated: {alertMessage}</p>}

        <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6">
          <h2 className="font-display text-xl">Live by station</h2>
          {!display ? (
            <p className="mt-5 text-sm text-white/55">Loading stations…</p>
          ) : display.stationBoard.length === 0 ? (
            <p className="mt-5 text-sm text-white/55">No active stations.</p>
          ) : (
            <ul className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {display.stationBoard.map((station) => (
                <li key={station.id} className={`rounded-xl border border-white/10 bg-black/10 p-4 sm:p-5 ${highlightedStations.has(station.id) ? "animate-pulse ring-2 ring-gold-light" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{station.label}</p>
                      <p className="text-xs text-white/45">{station.category}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                      station.status === "in_service"
                        ? "bg-sage-deep text-white"
                        : station.status === "waiting" || station.status === "called"
                          ? "bg-gold-light text-ink"
                          : "bg-white/10 text-white/60"
                    }`}>
                      {station.status === "in_service"
                        ? "In service"
                        : station.status === "called"
                          ? "Called"
                          : station.status === "waiting"
                          ? "Waiting"
                          : "Available"}
                    </span>
                  </div>
                    <p className="mt-2 text-xs text-white/55">Estimated wait: ~{station.estimatedWaitMinutes} min</p>
                    <div className="mt-4 rounded-lg bg-white/5 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-sage-light">Currently being served</p>
                      {station.current ? (
                        <>
                          <p className="mt-1 text-lg font-semibold">
                            {formatTicketNumber(station.current.ticketNumber)}
                          </p>
                          <p className="text-xs text-white/55">{station.current.serviceName}</p>
                          {station.current.serviceSeatLabel && (
                            <p className="mt-1 text-xs font-semibold text-white/75">
                              Service seat {station.current.serviceSeatLabel}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="mt-1 text-sm text-white/45">No customer currently being served.</p>
                      )}
                    </div>
                    <div className="mt-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-white/50">Next in line</p>
                        <p className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-sage-light" aria-live="polite">
                          {station.waitingCount} waiting
                        </p>
                      </div>
                      {station.nextUp.length > 0 ? (
                        <ol className="mt-2 space-y-2">
                          {station.nextUp.map((customer, index) => (
                            <li key={customer.id} className="rounded-lg bg-black/10 px-3 py-2.5">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-white/85">
                                    {index === 0 ? "Next" : `${index + 1}.`} {formatTicketNumber(customer.ticketNumber)}
                                  </p>
                                  <p className="truncate text-[10px] text-white/45">{customer.serviceName}</p>
                                </div>
                                {customer.serviceSeatLabel && (
                                  <p className="shrink-0 text-[10px] font-semibold text-sage-light">
                                    Seat {customer.serviceSeatLabel}
                                  </p>
                                )}
                              </div>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="mt-2 text-xs text-white/40">No one waiting for this station.</p>
                      )}
                      {station.waitingCount > station.nextUp.length && (
                        <p className="mt-2 text-right text-[10px] text-white/40">
                          +{station.waitingCount - station.nextUp.length} more in line
                        </p>
                      )}
                    </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
