import { useEffect, useState } from "react";
import { useAuth } from "@/shared/context/useAuth";
import { supabaseClient } from "@/shared/lib/supabaseClient";
import { apiRequest } from "@/shared/lib/apiClient";
import { formatTicketNumber } from "@/shared/lib/ticketNumber";
import { PaginationControls } from "@/shared/components/PaginationControls";
import { paginateItems } from "@/shared/lib/pagination";

interface HistoryRow {
  id: string;
  customerName: string;
  serviceName: string;
  completedAt: string;
}

interface TransactionHistoryRow {
  id: string;
  ticket_number: number;
  customer_name: string;
  total_amount: number;
  payment_method: string;
  status: string;
  created_at: string;
}

export function StaffServiceHistory() {
  const { currentUser } = useAuth();
  const staffId = currentUser?.id;
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [transactions, setTransactions] = useState<TransactionHistoryRow[]>([]);
  const [transactionError, setTransactionError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [servicePage, setServicePage] = useState(1);
  const [transactionPage, setTransactionPage] = useState(1);
  const paginatedServices = paginateItems(rows, servicePage);
  const paginatedTransactions = paginateItems(transactions, transactionPage);

  useEffect(() => {
    let active = true;
    async function loadHistory() {
      if (!staffId) return;

      const { data, error } = await supabaseClient
        .from("queue_entry_services")
        .select(`
          id,
          completed_at,
          services ( name ),
          queue_entries ( customer_name )
        `)
        .eq("assigned_staff_id", staffId)
        .eq("status", "completed")
        .order("completed_at", { ascending: false });

      if (!active) return;
      if (error) {
        console.error("History load error:", error);
        setErrorMessage(error.message);
      } else {
        setErrorMessage(null);
        setRows(
          (data ?? []).map((row) => {
            const relatedService = row.services as { name?: string } | null;
            const queueEntry = row.queue_entries as { customer_name?: string } | null;
            return {
              id: row.id,
              customerName: queueEntry?.customer_name ?? "Unknown",
              serviceName: relatedService?.name ?? "Service",
              completedAt: row.completed_at ?? "",
            };
          }),
        );
      }

      try {
        const result = await apiRequest<{ transactions: TransactionHistoryRow[] }>("/api/queue/history/transactions");
        if (active) {
          setTransactions(result.transactions);
          setTransactionError(null);
        }
      } catch (historyError) {
        if (active) {
          setTransactionError(historyError instanceof Error ? historyError.message : "Unable to load transaction history.");
        }
      }

      if (active) setIsLoading(false);
    }

    void loadHistory();
    return () => {
      active = false;
    };
  }, [staffId]);

  if (errorMessage) {
    return (
      <p role="alert" className="rounded-2xl border border-clay/20 bg-white p-5 text-sm text-clay">
        Unable to load service history: {errorMessage}
      </p>
    );
  }

  if (isLoading) {
    return <div className="h-32 animate-pulse rounded-2xl bg-white" role="status">Loading service history…</div>;
  }

  return (
    <div className="space-y-4">
      <section className="dashboard-surface p-5">
        <h2 className="font-display text-lg font-semibold">Completed services</h2>
        {rows.length === 0 ? <p className="py-6 text-center text-sm text-ink/50">No completed services yet.</p> : (
          <ul className="mt-3 divide-y divide-mist">
            {paginatedServices.items.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="text-sm font-medium">{row.customerName}</p>
                  <p className="text-xs text-ink/55">{row.serviceName}</p>
                </div>
                <p className="shrink-0 text-xs text-ink/50">{row.completedAt ? new Date(row.completedAt).toLocaleString("en-PH") : "Date unavailable"}</p>
              </li>
            ))}
          </ul>
        )}
        {rows.length > 0 && (
          <PaginationControls
            page={paginatedServices.page}
            totalPages={paginatedServices.totalPages}
            firstItem={paginatedServices.firstItem}
            lastItem={paginatedServices.lastItem}
            totalItems={rows.length}
            onPageChange={setServicePage}
            label="Completed services"
          />
        )}
      </section>

      <section className="dashboard-surface p-5">
        <h2 className="font-display text-lg font-semibold">Transaction history</h2>
        {transactionError ? <p role="alert" className="py-5 text-sm text-clay">Unable to load transaction history: {transactionError}</p> : transactions.length === 0 ? <p className="py-6 text-center text-sm text-ink/50">No transactions for your completed services yet.</p> : (
          <ul className="mt-3 divide-y divide-mist">
            {paginatedTransactions.items.map((transaction) => (
              <li key={transaction.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium">Ticket {formatTicketNumber(transaction.ticket_number)} · {transaction.customer_name}</p>
                  <p className="text-xs capitalize text-ink/55">{transaction.payment_method} · {transaction.status}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">₱{Number(transaction.total_amount).toFixed(2)}</p>
                  <p className="text-xs text-ink/50">{new Date(transaction.created_at).toLocaleString("en-PH")}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {!transactionError && transactions.length > 0 && (
          <PaginationControls
            page={paginatedTransactions.page}
            totalPages={paginatedTransactions.totalPages}
            firstItem={paginatedTransactions.firstItem}
            lastItem={paginatedTransactions.lastItem}
            totalItems={transactions.length}
            onPageChange={setTransactionPage}
            label="Transaction history"
          />
        )}
      </section>
    </div>
  );
}
