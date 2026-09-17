import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabaseClient } from "@/shared/lib/supabaseClient";

interface QueueStatusData {
  id: string;
  customer_name: string;
  status:
    | "waiting"
    | "in_service"
    | "completed"
    | "cancelled"
    | "no_show"
    | "scheduled";
  position: number | null;
  estimated_duration: number;
  scheduled_at: string | null;
  created_at: string;
}

const STATUS_LABELS: Record<QueueStatusData["status"], string> = {
  waiting: "Waiting",
  in_service: "You're being served",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "Marked as no-show",
  scheduled: "Appointment scheduled",
};

// Baseline EWT calculation.
// This can later be replaced with the predictive model.
function estimateWaitMinutes(
  positionAhead: number,
  avgMinutesPerCustomer: number
): number {
  return Math.max(0, positionAhead * avgMinutesPerCustomer);
}

export function QueueStatusPage() {
  const { entryId } = useParams<{ entryId: string }>();

  const [entry, setEntry] = useState<QueueStatusData | null>(null);
  const [peopleAhead, setPeopleAhead] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadStatus() {
    if (!entryId) {
      setErrorMessage("Invalid queue entry.");
      setIsLoading(false);
      return;
    }

    setErrorMessage(null);

    const { data, error } = await supabaseClient
      .from("queue_entries")
      .select(
        "id, customer_name, status, position, estimated_duration, scheduled_at, created_at"
      )
      .eq("id", entryId)
      .maybeSingle();

    if (error) {
      console.error("Queue status error:", error);

      setErrorMessage("Unable to load your queue status.");
      setIsLoading(false);
      return;
    }

    if (!data) {
      setErrorMessage(
        "This queue entry could not be found. It may have expired or been removed."
      );
      setIsLoading(false);
      return;
    }

    const queueEntry = data as QueueStatusData;

    setEntry(queueEntry);

    /*
     * Count waiting customers ahead of this customer.
     *
     * Example:
     *
     * Current customer position = 5
     *
     * Waiting entries:
     * position 1
     * position 2
     * position 3
     * position 4
     *
     * peopleAhead = 4
     */
    if (
      queueEntry.status === "waiting" &&
      queueEntry.position !== null
    ) {
      const { count, error: countError } = await supabaseClient
        .from("queue_entries")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq("status", "waiting")
        .lt("position", queueEntry.position);

      if (countError) {
        console.error("People ahead error:", countError);
        setPeopleAhead(null);
      } else {
        setPeopleAhead(count ?? 0);
      }
    } else {
      setPeopleAhead(null);
    }

    setIsLoading(false);
  }

  useEffect(() => {
    loadStatus();

    /*
     * Realtime subscription.
     *
     * We listen to the entire queue_entries table because
     * another customer's status/position can affect this
     * customer's estimated waiting time.
     */
    const channel = supabaseClient
      .channel(`queue-status-${entryId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "queue_entries",
        },
        () => {
          loadStatus();
        }
      )
      .subscribe((status) => {
        console.log("Queue realtime status:", status);
      });

    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, [entryId]);

  /*
   * Loading state
   */
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-mist p-6">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
          <div className="animate-pulse space-y-4">
            <div className="mx-auto h-4 w-40 rounded bg-gray-200" />
            <div className="mx-auto h-7 w-48 rounded bg-gray-200" />
            <div className="h-48 rounded-xl bg-gray-200" />
          </div>
        </div>
      </div>
    );
  }

  /*
   * Error / missing entry
   */
  if (errorMessage || !entry) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-mist p-6">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-clay/10">
            <span className="text-xl text-clay">!</span>
          </div>

          <h1 className="mt-4 text-lg font-semibold text-ink">
            Queue Status Unavailable
          </h1>

          <p className="mt-2 text-sm text-clay">
            {errorMessage ?? "Something went wrong."}
          </p>

          <Link
            to="/"
            className="mt-6 inline-block rounded-lg bg-sage px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
          >
            Join the Queue
          </Link>
        </div>
      </div>
    );
  }

  /*
   * Baseline EWT.
   *
   * Currently using 30 minutes per customer.
   *
   * IMPORTANT:
   * This is temporary.
   *
   * Later this value should come from:
   *
   * - historical service duration
   * - service type
   * - staff
   * - current queue
   * - service complexity
   * - Moving Average
   * - Linear Regression
   */
  const estimatedWaitMinutes =
    entry.status === "waiting" && peopleAhead !== null
      ? estimateWaitMinutes(peopleAhead, 30)
      : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-mist p-4 sm:p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl sm:p-8">

        {/* Salon */}
        <p className="text-center text-xs font-medium uppercase tracking-wide text-ink/40">
          Lyn & Co Salon and Spa
        </p>

        {/* Customer name */}
        <h1 className="mt-1 text-center font-display text-xl font-semibold text-ink">
          {entry.customer_name}
        </h1>

        {/* Status Card */}
        <div className="mt-6 rounded-xl bg-sage/10 p-5 text-center">

          {/* Status */}
          <p className="text-sm font-medium text-sage-deep">
            {STATUS_LABELS[entry.status]}
          </p>

          {/* WAITING */}
          {entry.status === "waiting" && (
            <>
              <p className="mt-3 text-4xl font-bold text-ink">
                {peopleAhead !== null ? peopleAhead : "—"}
              </p>

              <p className="text-xs text-ink/50">
                {peopleAhead === 0
                  ? "You're next!"
                  : "customers ahead of you"}
              </p>

              {/* EWT */}
              {estimatedWaitMinutes !== null && (
                <div className="mt-4">
                  <p className="text-sm font-medium text-ink/60">
                    Estimated Wait
                  </p>

                  <p className="mt-1 text-2xl font-semibold text-ink">
                    ~{estimatedWaitMinutes} min
                  </p>

                  <p className="mt-2 text-[11px] italic text-ink/40">
                    This is an estimate, not a guarantee.
                  </p>
                </div>
              )}
            </>
          )}

          {/* SCHEDULED */}
          {entry.status === "scheduled" &&
            entry.scheduled_at && (
              <p className="mt-3 text-xs text-ink/50">
                {new Date(entry.scheduled_at).toLocaleString(
                  "en-PH",
                  {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }
                )}
              </p>
            )}

          {/* IN SERVICE */}
          {entry.status === "in_service" && (
            <p className="mt-3 text-xs text-ink/50">
              Please head to the service area.
            </p>
          )}

          {/* COMPLETED */}
          {entry.status === "completed" && (
            <p className="mt-3 text-xs text-ink/50">
              Your service has been completed. Thank you for visiting us!
            </p>
          )}

          {/* CANCELLED */}
          {entry.status === "cancelled" && (
            <p className="mt-3 text-xs text-ink/50">
              This queue entry has been cancelled.
            </p>
          )}

          {/* NO SHOW */}
          {entry.status === "no_show" && (
            <p className="mt-3 text-xs text-ink/50">
              This queue entry was marked as no-show.
            </p>
          )}
        </div>

        {/* Auto-update message */}
        <p className="mt-4 text-center text-[11px] text-ink/35">
          This page updates automatically — no need to refresh.
        </p>

        {/* Back */}
        <div className="mt-5 text-center">
          <Link
            to="/"
            className="text-xs font-medium text-sage-deep hover:underline"
          >
            Join another queue
          </Link>
        </div>
      </div>
    </div>
  );
}