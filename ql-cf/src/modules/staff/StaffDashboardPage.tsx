import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../shared/context/AuthContext";

export default function StaffDashboardPage() {
  const navigate = useNavigate();

  const { currentUser, logout } = useAuth();

  const today = useMemo(() => {
    return new Intl.DateTimeFormat("en-PH", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(new Date());
  }, []);

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  if (!currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-mist">
        <p className="text-sm text-ink/60">
          Loading staff account...
        </p>
      </div>
    );
  }

  const staffRoleLabel = currentUser.staffRole
    ? currentUser.staffRole.charAt(0).toUpperCase() +
      currentUser.staffRole.slice(1)
    : "Staff";

  return (
    <div className="min-h-screen bg-mist text-ink">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-mist bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-8">

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sage-deep text-sm font-bold text-white">
              LQ
            </div>

            <div>
              <p className="font-display text-base font-semibold text-ink">
                LynQ
              </p>

              <p className="text-[10px] uppercase tracking-[0.16em] text-ink/40">
                Staff Portal
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-ink">
                {currentUser.fullName}
              </p>

              <p className="text-xs text-ink/45">
                {staffRoleLabel}
              </p>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-mist bg-white px-3 py-2 text-xs font-medium text-ink transition hover:bg-porcelain"
            >
              Log out
            </button>
          </div>

        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">

        {/* Greeting */}
        <section className="mb-6">
          <p className="mb-1 text-xs font-medium uppercase tracking-[0.16em] text-sage-deep">
            {today}
          </p>

          <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
            Good day, {currentUser.fullName}.
          </h1>

          <p className="mt-1 text-sm text-ink/50">
            Manage your assigned services and queue.
          </p>
        </section>

        {/* Statistics */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">

          <StatCard
            label="Current Queue"
            value="—"
            description="Waiting customers"
          />

          <StatCard
            label="Now Serving"
            value="—"
            description="Current customer"
          />

          <StatCard
            label="Completed"
            value="—"
            description="Today's services"
          />

          <StatCard
            label="Avg. Service"
            value="—"
            description="Today's average"
          />

        </section>

        {/* Main Content */}
        <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">

          {/* Queue */}
          <div className="rounded-2xl border border-mist bg-white shadow-sm">

            <div className="flex items-center justify-between border-b border-mist px-5 py-4">
              <div>
                <h2 className="font-display text-base font-semibold">
                  Current Queue
                </h2>

                <p className="mt-0.5 text-xs text-ink/45">
                  Customers assigned to you
                </p>
              </div>

              <span className="rounded-full bg-porcelain px-3 py-1 text-xs font-semibold text-ink/50">
                No data
              </span>
            </div>

            {/* Empty state */}
            <div className="flex min-h-[280px] items-center justify-center px-5">
              <div className="text-center">

                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-porcelain text-ink/30">
                  <svg
                    viewBox="0 0 24 24"
                    width="22"
                    height="22"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                  >
                    <path d="M8 6h13" />
                    <path d="M8 12h13" />
                    <path d="M8 18h13" />
                    <path d="M3 6h.01" />
                    <path d="M3 12h.01" />
                    <path d="M3 18h.01" />
                  </svg>
                </div>

                <p className="mt-4 text-sm font-semibold text-ink">
                  No customers in your queue
                </p>

                <p className="mx-auto mt-1 max-w-xs text-xs text-ink/45">
                  Customers assigned to your service will appear here.
                </p>

              </div>
            </div>

            <div className="border-t border-mist p-4">
              <button
                type="button"
                onClick={() => navigate("/staff/queue")}
                className="w-full rounded-lg border border-mist bg-white py-2.5 text-xs font-semibold text-ink transition hover:bg-porcelain"
              >
                View Full Queue
              </button>
            </div>

          </div>

          {/* Right Panel */}
          <div className="space-y-6">

            {/* Current Service */}
            <div className="rounded-2xl border border-mist bg-white p-5 shadow-sm">

              <div className="mb-4">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-sage-deep">
                  Current Service
                </p>

                <h2 className="mt-1 font-display text-xl font-semibold">
                  No active service
                </h2>
              </div>

              <div className="rounded-xl bg-porcelain p-4">

                <p className="text-sm font-semibold text-ink/50">
                  No customer currently being served
                </p>

                <p className="mt-1 text-xs text-ink/40">
                  Your active customer will appear here.
                </p>

              </div>

              <button
                type="button"
                onClick={() => navigate("/staff/queue")}
                className="mt-4 w-full rounded-lg bg-sage-deep py-2.5 text-xs font-semibold text-white transition hover:opacity-90"
              >
                Open Queue
              </button>

            </div>

            {/* Quick Actions */}
            <div className="rounded-2xl border border-mist bg-white p-5 shadow-sm">

              <h2 className="font-display text-base font-semibold">
                Quick Actions
              </h2>

              <div className="mt-4 grid gap-2">

                <QuickAction
                  title="View Queue"
                  description="See your assigned customers"
                  onClick={() => navigate("/staff/queue")}
                />

                <QuickAction
                  title="Service History"
                  description="View your completed services"
                  onClick={() => navigate("/staff/history")}
                />

                <QuickAction
                  title="My Profile"
                  description="View your staff account"
                  onClick={() => navigate("/staff/profile")}
                />

              </div>

            </div>

          </div>

        </section>

        {/* Today's Summary */}
        <section className="mt-6 rounded-2xl border border-mist bg-white p-5 shadow-sm">

          <div className="mb-5">
            <h2 className="font-display text-base font-semibold">
              Today's Summary
            </h2>

            <p className="mt-0.5 text-xs text-ink/45">
              Your service performance for today
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">

            <SummaryItem
              label="Customers Served"
              value="—"
            />

            <SummaryItem
              label="Average Service Time"
              value="—"
            />

            <SummaryItem
              label="Estimated Remaining"
              value="—"
            />

          </div>

        </section>

      </main>
    </div>
  );
}

/* =========================================================
   STAT CARD
========================================================= */

interface StatCardProps {
  label: string;
  value: string;
  description: string;
}

function StatCard({
  label,
  value,
  description,
}: StatCardProps) {
  return (
    <div className="rounded-2xl border border-mist bg-white p-4 shadow-sm">

      <p className="text-xs text-ink/45">
        {label}
      </p>

      <p className="mt-2 font-display text-xl font-semibold text-ink sm:text-2xl">
        {value}
      </p>

      <p className="mt-1 text-[11px] text-ink/40">
        {description}
      </p>

    </div>
  );
}

/* =========================================================
   QUICK ACTION
========================================================= */

interface QuickActionProps {
  title: string;
  description: string;
  onClick: () => void;
}

function QuickAction({
  title,
  description,
  onClick,
}: QuickActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-between rounded-xl border border-mist p-3 text-left transition hover:bg-porcelain"
    >
      <div>

        <p className="text-xs font-semibold text-ink">
          {title}
        </p>

        <p className="mt-0.5 text-[11px] text-ink/40">
          {description}
        </p>

      </div>

      <span className="text-ink/30">
        →
      </span>
    </button>
  );
}

/* =========================================================
   SUMMARY
========================================================= */

interface SummaryItemProps {
  label: string;
  value: string;
}

function SummaryItem({
  label,
  value,
}: SummaryItemProps) {
  return (
    <div className="rounded-xl bg-porcelain p-4">

      <p className="text-xs text-ink/45">
        {label}
      </p>

      <p className="mt-2 font-display text-xl font-semibold text-ink">
        {value}
      </p>

    </div>
  );
}