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
    <main className="pastel-pink-gradient-page h-full min-h-0 overflow-hidden p-3 text-ink sm:p-4">
      <div className="mx-auto flex h-full min-h-0 max-w-6xl flex-col gap-3">
        <div>
          <div
            className="flex w-full items-stretch gap-1 rounded-2xl border border-neutral-200 bg-white p-1.5 shadow-sm sm:rounded-full"
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
                    ? "bg-neutral-100 text-neutral-900 shadow-sm"
                    : "bg-transparent text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900"
                }`}
              >
                <Icon size={17} aria-hidden="true" />
                <span className="text-center">{label}</span>
              </button>
            ))}
          </div>
        </div>
        <section id={`queue-panel-${activeTab}`} role="tabpanel" aria-labelledby={`queue-tab-${activeTab}`} className="min-h-0 flex-1 overflow-y-auto">
          {activeTab === "live" && <QueueOverview />}
          {activeTab === "stations" && <><StationQueueBoard /><StationManagement /></>}
          {activeTab === "map" && <LiveSalonMap />}
        </section>
      </div>
    </main>
  );
}
