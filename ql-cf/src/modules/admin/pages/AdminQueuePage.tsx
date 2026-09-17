import { QueueOverview } from "../components/Queueoverview";
import { StationManagement } from "../components/Stationmanagement";

export function AdminQueuePage() {
  return (
    <main className="min-h-screen bg-[#eef1ed] p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="border-b border-[#cfd7d0] pb-4">
          <h1 className="mt-1 font-display text-2xl text-ink">Queue &amp; Stations</h1>
        </div>
        <QueueOverview />
        <StationManagement />
      </div>
    </main>
  );
}
