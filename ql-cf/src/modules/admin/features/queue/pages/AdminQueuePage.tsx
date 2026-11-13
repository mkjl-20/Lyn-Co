import { useEffect, useRef, useState } from "react";
import { ListOrdered, MapPinned, PanelsTopLeft } from "lucide-react";
import { QueueOverview } from "../components/Queueoverview";
import { LiveSalonMap } from "../components/LiveSalonMap";
import { StationQueueBoard } from "../components/StationQueueBoard";
import { StationManagement } from "../components/Stationmanagement";

type QueueControlTab = "live" | "stations" | "map";

const queueControlTabs: { id: QueueControlTab; label: string; Icon: typeof ListOrdered }[] = [
  { id: "live", label: "Live Queue", Icon: ListOrdered },
  { id: "stations", label: "Stations", Icon: PanelsTopLeft },
  { id: "map", label: "Salon Map", Icon: MapPinned },
];

export function AdminQueuePage() {
  const [activeTab, setActiveTab] = useState<QueueControlTab>("live");
  const queuePanelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (queuePanelRef.current) queuePanelRef.current.scrollTop = 0;
  }, [activeTab]);

  return (
    <main className="pastel-pink-gradient-page h-full min-h-0 overflow-hidden p-3 text-ink sm:p-4">
      <div className="mx-auto flex h-full min-h-0 w-full flex-col gap-3">
        <div>
          <div
            className="-mx-3 flex w-auto items-stretch border-y border-neutral-200 bg-white sm:-mx-4"
            role="tablist"
            aria-label="Queue control sections"
          >
            {queueControlTabs.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`queue-tab-${id}`}
                aria-selected={activeTab === id}
                aria-controls={`queue-panel-${id}`}
                onClick={() => setActiveTab(id)}
                className={`flex min-h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-none border-b-2 px-2 text-sm font-semibold transition-colors duration-200 sm:px-4 ${
                  activeTab === id
                    ? "border-neutral-900 bg-white text-neutral-900"
                    : "border-transparent bg-white text-neutral-500 hover:bg-[var(--app-accent-soft)] hover:text-neutral-900"
                }`}
              >
                <Icon size={17} aria-hidden="true" />
                <span className="text-center">{label}</span>
              </button>
            ))}
          </div>
        </div>
        <section ref={queuePanelRef} id={`queue-panel-${activeTab}`} role="tabpanel" aria-labelledby={`queue-tab-${activeTab}`} className="min-h-0 flex-1 overflow-y-auto pb-10">
          {activeTab === "live" && <QueueOverview />}
          {activeTab === "stations" && <><StationQueueBoard /><StationManagement /></>}
          {activeTab === "map" && (
            <section className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-3 shadow-[var(--app-shadow)] sm:p-4">
              <h2 className="mb-3 text-base font-semibold text-[var(--color-ink)]">Customer service seats</h2>
              <LiveSalonMap />
            </section>
          )}
        </section>
      </div>
    </main>
  );
}
