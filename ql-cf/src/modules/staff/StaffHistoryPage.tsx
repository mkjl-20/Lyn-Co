import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/shared/context/AuthContext";
import { supabaseClient } from "@/shared/lib/supabaseClient";

interface HistoryRow {
  id: string;
  customerName: string;
  serviceName: string;
  completedAt: string;
}

export default function StaffHistoryPage() {
  const { currentUser } = useAuth();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadHistory() {
      if (!currentUser) return;

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data, error } = await supabaseClient
        .from("queue_entry_services")
        .select(
          `
            id,
            completed_at,
            services ( name ),
            queue_entries ( customer_name )
          `
        )
        .eq("assigned_staff_id", currentUser.id)
        .eq("status", "completed")
        .gte("completed_at", todayStart.toISOString())
        .order("completed_at", { ascending: false });

      if (error) {
        console.error("History load error:", error);
        setRows([]);
      } else {
        setRows(
          (data ?? []).map((row: any) => ({
            id: row.id,
            customerName: row.queue_entries?.customer_name ?? "Unknown",
            serviceName: row.services?.name ?? "Service",
            completedAt: row.completed_at,
          }))
        );
      }

      setIsLoading(false);
    }

    loadHistory();
  }, [currentUser?.id]);

  return (
    <div className="min-h-screen bg-mist text-ink">
      <header className="border-b border-mist bg-white">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center px-4 sm:px-6">
          <Link to="/staff" className="text-xs font-medium text-sage-deep hover:underline">
            ← Dashboard
          </Link>
          <h1 className="ml-4 font-display text-base font-semibold">Service History</h1>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
        <p className="mb-4 text-xs text-ink/45">Completed services for today</p>

        {isLoading ? (
          <div className="h-32 animate-pulse rounded-2xl bg-white" />
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-mist bg-white p-8 text-center text-sm text-ink/50">
            No completed services yet today.
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center justify-between rounded-xl border border-mist bg-white px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{row.customerName}</p>
                  <p className="text-xs text-ink/45">{row.serviceName}</p>
                </div>
                <p className="text-xs text-ink/40">
                  {new Date(row.completedAt).toLocaleTimeString("en-PH", { timeStyle: "short" })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
