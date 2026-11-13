import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../../shared/context/useAuth";
import { StationQueueCounter } from "../../../../../shared/components/StationQueueCounter";
import { PortalAccountMenu } from "../../../../../shared/components/PortalAccountMenu";
import { DashboardMetricCard } from "../../../../../shared/components/DashboardMetricCard";
import { DashboardSkeletonGrid } from "../../../../../shared/components/DashboardSkeletonGrid";
import { StatusBadge } from "../../../../../shared/components/StatusBadge";
import { fetchStaffQueue, subscribeToQueueChanges, type QueueEntryRow } from "../../../../admin/features/queue/services/queueAdminService";

export default function StaffDashboardPage() {
  const navigate = useNavigate();

  const { currentUser, logout } = useAuth();
  const [entries, setEntries] = useState<QueueEntryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const currentUserId = currentUser?.id;
  const isReceptionist = currentUser?.staffRole === "receptionist";

  const loadQueue = useCallback(async () => {
    if (!currentUserId) return;
    try {
      setEntries(await fetchStaffQueue(currentUserId, isReceptionist));
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load your queue.");
    } finally {
      setIsLoading(false);
    }
  }, [currentUserId, isReceptionist]);

  useEffect(() => {
    // Load initial queue data and subscribe to external realtime updates.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadQueue();
    return subscribeToQueueChanges(() => void loadQueue());
  }, [loadQueue]);

  async function handleLogout() {
    await logout();
    navigate("/lyn-co/login");
  }

  if (!currentUser) {
    return (
      <div className="pastel-pink-gradient-page flex min-h-screen items-center justify-center p-4">
        <DashboardSkeletonGrid count={1} variant="panel" label="Loading staff account" className="w-full max-w-sm" />
      </div>
    );
  }

  const waitingCount = entries.filter((entry) => entry.status === "waiting").length;
  const servingCount = entries.filter((entry) => entry.status === "in_service").length;

  return (
    <div className="pastel-pink-gradient-page min-h-screen text-ink">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-[var(--app-border)] bg-white/70 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-8">

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sage-deep text-sm font-bold text-white">
              LQ
            </div>

            <div>
              <p className="font-display text-base font-semibold text-ink">
                LynQ
              </p>
            </div>
          </div>

          <PortalAccountMenu
            fullName={currentUser.fullName}
            identifier={`@${currentUser.username}`}
            roleLabel={currentUser.staffRole?.replace(/_/g, " ") ?? "Staff"}
            isActive={currentUser.isActive}
            accountHref="/lyn-co/staff/profile"
            secondaryHref="/lyn-co/staff/history"
            secondaryLabel="Service history"
            onSignOut={handleLogout}
          />

        </div>
      </header>

      {/* Main */}
      <main className="mx-auto min-h-[calc(100dvh-4rem)] max-w-[1440px] bg-[var(--app-canvas)] px-4 pb-10 pt-3 sm:px-6 lg:px-8 lg:pt-4">

        {/* Greeting */}
        <h1 className="ui-page-title mb-1">{currentUser.fullName}</h1>

        {/* Statistics */}
        {isLoading ? (
          <DashboardSkeletonGrid count={2} label="Loading staff queue counts" className="mb-1 grid-cols-2 gap-1" />
        ) : (
          <section className="mb-1 grid grid-cols-2 gap-1" aria-label="Queue counts">
            <DashboardMetricCard label="Waiting" value={waitingCount} />
            <DashboardMetricCard label="In service" value={servingCount} />
          </section>
        )}
        <div className="mb-1">
          <StationQueueCounter />
        </div>

        {/* Main Content */}
        <section className="mt-1 w-full">

          {/* Queue */}
          <div className="rounded-2xl border border-mist bg-white shadow-sm">

            <div className="flex items-center justify-between border-b border-mist px-4 py-2">
              <div>
                <h2 className="ui-section-title">
                  {isReceptionist ? "Live Queue" : "Current Queue"}
                </h2>

              </div>

              <span className="rounded-full bg-porcelain px-3 py-1 text-xs font-semibold text-ink/70" aria-live="polite">
                {isLoading ? "Loading" : entries.length}
              </span>
            </div>

            {/* Empty state */}
            {errorMessage ? (
              <div className="dashboard-error-message flex min-h-40 flex-wrap items-center justify-center gap-1 p-4 text-center" role="alert">
                <p className="text-sm">{errorMessage}</p>
                <button type="button" onClick={() => void loadQueue()} className="min-h-11 rounded-md border border-red-300 px-4 text-sm font-semibold text-red-700 hover:bg-red-100">Retry</button>
              </div>
            ) : isLoading ? (
              <DashboardSkeletonGrid count={3} variant="queue" label="Loading staff queue" className="gap-0 p-4" />
            ) : entries.length === 0 ? (
              <div className="flex min-h-40 items-center justify-center px-5 text-center">
                <p className="text-sm font-semibold text-ink/60">{isReceptionist ? "No customers in the live queue" : "No customers in your queue"}</p>
              </div>
            ) : (
              <ul className="divide-y divide-mist">
                {entries.slice(0, 5).map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-center justify-between gap-1 px-4 py-2 sm:px-5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{entry.customerName}</p>
                      <p className="text-xs text-ink/60">{entry.status === "waiting" ? `Position ${entry.position ?? "—"}` : "In service"}</p>
                    </div>
                    <StatusBadge status={entry.status}>{entry.status === "waiting" ? "Waiting" : "In service"}</StatusBadge>
                  </li>
                ))}
              </ul>
            )}

            <div className={`grid gap-1 border-t border-mist p-2 ${isReceptionist ? "sm:grid-cols-2" : ""}`}>
              <button
                type="button"
                onClick={() => navigate("/lyn-co/staff/queue")}
                className="min-h-11 w-full rounded-lg border border-mist bg-white py-2.5 text-sm font-semibold text-ink transition hover:bg-porcelain"
              >
                {isReceptionist ? "Manage Live Queue" : "View Full Queue"}
              </button>
              {isReceptionist && (
                <button
                  type="button"
                  onClick={() => navigate("/lyn-co/staff/pos")}
                  className="dashboard-primary-action min-h-11 w-full rounded-lg py-2.5 text-sm font-semibold"
                >
                  POS &amp; Transactions
                </button>
              )}
            </div>

          </div>

        </section>

      </main>
    </div>
  );
}
