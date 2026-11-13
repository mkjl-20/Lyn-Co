import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ChartNoAxesCombined, ListOrdered, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { fetchAnalyticsForecast, type AnalyticsSnapshot } from "../../analytics/services/forecastService";

export function AdminDashboardPage() {
  const [snapshot, setSnapshot] = useState<AnalyticsSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadDashboard() {
    try {
      const data = await fetchAnalyticsForecast("day", new Date().toISOString().slice(0, 10));
      setSnapshot(data.snapshot);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load dashboard.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void fetchAnalyticsForecast("day", new Date().toISOString().slice(0, 10))
      .then((data) => {
        if (active) setSnapshot(data.snapshot);
      })
      .catch((error: unknown) => {
        if (active) setErrorMessage(error instanceof Error ? error.message : "Unable to load dashboard.");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const stats = [
    { label: "Waiting", value: snapshot?.waiting },
    { label: "In service", value: snapshot?.inService },
    { label: "Completed today", value: snapshot?.completedToday },
    { label: "Active staff", value: snapshot?.activeStaff },
  ] as const;

  return (
    <main className="admin-dashboard-page h-full min-h-0 overflow-hidden text-[var(--dashboard-text)]" aria-busy={isLoading}>
      <div className="mx-auto flex h-full max-w-7xl flex-col justify-center gap-4 p-4 sm:gap-5 sm:p-6 lg:p-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Overview</h1>
            <p className="mt-1 text-sm text-[var(--dashboard-muted)]">Live salon operations at a glance.</p>
          </div>
          <p className="text-xs text-[var(--dashboard-muted)]">
            {new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date())}
          </p>
        </header>

        {errorMessage && (
          <div role="alert" className="admin-dashboard-error flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-700">
            <span>{errorMessage}</span>
            <button type="button" onClick={() => { setErrorMessage(null); setIsLoading(true); void loadDashboard(); }} className="min-h-11 rounded-lg px-3 font-semibold hover:bg-black/5">Retry</button>
          </div>
        )}

        <section className="grid shrink-0 grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="Today's queue summary">
          {stats.map(({ label, value }) => (
            <article key={label} className="admin-dashboard-tile min-h-24 p-3 sm:min-h-32 sm:p-5">
              <p className="text-sm text-[var(--dashboard-muted)]">{label}</p>
              <p className="mt-5 text-4xl font-semibold tracking-tight tabular-nums sm:mt-7 sm:text-5xl" aria-live="polite">
                {isLoading ? <span className="dashboard-skeleton-line h-10 w-16 bg-[var(--dashboard-raised)]" /> : value ?? "—"}
              </p>
              <div className="mt-4 h-px bg-[var(--dashboard-border)]" />
            </article>
          ))}
        </section>

        <nav aria-label="Admin tasks" className="grid shrink-0 auto-rows-fr grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <DashboardLink
            to="/lyn-co/admin/queue"
            title="Queue"
            description="Manage the live service line"
            icon={<ListOrdered size={18} aria-hidden="true" />}
            primaryLabel="Waiting"
            primaryValue={snapshot?.waiting}
            secondaryLabel="In service"
            secondaryValue={snapshot?.inService}
            isLoading={isLoading}
            className="col-span-2"
          />
          <DashboardLink
            to="/lyn-co/admin/staff"
            title="Staff"
            description="View your active team"
            icon={<UsersRound size={18} aria-hidden="true" />}
            primaryLabel="Active staff"
            primaryValue={snapshot?.activeStaff}
            isLoading={isLoading}
          />
          <DashboardLink
            to="/lyn-co/admin/analytics"
            title="Analytics"
            description="Review today’s service activity"
            icon={<ChartNoAxesCombined size={18} aria-hidden="true" />}
            primaryLabel="Completed today"
            primaryValue={snapshot?.completedToday}
            isLoading={isLoading}
          />
        </nav>
      </div>
    </main>
  );
}

function DashboardLink({
  to,
  title,
  description,
  icon,
  primaryLabel,
  primaryValue,
  secondaryLabel,
  secondaryValue,
  isLoading,
  className = "",
}: {
  to: string;
  title: string;
  description: string;
  icon: ReactNode;
  primaryLabel: string;
  primaryValue: number | undefined;
  secondaryLabel?: string;
  secondaryValue?: number;
  isLoading: boolean;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={`admin-dashboard-tile group flex min-h-28 flex-col justify-between p-3 text-[var(--dashboard-text)] transition-colors hover:bg-[var(--dashboard-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-text)] sm:min-h-52 sm:p-5 ${className}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 text-xs text-[var(--dashboard-muted)]">{description}</p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--dashboard-border)] text-[var(--dashboard-text)]">
          {icon}
        </span>
      </div>
      <div className="mt-4 flex items-end justify-between gap-4 sm:mt-8">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--dashboard-muted)]">{primaryLabel}</p>
          <div className="mt-1 flex items-end justify-between gap-4">
            <p className="text-4xl font-semibold tracking-tight tabular-nums" aria-live="polite">
              {isLoading ? <span className="dashboard-skeleton-line mt-2 h-8 w-16 bg-[var(--dashboard-raised)]" /> : primaryValue ?? "—"}
            </p>
            {secondaryLabel && (
              <div className="text-right">
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--dashboard-muted)]">{secondaryLabel}</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums" aria-live="polite">
                  {isLoading ? <span className="dashboard-skeleton-line mt-2 h-6 w-10 bg-[var(--dashboard-raised)]" /> : secondaryValue ?? "—"}
                </p>
              </div>
            )}
          </div>
        </div>
        <ArrowUpRight className="shrink-0 text-[var(--dashboard-muted)] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--dashboard-text)]" size={18} aria-hidden="true" />
      </div>
    </Link>
  );
}
