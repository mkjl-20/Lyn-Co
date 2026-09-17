import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/shared/context/AuthContext";
import { supabaseClient } from "@/shared/lib/supabaseClient";

interface AnalyticsSnapshot {
  waiting: number;
  inService: number;
  completedToday: number;
  scheduledToday: number;
  activeStaff: number;
}

export function AdminAnalyticsPage() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<AnalyticsSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadAnalytics() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayIso = todayStart.toISOString();

        const [waitingRes, inServiceRes, completedRes, scheduledRes, staffRes] = await Promise.all([
          supabaseClient.from("queue_entries").select("id", { count: "exact", head: true }).eq("status", "waiting"),
          supabaseClient.from("queue_entries").select("id", { count: "exact", head: true }).eq("status", "in_service"),
          supabaseClient
            .from("queue_entries")
            .select("id", { count: "exact", head: true })
            .eq("status", "completed")
            .gte("completed_at", todayIso),
          supabaseClient
            .from("queue_entries")
            .select("id", { count: "exact", head: true })
            .eq("status", "scheduled")
            .gte("scheduled_at", todayIso),
          supabaseClient
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("account_role", "staff")
            .eq("is_active", true),
        ]);

        if (waitingRes.error) throw waitingRes.error;
        if (inServiceRes.error) throw inServiceRes.error;
        if (completedRes.error) throw completedRes.error;
        if (scheduledRes.error) throw scheduledRes.error;
        if (staffRes.error) throw staffRes.error;

        setStats({
          waiting: waitingRes.count ?? 0,
          inService: inServiceRes.count ?? 0,
          completedToday: completedRes.count ?? 0,
          scheduledToday: scheduledRes.count ?? 0,
          activeStaff: staffRes.count ?? 0,
        });
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to load analytics.");
      } finally {
        setIsLoading(false);
      }
    }

    loadAnalytics();
  }, []);

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
            <h1 className="font-display text-2xl font-semibold text-ink">Analytics</h1>
            <p className="mt-1 text-sm text-ink/50">Operational overview for today</p>
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

      <main className="mx-auto max-w-7xl px-6 py-8">
        {errorMessage && (
          <p role="alert" className="mb-4 text-sm text-clay">
            {errorMessage}
          </p>
        )}

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-white" />
            ))}
          </div>
        ) : stats ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Waiting" value={stats.waiting} hint="Customers in queue" />
            <StatCard label="In service" value={stats.inService} hint="Currently being served" />
            <StatCard label="Completed today" value={stats.completedToday} hint="Finished visits" />
            <StatCard label="Appointments today" value={stats.scheduledToday} hint="Scheduled arrivals" />
            <StatCard label="Active staff" value={stats.activeStaff} hint="Staff on duty" />
          </div>
        ) : null}

        <section className="mt-8 rounded-2xl border border-mist bg-white p-6">
          <h2 className="font-display text-base font-semibold text-ink">Predictive wait times</h2>
          <p className="mt-2 text-sm text-ink/55">
            Advanced EWT models (moving average, linear regression) can be layered on top of queue history
            once enough service-duration data is collected.
          </p>
        </section>
      </main>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-2xl border border-mist bg-white p-6 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-ink/45">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-xs text-ink/40">{hint}</p>
    </div>
  );
}
