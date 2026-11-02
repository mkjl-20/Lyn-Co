import { useState } from "react";
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

  return (
    <main className="pastel-pink-gradient-page min-h-screen p-4 text-ink sm:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div>
          <div
            className="flex w-full items-stretch gap-1 rounded-2xl bg-[var(--app-surface-soft)] p-1.5 shadow-sm sm:rounded-full"
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
                className={`dashboard-icon-control flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-2 text-sm font-semibold transition-all sm:rounded-full sm:px-4 ${
                  activeTab === id
                    ? "bg-[var(--app-surface)] text-[var(--color-ink)] shadow-sm ring-1 ring-[var(--app-border)]/70"
                    : "bg-transparent text-[var(--app-ink-muted)] hover:bg-[var(--app-surface)]/70 hover:text-[var(--color-ink)]"
                }`}
              >
                <Icon size={17} aria-hidden="true" />
                <span className="text-center">{label}</span>
              </button>
            ))}
          </div>
        </div>
        <section id={`queue-panel-${activeTab}`} role="tabpanel" aria-labelledby={`queue-tab-${activeTab}`} className="space-y-5">
          {activeTab === "live" && <QueueOverview />}
          {activeTab === "stations" && <><StationQueueBoard /><StationManagement /></>}
          {activeTab === "map" && <LiveSalonMap />}
        </section>
      </div>
    </main>
  );
}
