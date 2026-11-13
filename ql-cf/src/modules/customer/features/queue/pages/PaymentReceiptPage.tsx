import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Download } from "lucide-react";
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
  services: { name: string; quantity: number; price: number }[];
}

async function downloadReceipt(
  receipt: PaymentReceipt,
  ticketNumber: number,
  logoDataUrl: string,
) {
  const ticket = formatTicketNumber(ticketNumber);
  const paidAt = new Date(receipt.paidAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
  const logo = logoDataUrl
    ? await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Unable to load the salon logo for the receipt."));
      image.src = logoDataUrl;
    })
    : null;
  const canvas = document.createElement("canvas");
  canvas.width = 1440;
  canvas.height = 100;
  const measureContext = canvas.getContext("2d");
  if (!measureContext) throw new Error("Unable to create the receipt image.");

  measureContext.scale(2, 2);
  measureContext.font = "18px Arial, sans-serif";
  const wrapText = (text: string, maxWidth: number) => {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && measureContext.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    return lines;
  };
  const serviceRows = receipt.services.map((service) => ({
    label: `${service.name} × ${service.quantity}`,
    amount: `₱${(service.price * service.quantity).toFixed(2)}`,
  })).map((service) => ({
    ...service,
    lines: wrapText(service.label, 420),
  }));
  const contentHeight = 650
    + serviceRows.reduce((height, service) => height + Math.max(service.lines.length, 1) * 26 + 18, 0)
    + (receipt.discountAmount > 0 ? 34 : 0);
  canvas.height = (contentHeight + 48) * 2;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create the receipt image.");
  context.scale(2, 2);

  context.fillStyle = "#f5f7f3";
  context.fillRect(0, 0, 720, contentHeight + 48);
  context.fillStyle = "#ffffff";
  context.fillRect(24, 24, 672, contentHeight);
  context.strokeStyle = "#dfe6dc";
  context.strokeRect(24, 24, 672, contentHeight);

  const centerText = (text: string, y: number, font: string, color: string) => {
    context.font = font;
    context.fillStyle = color;
    context.textAlign = "center";
    context.fillText(text, 360, y);
  };
  const drawRule = (y: number) => {
    context.beginPath();
    context.setLineDash([6, 6]);
    context.strokeStyle = "#cbd5c8";
    context.moveTo(64, y);
    context.lineTo(656, y);
    context.stroke();
    context.setLineDash([]);
  };
  const drawAmountRow = (label: string, amount: string, y: number, bold = false) => {
    context.font = `${bold ? "bold " : ""}${bold ? 21 : 18}px Arial, sans-serif`;
    context.fillStyle = bold ? "#202720" : "#586358";
    context.textAlign = "left";
    context.fillText(label, 64, y);
    context.textAlign = "right";
    context.fillText(amount, 656, y);
  };

  if (logo) {
    const logoSize = 64;
    const scale = Math.min(logoSize / logo.naturalWidth, logoSize / logo.naturalHeight);
    const logoWidth = logo.naturalWidth * scale;
    const logoHeight = logo.naturalHeight * scale;
    context.drawImage(logo, 360 - logoWidth / 2, 42, logoWidth, logoHeight);
  }
  centerText("LYN & CO SALON AND SPA", 132, "bold 18px Arial, sans-serif", "#586358");
  centerText("Payment receipt", 174, "bold 30px Arial, sans-serif", "#202720");
  centerText(`Paid ${paidAt}`, 206, "18px Arial, sans-serif", "#586358");
  drawRule(236);

  drawAmountRow("Payment status", "Paid", 274);
  drawAmountRow("Queue ticket reference", ticket, 310);
  context.font = "bold 15px Arial, sans-serif";
  context.fillStyle = "#586358";
  context.textAlign = "left";
  context.fillText("SERVICES PAID", 64, 362);

  let y = 400;
  for (const service of serviceRows) {
    context.font = "18px Arial, sans-serif";
    context.fillStyle = "#202720";
    context.textAlign = "left";
    service.lines.forEach((line, index) => context.fillText(line, 64, y + index * 26));
    context.textAlign = "right";
    context.fillText(service.amount, 656, y);
    y += Math.max(service.lines.length, 1) * 26 + 18;
    context.beginPath();
    context.strokeStyle = "#e6ebe3";
    context.moveTo(64, y - 8);
    context.lineTo(656, y - 8);
    context.stroke();
  }

  y += 22;
  drawAmountRow("Subtotal", `₱${receipt.subtotal.toFixed(2)}`, y);
  y += 36;
  if (receipt.discountAmount > 0) {
    drawAmountRow("Discount", `−₱${receipt.discountAmount.toFixed(2)}`, y);
    y += 36;
  }
  drawRule(y);
  y += 38;
  drawAmountRow("Total paid", `₱${receipt.totalAmount.toFixed(2)}`, y, true);
  centerText(`Payment method: ${receipt.paymentMethod}`, y + 54, "16px Arial, sans-serif", "#586358");

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error("Unable to encode the receipt image."));
    }, "image/png");
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `lynq-receipt-${ticket}.png`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function PaymentReceiptPage() {
  const { entryId } = useParams<{ entryId: string }>();
  const { logoDataUrl } = useSalonBranding();
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [ticketNumber, setTicketNumber] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [receiptUnavailable, setReceiptUnavailable] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

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

  const handleReceiptDownload = (currentReceipt: PaymentReceipt, currentTicketNumber: number) => {
    setDownloadError(null);
    void downloadReceipt(currentReceipt, currentTicketNumber, logoDataUrl).catch((error: unknown) => {
      console.error("Payment receipt download failed:", error);
      setDownloadError("Unable to create the receipt image. Please try again.");
    });
  };

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
              <li key={`${service.name}-${index}`} className="flex items-start justify-between gap-4 text-sm">
                <span className="min-w-0 break-words text-ink">
                  {service.name}
                  <span className="text-ink/50"> × {service.quantity}</span>
                </span>
                <span className="shrink-0 font-medium text-ink">₱{(service.price * service.quantity).toFixed(2)}</span>
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
          <button type="button" onClick={() => handleReceiptDownload(receipt, ticketNumber)} className="dashboard-primary-action inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold">
            <Download size={16} aria-hidden="true" />
            Download receipt
          </button>
          <Link to={`/queue-status/${entryId}`} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-mist px-4 text-sm font-semibold text-ink">
            View queue ticket
          </Link>
        </div>
        {downloadError && <p role="alert" className="mt-2 text-center text-sm text-danger">{downloadError}</p>}
      </article>
    </main>
  );
}
