import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabaseClient } from "@/shared/lib/supabaseClient";
import { cancelQueueEntry, fetchQueueStatus } from "../services/joinQueueService";

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
  additional_notes: string | null;
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

export function QueueStatusPage() {
  const { entryId } = useParams<{ entryId: string }>();

  const [entry, setEntry] = useState<QueueStatusData | null>(null);
  const [peopleAhead, setPeopleAhead] = useState<number | null>(null);
  const [ewtMinutes, setEwtMinutes] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCancelling, setIsCancelling] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadStatus() {
    if (!entryId) {
      setErrorMessage("Invalid queue entry.");
      setIsLoading(false);
      return;
    }

    setErrorMessage(null);

    try {
      const data = await fetchQueueStatus(entryId);
      setEntry(data.entry as QueueStatusData);
      setPeopleAhead(data.peopleAhead);
      setEwtMinutes(data.wait?.ewtMinutes ?? null);
    } catch (error) {
      console.error("Queue status error:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load your queue status."
      );
    }

    setIsLoading(false);
  }

  useEffect(() => {
    loadStatus();

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
      .subscribe();

    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, [entryId]);

  async function handleCancel() {
    if (!entryId) return;
    setIsCancelling(true);
    try {
      await cancelQueueEntry(entryId);
      await loadStatus();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to cancel.");
    } finally {
      setIsCancelling(false);
    }
  }

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

  const canCancel = entry.status === "waiting" || entry.status === "scheduled";

  return (
    <div className="flex min-h-screen items-center justify-center bg-mist p-4 sm:p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl sm:p-8">
        <p className="text-center text-xs font-medium uppercase tracking-wide text-ink/40">
          Lyn & Co Salon and Spa
        </p>

        <h1 className="mt-1 text-center font-display text-xl font-semibold text-ink">
          {entry.customer_name}
        </h1>

        <div className="mt-6 rounded-xl bg-sage/10 p-5 text-center">
          <p className="text-sm font-medium text-sage-deep">
            {STATUS_LABELS[entry.status]}
          </p>

          {entry.status === "waiting" && (
            <>
              <p className="mt-3 text-4xl font-bold text-ink">
                {peopleAhead !== null ? peopleAhead : "—"}
              </p>

              <p className="text-xs text-ink/50">
                {peopleAhead === 0 ? "You're next!" : "customers ahead of you"}
              </p>

              {ewtMinutes !== null && (
                <div className="mt-4">
                  <p className="text-sm font-medium text-ink/60">
                    Estimated Wait
                  </p>

                  <p className="mt-1 text-2xl font-semibold text-ink">
                    ~{ewtMinutes} min
                  </p>

                  <p className="mt-2 text-[11px] italic text-ink/40">
                    Hybrid forecast (moving average + linear regression).
                  </p>
                </div>
              )}
            </>
          )}

          {entry.status === "scheduled" && (
            <p className="mt-3 text-xs text-ink/50">
              {entry.additional_notes?.match(/\[Appointment: ([^\]]+)\]/)?.[1] ??
                "Your appointment is scheduled. Please arrive on time."}
            </p>
          )}

          {entry.status === "in_service" && (
            <p className="mt-3 text-xs text-ink/50">
              Please head to the service area.
            </p>
          )}

          {entry.status === "completed" && (
            <p className="mt-3 text-xs text-ink/50">
              Your service has been completed. Thank you for visiting us!
            </p>
          )}

          {entry.status === "cancelled" && (
            <p className="mt-3 text-xs text-ink/50">
              This queue entry has been cancelled.
            </p>
          )}

          {entry.status === "no_show" && (
            <p className="mt-3 text-xs text-ink/50">
              This queue entry was marked as no-show.
            </p>
          )}
        </div>

        <p className="mt-4 text-center text-[11px] text-ink/35">
          This page updates automatically — no need to refresh.
        </p>

        {canCancel && (
          <button
            type="button"
            onClick={handleCancel}
            disabled={isCancelling}
            className="mt-5 w-full rounded-lg border border-clay/30 py-2.5 text-sm font-medium text-clay disabled:opacity-40"
          >
            {isCancelling ? "Cancelling..." : "Cancel my queue entry"}
          </button>
        )}

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
