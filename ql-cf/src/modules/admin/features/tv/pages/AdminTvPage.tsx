import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/shared/lib/apiClient";
import { DeviceHeartbeatReporter } from "@/shared/features/deviceMonitoring/DeviceHeartbeatReporter";
import { formatTicketNumber } from "@/shared/lib/ticketNumber";
import { subscribeToQueueChanges } from "../../queue/services/queueAdminService";

interface NowServingData {
  stationBoard: {
    id: string;
    label: string;
    category: string;
    staffName: string | null;
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
  customerName: string;
  assignedStaffName: string | null;
  serviceSeatLabel: string | null;
  serviceName: string;
  remainingMinutes?: number;
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
    <main className="tv-display tv-station-board tv-board h-full min-h-0 overflow-hidden p-4 text-ink sm:p-7">
      <DeviceHeartbeatReporter
        kind="tv"
        deviceId="tv-main"
        status={errorMessage ? "needs_attention" : "online"}
      />
      <div className="mx-auto flex h-full min-h-0 max-w-[1600px] flex-col">
        <header className="tv-board-controls flex shrink-0 justify-end">
          <button
            type="button"
            onClick={toggleSound}
            className="tv-board-sound min-h-10 rounded-lg px-3 text-xs font-semibold sm:px-4 sm:text-sm"
          >
            <span className={`tv-board-sound-indicator ${soundEnabled ? "is-on" : ""}`} aria-hidden="true" />
            {soundEnabled ? "Sound on" : "Enable sound"}
          </button>
        </header>

        {errorMessage && (
          <p role="alert" className="tv-board-error mt-4 rounded-lg px-4 py-3 text-sm">
            Queue temporarily unavailable. {errorMessage}
          </p>
        )}
        {alertMessage && <p className="sr-only" aria-live="assertive">Now serving updated: {alertMessage}</p>}

        <section className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden">
          {!display ? (
            <p className="tv-board-empty mt-5 text-lg">Loading live queue…</p>
          ) : display.stationBoard.every((station) => !station.current && station.nextUp.length === 0) ? (
            <p className="tv-board-empty mt-5 text-lg">No customers are currently being served or waiting.</p>
          ) : (
            <div className="tv-queue-groups">
              {display.stationBoard
                .filter((station) => station.current || station.nextUp.length > 0)
                .map((station) => (
                  <section key={station.id} className={`tv-queue-group ${highlightedStations.has(station.id) ? "is-highlighted" : ""}`}>
                    <h2 className="tv-queue-group-title">
                      {station.label}
                      <span>{station.category}</span>
                    </h2>
                    {station.current && (
                      <div className="tv-queue-serving">
                        <p className="tv-queue-label">IN SERVICE</p>
                        <strong className="tv-queue-ticket">{formatTicketNumber(station.current.ticketNumber)}</strong>
                        <span className="tv-queue-customer">{station.current.customerName.split(/\s+/)[0]}</span>
                        {station.current.assignedStaffName && <span className="tv-queue-detail">With {station.current.assignedStaffName}</span>}
                      </div>
                    )}
                    {station.nextUp.length > 0 && (
                      <div className="tv-queue-waiting">
                        <h3>WAITING</h3>
                        <ol>
                          {station.nextUp.map((customer, index) => (
                            <li key={customer.id}>
                              <span className="tv-queue-position">{index + 1}</span>
                              <strong>{formatTicketNumber(customer.ticketNumber)}</strong>
                              <span>{customer.customerName.split(/\s+/)[0]}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </section>
                ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
