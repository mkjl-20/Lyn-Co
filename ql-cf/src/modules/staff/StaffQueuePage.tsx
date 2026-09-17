import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/shared/context/AuthContext";
import {
  completeServiceItem,
  type QueueEntryRow,
  type QueueEntryServiceItem,
  fetchActiveQueue,
  subscribeToQueueChanges,
} from "../admin/services/queueAdminService";

export default function StaffQueuePage() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<QueueEntryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadQueue() {
    if (!currentUser) return;

    try {
      const all = await fetchActiveQueue();
      const mine = all.filter(
        (entry: QueueEntryRow) =>
          entry.preferredStaffId === currentUser.id ||
          entry.assignedStaffId === currentUser.id ||
          entry.services.some((s: QueueEntryServiceItem) => s.assignedStaffId === currentUser.id)
      );
      setEntries(mine);
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
  }, [currentUser?.id]);

  async function handleComplete(itemId: string) {
    try {
      await completeServiceItem(itemId);
      loadQueue();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to complete service.");
    }
  }

  return (
    <div className="min-h-screen bg-mist text-ink">
      <header className="sticky top-0 z-40 border-b border-mist bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link to="/staff" className="text-xs font-medium text-sage-deep hover:underline">
              ← Dashboard
            </Link>
            <h1 className="font-display text-base font-semibold">My Queue</h1>
          </div>
          <button
            type="button"
            onClick={() => {
              logout();
              navigate("/login");
            }}
            className="rounded-lg border border-mist px-3 py-2 text-xs font-medium"
          >
            Log out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
        {errorMessage && (
          <p role="alert" className="mb-4 text-sm text-clay">
            {errorMessage}
          </p>
        )}

        {isLoading ? (
          <div className="h-40 animate-pulse rounded-2xl bg-white" />
        ) : entries.length === 0 ? (
          <div className="rounded-2xl border border-mist bg-white p-10 text-center">
            <p className="text-sm font-semibold">No customers assigned to you</p>
            <p className="mt-1 text-xs text-ink/45">Check back when the admin starts a service for you.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {entries.map((entry) => (
              <li key={entry.id} className="rounded-2xl border border-mist bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{entry.customerName}</p>
                    <p className="text-xs text-ink/50">
                      {entry.status === "waiting" ? `Position ${entry.position ?? "—"}` : "In progress"} ·{" "}
                      {entry.contactNumber}
                    </p>
                  </div>
                  <span className="rounded-full bg-sage-light px-2 py-0.5 text-[10px] font-semibold text-sage-deep">
                    {entry.status}
                  </span>
                </div>

                <div className="mt-3 space-y-2 border-t border-mist/50 pt-3">
                  {entry.services
                    .filter(
                      (s: QueueEntryServiceItem) =>
                        s.assignedStaffId === currentUser?.id || s.status !== "pending"
                    )
                    .map((item: QueueEntryServiceItem) => (
                      <div key={item.id} className="flex items-center justify-between rounded-md bg-porcelain/40 px-3 py-2">
                        <div>
                          <p className="text-xs font-medium">{item.name}</p>
                          <p className="text-[11px] text-ink/45">{item.status}</p>
                        </div>
                        {item.status === "in_service" && item.assignedStaffId === currentUser?.id && (
                          <button
                            type="button"
                            onClick={() => handleComplete(item.id)}
                            className="rounded-md bg-sage-deep px-3 py-1 text-[11px] font-semibold text-white"
                          >
                            Done
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
