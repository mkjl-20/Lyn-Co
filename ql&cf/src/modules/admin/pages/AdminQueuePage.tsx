import { useNavigate } from "react-router-dom";
import { useAuth } from "@/shared/context/AuthContext";
import { QueueOverview } from "../components/Queueoverview";
import { StationManagement } from "../components/Stationmanagement";

export function AdminQueuePage() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-porcelain">
      <header className="border-b border-mist bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <button
              type="button"
              onClick={() => navigate("/admin")}
              className="mb-1 text-xs font-medium text-sage-deep hover:underline"
            >
              ← Back to dashboard
            </button>
            <h1 className="font-display text-2xl font-semibold text-ink">Queue Management</h1>
            <p className="mt-1 text-sm text-ink/50">Monitor the live queue and manage stations</p>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-ink">{currentUser?.fullName ?? "Administrator"}</p>
              <p className="text-xs text-ink/50">Administrator</p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg border border-clay/20 px-4 py-2 text-sm font-medium text-clay transition hover:bg-clay-light"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <QueueOverview />
        <StationManagement />
      </main>
    </div>
  );
}
