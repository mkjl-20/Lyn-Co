import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { RefreshCw } from "lucide-react";
import { buildCustomerQueueUrl } from "@/shared/lib/queueQr";

interface QueueQrGeneratorProps {
  queueUrl: string;
}

export function QueueQrGenerator({ queueUrl }: QueueQrGeneratorProps) {
  const [qrDataUrl, setQrDataUrl] = useState<{ url: string; data: string; refreshCount: number } | null>(null);
  const [qrError, setQrError] = useState<{ url: string; message: string; refreshCount: number } | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const joinUrl = queueUrl.trim();
  const isLocalOnlyUrl = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(joinUrl);
  const isLanPreview = /^https?:\/\/\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?(?:\/|$)/i.test(joinUrl);
  const directQueueUrl = (() => {
    try {
      return buildCustomerQueueUrl(joinUrl);
    } catch {
      return "";
    }
  })();
  const hasCurrentQr = qrDataUrl?.url === joinUrl && qrDataUrl.refreshCount === refreshCount;
  const hasCurrentError = qrError?.url === joinUrl && qrError.refreshCount === refreshCount;
  const isGenerating = Boolean(directQueueUrl && !hasCurrentQr && !hasCurrentError);

  useEffect(() => {
    let mounted = true;

    let validUrl: string;
    try {
      validUrl = buildCustomerQueueUrl(joinUrl.trim());
    } catch {
      return () => {
        mounted = false;
      };
    }

    QRCode.toDataURL(validUrl, {
      errorCorrectionLevel: "H",
      margin: 2,
      width: 320,
      color: { dark: "#262626", light: "#ffffff" },
    })
      .then((dataUrl) => {
        if (mounted) setQrDataUrl({ url: joinUrl, data: dataUrl, refreshCount });
      })
      .catch((error: unknown) => {
        console.error("Queue QR generation failed:", error);
        if (mounted) setQrError({ url: joinUrl, message: "Unable to generate the queue QR code.", refreshCount });
      });

    return () => {
      mounted = false;
    };
  }, [joinUrl, refreshCount]);

  const currentQr = qrDataUrl?.url === joinUrl && qrDataUrl.refreshCount === refreshCount ? qrDataUrl.data : "";
  const currentError = qrError?.url === joinUrl && qrError.refreshCount === refreshCount
    ? qrError.message
    : (() => {
      try {
        buildCustomerQueueUrl(joinUrl.trim());
        return null;
      } catch {
        return "Enter a valid HTTP or HTTPS queue link.";
      }
    })();

  return (
    <div className="mt-3 rounded-xl border border-mist bg-porcelain/60 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex h-36 w-36 shrink-0 items-center justify-center rounded-md bg-white p-2 ring-1 ring-mist">
          {currentQr ? (
            <img src={currentQr} alt="QR code linking to the customer queue join page" className="h-full w-full" />
          ) : currentError ? (
            <p role="alert" className="text-center text-sm text-clay">{currentError}</p>
          ) : (
            <p role="status" className="text-sm text-ink/55">{isGenerating ? "Generating QR code…" : "QR code will appear here."}</p>
          )}
        </div>
        <div className="min-w-0">
          <h3 className="font-display text-sm font-semibold text-ink">Queue link</h3>
          {directQueueUrl ? (
            <a href={directQueueUrl} className="mt-1 block break-all text-xs font-semibold text-sage-deep underline underline-offset-2">
              {directQueueUrl}
            </a>
          ) : (
            <p className="mt-1 break-all text-xs text-ink/65">Enter a queue address above.</p>
          )}
          {isLocalOnlyUrl && (
            <p className="mt-2 text-xs text-red-700" role="status">
              This QR uses a computer-only address. Phones cannot open localhost; use the port-forwarded public URL or this computer&apos;s LAN IP (same Wi-Fi).
            </p>
          )}
          {isLanPreview && (
            <p className="mt-2 text-xs text-ink/60">Phone must use the same Wi-Fi.</p>
          )}
          {directQueueUrl && !isGenerating && (
            <button
              type="button"
              onClick={() => setRefreshCount((count) => count + 1)}
              disabled={isGenerating}
              className="mt-3 inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-mist px-3 text-xs font-semibold text-ink/75 transition hover:bg-sage-light disabled:cursor-wait disabled:opacity-50"
            >
              <RefreshCw size={14} aria-hidden="true" className={isGenerating ? "animate-spin" : ""} />
              {isGenerating ? "Refreshing…" : "Refresh QR code"}
            </button>
          )}
          {currentQr && (
            <a
              href={currentQr}
              download="lyn-and-co-salon-and-spa-queue-qr.png"
              className="dashboard-primary-action mt-2 inline-flex min-h-9 items-center justify-center rounded-md px-3 text-xs font-semibold"
            >
              Download QR code
            </a>
          )}
          <p className="mt-2 text-xs text-ink/55">
            After changing the public address, refresh and download a new QR. Previously printed QR codes cannot change their destination.
          </p>
        </div>
      </div>
    </div>
  );
}