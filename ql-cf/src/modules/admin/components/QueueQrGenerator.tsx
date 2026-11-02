import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { buildCustomerQueueUrl } from "@/shared/lib/queueQr";

interface QueueQrGeneratorProps {
  queueUrl: string;
}

export function QueueQrGenerator({ queueUrl }: QueueQrGeneratorProps) {
  const [qrDataUrl, setQrDataUrl] = useState<{ url: string; data: string } | null>(null);
  const [qrError, setQrError] = useState<{ url: string; message: string } | null>(null);
  const joinUrl = queueUrl.trim();
  const isLocalOnlyUrl = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(joinUrl);
  const isLanPreview = /^https?:\/\/\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?(?:\/|$)/i.test(joinUrl);
  let directQueueUrl = "";
  try {
    directQueueUrl = buildCustomerQueueUrl(joinUrl);
  } catch {
    directQueueUrl = "";
  }

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
        if (mounted) setQrDataUrl({ url: joinUrl, data: dataUrl });
      })
      .catch((error: unknown) => {
        console.error("Queue QR generation failed:", error);
        if (mounted) setQrError({ url: joinUrl, message: "Unable to generate the queue QR code." });
      });

    return () => {
      mounted = false;
    };
  }, [joinUrl]);

  const currentQr = qrDataUrl?.url === joinUrl ? qrDataUrl.data : "";
  const currentError = qrError?.url === joinUrl
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
    <div className="mt-5 rounded-xl border border-mist bg-porcelain/60 p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex h-48 w-48 shrink-0 items-center justify-center rounded-md bg-white p-2 ring-1 ring-mist">
          {currentQr ? (
            <img src={currentQr} alt="QR code linking to the customer queue join page" className="h-full w-full" />
          ) : currentError ? (
            <p role="alert" className="text-center text-sm text-clay">{currentError}</p>
          ) : (
            <p role="status" className="text-sm text-ink/55">Generating QR code…</p>
          )}
        </div>
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold text-ink">Open the queue without a QR code</h3>
          <p className="mt-1 text-sm text-ink/65">On your phone or tablet, open this link in a browser. The device must be connected to the same Wi-Fi as this computer.</p>
          {directQueueUrl ? (
            <a href={directQueueUrl} className="mt-2 block break-all text-sm font-semibold text-sage-deep underline underline-offset-2">
              {directQueueUrl}
            </a>
          ) : (
            <p className="mt-2 break-all text-sm text-ink/65">Enter a public website address or this computer’s Wi-Fi address above.</p>
          )}
          {isLocalOnlyUrl && (
            <p className="mt-2 text-sm text-clay" role="status">
              This address only works on this computer. Replace “localhost” with this computer’s Wi-Fi address before opening it from another device.
            </p>
          )}
          {isLanPreview && (
            <p className="mt-2 text-sm text-ink/60">If your Wi-Fi address changes, update this link. You can also use the QR code below.</p>
          )}
          <p className="mt-3 text-xs font-semibold text-ink/60">QR code (optional)</p>
          {currentQr && (
            <a
              href={currentQr}
              download="lyn-and-co-salon-and-spa-queue-qr.png"
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-sage-deep px-4 text-sm font-semibold text-white hover:bg-clay"
            >
              Download QR code
            </a>
          )}
        </div>
      </div>
    </div>
  );
}