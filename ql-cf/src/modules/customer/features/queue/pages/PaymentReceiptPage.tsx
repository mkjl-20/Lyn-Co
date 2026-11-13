import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Printer } from "lucide-react";
import { SalonLogoImage } from "@/shared/components/SalonLogoImage";
import { useSalonBranding } from "@/shared/context/SalonBrandingContext";
import { formatTicketNumber } from "@/shared/lib/ticketNumber";
import { fetchQueueStatus } from "../services/joinQueueService";

interface PaymentReceipt {
  subtotal: number;
  discountAmount: number;
  totalAmount: number;
  paymentMethod: string;
  paidAt: string;
  services: { name: string; quantity: number }[];
}

export function PaymentReceiptPage() {
  const { entryId } = useParams<{ entryId: string }>();
  const { logoDataUrl } = useSalonBranding();
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [ticketNumber, setTicketNumber] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [receiptUnavailable, setReceiptUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    if (!entryId) return;

    void fetchQueueStatus(entryId)
      .then(({ entry }) => {
        if (!active) return;
        setReceipt(entry.receipt);
        setTicketNumber(entry.ticket_number);
        setReceiptUnavailable(Boolean(entry.receiptUnavailable));
      })
      .catch((error: unknown) => {
        console.error("Payment receipt load failed:", error);
        if (active) setErrorMessage(error instanceof Error ? error.message : "Unable to load the payment receipt.");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [entryId]);

  if (!entryId) {
    return (
      <main className="customer-gradient-page flex min-h-screen items-center justify-center p-4">
        <section className="w-full max-w-md rounded-2xl border border-mist bg-white p-6 text-center shadow-xl">
          <h1 className="font-display text-xl font-semibold text-ink">Receipt unavailable</h1>
          <p className="mt-2 text-sm text-ink/60">This receipt link is invalid.</p>
          <Link to="/" className="dashboard-primary-action mt-5 inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold">
            Back to queue
          </Link>
        </section>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className="customer-gradient-page flex min-h-screen items-center justify-center p-4">
        <p role="status" className="rounded-xl bg-white px-5 py-4 text-sm text-ink/60 shadow">Loading payment receipt…</p>
      </main>
    );
  }

  if (errorMessage || !receipt || ticketNumber === null) {
    return (
      <main className="customer-gradient-page flex min-h-screen items-center justify-center p-4">
        <section className="w-full max-w-md rounded-2xl border border-mist bg-white p-6 text-center shadow-xl">
          <h1 className="font-display text-xl font-semibold text-ink">{errorMessage ? "Receipt unavailable" : "No payment receipt yet"}</h1>
          <p className="mt-2 text-sm text-ink/60">
            {errorMessage ?? (receiptUnavailable
              ? "The payment receipt is temporarily unavailable. Please try again later."
              : "A receipt will be available here after payment is completed at the salon.")}
          </p>
          <Link to={entryId ? `/queue-status/${entryId}` : "/"} className="dashboard-primary-action mt-5 inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold">
            Back to queue ticket
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="customer-gradient-page flex min-h-screen items-start justify-center p-4 sm:items-center sm:p-6 print:min-h-0 print:bg-white print:p-0">
      <article className="w-full max-w-md rounded-2xl border border-mist bg-white p-5 shadow-xl sm:p-8 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <div className="text-center">
          {logoDataUrl && (
            <SalonLogoImage src={logoDataUrl} alt="Salon logo" className="mx-auto mb-3 h-14 w-14 rounded-lg object-contain" />
          )}
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink/55">Lyn &amp; Co Salon and Spa</p>
          <h1 className="mt-2 font-display text-2xl font-semibold text-ink">Payment receipt</h1>
          <p className="mt-1 text-xs text-ink/55">Paid {new Date(receipt.paidAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</p>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-3 border-y border-dashed border-mist py-4 text-sm">
          <div>
            <dt className="text-xs text-ink/55">Payment status</dt>
            <dd className="mt-1 font-semibold text-success">Paid</dd>
          </div>
          <div className="text-right">
            <dt className="text-xs text-ink/55">Queue ticket reference</dt>
            <dd className="mt-1 font-semibold text-ink">{formatTicketNumber(ticketNumber)}</dd>
          </div>
        </dl>

        <section className="mt-5" aria-labelledby="receipt-items-heading">
          <h2 id="receipt-items-heading" className="text-xs font-bold uppercase tracking-wider text-ink/50">Services paid</h2>
          <ul className="mt-3 space-y-3">
            {receipt.services.map((service, index) => (
              <li key={`${service.name}-${index}`} className="flex justify-between gap-4 text-sm">
                <span className="min-w-0 break-words text-ink">{service.name} <span className="text-ink/50">× {service.quantity}</span></span>
              </li>
            ))}
          </ul>
        </section>

        <dl className="mt-5 space-y-2 border-t border-mist pt-4 text-sm">
          <div className="flex justify-between gap-3 text-ink/65">
            <dt>Subtotal</dt>
            <dd>₱{receipt.subtotal.toFixed(2)}</dd>
          </div>
          {receipt.discountAmount > 0 && (
            <div className="flex justify-between gap-3 text-ink/65">
              <dt>Discount</dt>
              <dd>−₱{receipt.discountAmount.toFixed(2)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-3 border-t border-mist pt-3 text-base font-bold text-ink">
            <dt>Total paid</dt>
            <dd>₱{receipt.totalAmount.toFixed(2)}</dd>
          </div>
        </dl>
        <p className="mt-4 text-center text-xs capitalize text-ink/55">Payment method: {receipt.paymentMethod}</p>

        <div className="mt-6 grid gap-2 print:hidden sm:grid-cols-2">
          <button type="button" onClick={() => window.print()} className="dashboard-primary-action inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold">
            <Printer size={16} aria-hidden="true" />
            Print receipt
          </button>
          <Link to={`/queue-status/${entryId}`} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-mist px-4 text-sm font-semibold text-ink">
            View queue ticket
          </Link>
        </div>
      </article>
    </main>
  );
}
