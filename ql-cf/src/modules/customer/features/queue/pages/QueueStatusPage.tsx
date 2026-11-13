import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useParams, Link } from "react-router-dom";
import { Clock3, TicketCheck } from "lucide-react";
import { supabaseClient } from "@/shared/lib/supabaseClient";
import { BackButton } from "@/shared/components/BackButton";
import { QueueProgress } from "@/shared/components/QueueProgress";
import { formatTicketNumber } from "@/shared/lib/ticketNumber";
import { cancelQueueEntry, fetchQueueStatus, fetchQueueWaitEstimate } from "../services/joinQueueService";

interface QueueStatusData {
  id: string;
  ticket_number: number;
  customer_name: string;
  status: "waiting" | "in_service" | "completed" | "cancelled" | "no_show";
  position: number | null;
  estimated_duration: number;
  additional_notes: string | null;
  created_at: string;
  receipt: {
    subtotal: number;
    discountAmount: number;
    totalAmount: number;
    paymentMethod: string;
    paidAt: string;
    services: { name: string; quantity: number }[];
  } | null;
  receiptUnavailable?: boolean;
  assigned_service_seats: {
    id: string;
    serviceName: string;
    status: string;
    customerStage: string;
    startedAt: string | null;
    completedAt: string | null;
    staffStationLabel: string | null;
    assignedStaffName: string | null;
    staffUpdate: string | null;
    staffUpdatedAt: string | null;
    serviceSeatLabel: string | null;
  }[];
}

const STATUS_LABELS: Record<QueueStatusData["status"], string> = {
  waiting: "Waiting",
  in_service: "You're being served",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "Marked as no-show",
};

export function QueueStatusPage() {
  const { entryId } = useParams<{ entryId: string }>();

  const [entry, setEntry] = useState<QueueStatusData | null>(null);
  const [peopleAhead, setPeopleAhead] = useState<number | null>(null);
  const [ewtMinutes, setEwtMinutes] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCancelling, setIsCancelling] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [ticketQrCode, setTicketQrCode] = useState<string | null>(null);
  const [ticketQrError, setTicketQrError] = useState<string | null>(null);
  const statusRequestInFlight = useRef(false);
  const waitRequestInFlight = useRef(false);

  const loadStatus = useCallback(async () => {
    if (statusRequestInFlight.current) return;
    if (!entryId) {
      setErrorMessage("Invalid queue entry.");
      setIsLoading(false);
      return;
    }

    statusRequestInFlight.current = true;
    setErrorMessage(null);

    try {
      const data = await fetchQueueStatus(entryId);
      setEntry(data.entry as QueueStatusData);
      setPeopleAhead(data.peopleAhead);
    } catch (error) {
      console.error("Queue status error:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load your queue status."
      );
    } finally {
      statusRequestInFlight.current = false;
      setIsLoading(false);
    }
  }, [entryId]);

  const loadWaitEstimate = useCallback(async () => {
    if (!entryId || waitRequestInFlight.current) return;
    waitRequestInFlight.current = true;
    try {
      const { wait } = await fetchQueueWaitEstimate(entryId);
      setEwtMinutes(wait.ewtMinutes);
    } catch (error) {
      console.error("Queue wait estimate error:", error);
    } finally {
      waitRequestInFlight.current = false;
    }
  }, [entryId]);

  useEffect(() => {
    // Load initial queue data and subscribe to external realtime updates.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "queue_entry_services",
          filter: `queue_entry_id=eq.${entryId}`,
        },
        () => {
          loadStatus();
        }
      )
      .subscribe();
    const timer = window.setInterval(() => void loadStatus(), 2_000);
    window.addEventListener("online", loadStatus);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", loadStatus);
      supabaseClient.removeChannel(channel);
    };
  }, [entryId, loadStatus]);

  useEffect(() => {
    void loadWaitEstimate();
    const timer = window.setInterval(() => void loadWaitEstimate(), 30_000);
    return () => window.clearInterval(timer);
  }, [loadWaitEstimate]);

  useEffect(() => {
    let active = true;
    if (!entryId) return;

    QRCode.toDataURL(window.location.href, {
      width: 192,
      margin: 1,
      errorCorrectionLevel: "M",
    }).then((dataUrl) => {
      if (active) {
        setTicketQrCode(dataUrl);
        setTicketQrError(null);
      }
    }).catch((error: unknown) => {
      console.error("Queue ticket QR generation failed:", error);
      if (active) setTicketQrError("Ticket QR code is unavailable. You can still use the ticket number.");
    });

    return () => {
      active = false;
    };
  }, [entryId]);

  async function handleCancel() {
    if (!entryId) return;
    if (!window.confirm("Cancel your place in the queue? This cannot be undone.")) return;
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
      <div className="customer-gradient-page flex min-h-screen items-center justify-center p-3 sm:p-6">
        <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl sm:p-8">
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
      <div className="customer-gradient-page flex min-h-screen items-center justify-center p-3 sm:p-6">
        <div className="w-full max-w-lg rounded-2xl bg-white p-5 text-center shadow-xl sm:p-8">
          <div className="mb-5 flex justify-start">
            <BackButton to="/" label="Back to customer queue" />
          </div>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-clay/10">
            <span className="text-xl text-clay">!</span>
          </div>

          <h1 className="mt-4 text-lg font-semibold text-ink">
            Queue Status Unavailable
          </h1>

          <p className="mt-2 text-sm text-clay">
            {errorMessage ?? "Something went wrong."}
          </p>

          <button
            type="button"
            onClick={() => {
              setIsLoading(true);
              void loadStatus();
            }}
            className="mt-5 min-h-11 rounded-lg bg-sage-deep px-5 py-2.5 text-sm font-semibold text-white hover:bg-clay"
          >
            Try again
          </button>

          <Link
            to="/"
            className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-mist px-5 py-2.5 text-sm font-medium text-ink transition hover:bg-sage-light"
          >
            Join the Queue
          </Link>
        </div>
      </div>
    );
  }

  const canCancel = entry.status === "waiting";
  const serviceSeatLabel = entry.assigned_service_seats.find(
    (item) => item.serviceSeatLabel
  )?.serviceSeatLabel;
  const customerStation = entry.assigned_service_seats.find(
    (item) => item.staffStationLabel || item.assignedStaffName
  );
  const joinedAt = new Date(entry.created_at).toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="customer-gradient-page flex min-h-screen items-start justify-center px-3 py-4 sm:items-center sm:p-6">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-mist bg-white shadow-xl">
        <section>
          <div className="bg-sage-deep px-5 py-4 text-white sm:px-6">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/70">
              Lyn &amp; Co Salon and Spa
            </p>
            <h1 className="mt-1 font-display text-xl font-semibold">Queue ticket</h1>
          </div>

          <div className="px-4 py-4 sm:px-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 text-xs font-semibold text-ink/55">
                  <TicketCheck size={16} aria-hidden="true" />
                  Ticket number
                </p>
                <p className="mt-1 text-4xl font-bold tracking-tight text-sage-deep">
                  {formatTicketNumber(entry.ticket_number)}
                </p>
              </div>
            {ticketQrCode ? (
              <div className="flex shrink-0 flex-col items-center">
                <img
                  src={ticketQrCode}
                  alt={`QR code for queue ticket ${entry.ticket_number}`}
                  className="h-20 w-20 rounded-lg border border-mist bg-white p-1.5"
                />
                <p className="mt-1 text-center text-[10px] text-ink/55">
                  Scan for updates
                </p>
              </div>
            ) : ticketQrError ? (
              <p role="status" className="max-w-40 text-right text-xs text-clay">{ticketQrError}</p>
            ) : null}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-sage-light/60 p-3 text-sm">
              <div className="min-w-0">
                <p className="text-xs text-ink/55">Customer</p>
                <p className="mt-0.5 truncate font-semibold text-ink">{entry.customer_name}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-ink/55">Status</p>
                <p className="mt-0.5 font-semibold text-sage-deep">{STATUS_LABELS[entry.status]}</p>
              </div>
              <div className="col-span-2 flex items-center justify-between gap-2 border-t border-mist/80 pt-2 text-xs text-ink/55">
                <span>Joined {joinedAt}</span>
                <span>Payment at salon</span>
              </div>
            </div>

            <div className="mt-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-ink/50">Service summary</h2>
              <div className="mt-2">
                <QueueProgress
                  status={entry.status}
                  customerStage={entry.status === "in_service" ? "in_service" : "waiting"}
                  services={entry.assigned_service_seats.map((service) => ({
                    id: service.id,
                    name: service.serviceName,
                    status: service.status,
                    customerStage: service.customerStage,
                  }))}
                />
              </div>
              <ul className="mt-2 space-y-2 rounded-lg border border-mist p-2">
                {entry.assigned_service_seats.map((service) => (
                  <li key={service.id} className="rounded-md bg-white p-2">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 break-words font-medium text-ink">{service.serviceName}</span>
                      <span className="shrink-0 text-xs font-medium capitalize text-sage-deep">
                        {service.status === "pending" && entry.status === "in_service"
                          ? "Up next"
                          : service.customerStage.replace("_", " ")}
                      </span>
                    </div>
                    {(service.staffStationLabel || service.serviceSeatLabel || service.assignedStaffName) && (
                      <p className="mt-1 text-xs text-ink/55">
                        {[service.staffStationLabel, service.serviceSeatLabel, service.assignedStaffName].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            {entry.receipt && (
              <Link
                to={`/receipt/${entry.id}`}
                className="mt-4 flex min-h-12 items-center justify-between gap-3 rounded-xl border border-sage/30 bg-sage-light/50 px-4 py-3"
              >
                <span>
                  <span className="block text-sm font-semibold text-ink">Payment receipt</span>
                  <span className="mt-0.5 block text-xs text-ink/55">View or print separately from your queue ticket.</span>
                </span>
                <span className="shrink-0 text-base font-bold text-sage-deep">₱{entry.receipt.totalAmount.toFixed(2)}</span>
              </Link>
            )}
            {entry.receiptUnavailable && (
              <p role="status" className="mt-3 text-xs text-ink/55">
                Your digital receipt is temporarily unavailable. Your queue status is still current.
              </p>
            )}
          </div>
        </section>

        <div className="px-4 pb-4 sm:px-6 sm:pb-6">
          <div className="mt-2 rounded-xl bg-sage/10 p-4 text-center sm:p-5" aria-live="polite" aria-atomic="true">
            <p className="flex items-center justify-center gap-2 text-sm font-semibold text-sage-deep">
              <Clock3 size={15} aria-hidden="true" />
              Live queue &amp; service updates
            </p>

            {entry.status === "waiting" && (
              <>
              {customerStation && (
                <div className="mt-3 rounded-lg border border-sage/20 bg-white/80 px-4 py-3 text-left">
                  <p className="text-xs font-medium text-ink/55">Your station</p>
                  <p className="mt-1 text-lg font-bold text-sage-deep">
                    {customerStation.staffStationLabel}
                  </p>
                  <p className="mt-1 text-xs text-ink/60">
                    {customerStation.serviceName} · {customerStation.customerStage.replace("_", " ")}
                  </p>
                  {customerStation.assignedStaffName && (
                    <p className="mt-1 text-xs font-medium text-ink/70">Your stylist: {customerStation.assignedStaffName}</p>
                  )}
                </div>
              )}
              <p className="mt-3 rounded-lg bg-white/80 px-4 py-3 text-sm font-medium text-ink/70">
                Please wait until staff call your ticket.
              </p>
              {serviceSeatLabel ? (
                <div className="mt-3 rounded-lg border border-sage/20 bg-white/80 px-4 py-3 text-left">
                  <p className="text-xs font-medium text-ink/55">Your service seat</p>
                  <p className="mt-1 text-lg font-bold text-sage-deep">{serviceSeatLabel}</p>
                </div>
              ) : (
                <p className="mt-3 rounded-lg bg-gold-light px-4 py-3 text-sm font-medium text-ink/70">
                  No service seat is available yet. Please ask reception for assistance.
                </p>
              )}
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

                </div>
              )}
              </>
            )}

            {entry.status === "in_service" && (
              <>
              {customerStation && (
                <div className="mt-3 rounded-lg border border-sage/20 bg-white/80 px-4 py-3 text-left">
                  <p className="text-xs font-medium text-ink/55">Your station</p>
                  <p className="mt-1 text-lg font-bold text-sage-deep">
                    {customerStation.staffStationLabel}
                  </p>
                  <p className="mt-1 text-xs text-ink/60">
                    {customerStation.serviceName} · {customerStation.customerStage.replace("_", " ")}
                  </p>
                  {customerStation.assignedStaffName && (
                    <p className="mt-1 text-xs font-medium text-ink/70">Your stylist: {customerStation.assignedStaffName}</p>
                  )}
                  {customerStation.staffUpdate && (
                    <p className="mt-2 rounded-md bg-sage/10 px-3 py-2 text-sm text-ink/75" aria-live="polite">
                      {customerStation.staffUpdate}
                    </p>
                  )}
                </div>
              )}
              {serviceSeatLabel ? (
                <div className="mt-3 rounded-lg bg-white/80 px-4 py-3 text-left">
                  <p className="text-xs font-medium text-ink/55">Please take your service seat</p>
                  <p className="mt-1 text-lg font-bold text-sage-deep">{serviceSeatLabel}</p>
                </div>
              ) : (
                <p className="mt-3 text-sm text-ink/60">Please follow staff instructions to your service seat.</p>
              )}
              </>
            )}

            {entry.status === "completed" && (
              <p className="mt-3 text-sm text-ink/60">Service completed.</p>
            )}

            {entry.status === "cancelled" && (
              <p className="mt-3 text-sm text-ink/60">Queue cancelled.</p>
            )}

            {entry.status === "no_show" && (
              <p className="mt-3 text-sm text-ink/60">Marked no-show.</p>
            )}
          </div>

        {canCancel && (
          <button
            type="button"
            onClick={handleCancel}
            disabled={isCancelling}
            className="mt-5 min-h-11 w-full rounded-lg border border-clay/40 py-2.5 text-sm font-semibold text-clay hover:bg-clay-light disabled:opacity-40"
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
    </div>
  );
}
