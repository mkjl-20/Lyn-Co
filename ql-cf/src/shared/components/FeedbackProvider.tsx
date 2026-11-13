import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FeedbackContext, type ConfirmationOptions, type NotificationKind } from "./FeedbackContext";

interface Notification {
  id: number;
  kind: NotificationKind;
  message: string;
}

interface PendingConfirmation extends ConfirmationOptions {
  id: number;
  resolve: (confirmed: boolean) => void;
}

let nextNotificationId = 0;
let nextConfirmationId = 0;

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [confirmations, setConfirmations] = useState<PendingConfirmation[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const activeErrorIds = useRef(new Set<number>());
  const confirmationsRef = useRef<PendingConfirmation[]>([]);
  const activeConfirmation = confirmations[0];

  useEffect(() => {
    confirmationsRef.current = confirmations;
  }, [confirmations]);

  const dismissNotification = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    activeErrorIds.current.delete(id);
    setNotifications((current) => current.filter((notification) => notification.id !== id));
  }, []);

  const notify = useCallback((kind: NotificationKind, message: string) => {
    if (kind === "error") {
      activeErrorIds.current.forEach((errorId) => {
        const timer = timers.current.get(errorId);
        if (timer) clearTimeout(timer);
        timers.current.delete(errorId);
      });
      activeErrorIds.current.clear();
      setNotifications((current) => current.filter((notification) => notification.kind !== "error"));
    }

    const id = ++nextNotificationId;
    if (kind === "error") activeErrorIds.current.add(id);
    setNotifications((current) => [...current, { id, kind, message }]);
    timers.current.set(id, setTimeout(() => dismissNotification(id), 4500));
  }, [dismissNotification]);

  const confirm = useCallback((options: ConfirmationOptions) => new Promise<boolean>((resolve) => {
    setConfirmations((current) => [...current, { ...options, id: ++nextConfirmationId, resolve }]);
  }), []);

  const closeConfirmation = useCallback((confirmed: boolean) => {
    const [currentConfirmation, ...remaining] = confirmationsRef.current;
    if (!currentConfirmation) return;
    confirmationsRef.current = remaining;
    currentConfirmation.resolve(confirmed);
    setConfirmations(remaining);
  }, []);

  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
    confirmationsRef.current.forEach((confirmation) => confirmation.resolve(false));
  }, []);

  useEffect(() => {
    if (!activeConfirmation) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeConfirmation(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeConfirmation, closeConfirmation]);

  return (
    <FeedbackContext.Provider value={{ notify, confirm }}>
      {children}
      {createPortal(
        <>
          <div className="pointer-events-none fixed right-4 top-4 z-[200] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite" aria-relevant="additions">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                role={notification.kind === "error" ? "alert" : "status"}
                className={`pointer-events-auto flex items-start gap-3 rounded-xl border bg-white px-4 py-3 text-sm shadow-lg ${notification.kind === "error" ? "border-red-200 text-red-800" : "border-sage/30 text-ink"}`}
              >
                <span aria-hidden="true" className={`mt-0.5 font-bold ${notification.kind === "error" ? "text-red-600" : "text-sage-deep"}`}>{notification.kind === "error" ? "!" : "✓"}</span>
                <p className="min-w-0 flex-1">{notification.message}</p>
                <button type="button" aria-label="Dismiss notification" onClick={() => dismissNotification(notification.id)} className="rounded px-1 text-ink/50 hover:bg-porcelain">×</button>
              </div>
            ))}
          </div>
          {activeConfirmation && (
            <div className="fixed inset-0 z-[210] flex items-center justify-center bg-ink/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeConfirmation(false); }}>
              <section role="alertdialog" aria-modal="true" aria-labelledby={`confirmation-title-${activeConfirmation.id}`} aria-describedby={`confirmation-message-${activeConfirmation.id}`} className="w-full max-w-sm rounded-2xl border border-mist bg-white p-5 shadow-2xl">
                <h2 id={`confirmation-title-${activeConfirmation.id}`} className="font-display text-lg font-semibold text-ink">{activeConfirmation.title ?? "Please confirm"}</h2>
                <p id={`confirmation-message-${activeConfirmation.id}`} className="mt-2 text-sm leading-6 text-ink/65">{activeConfirmation.message}</p>
                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" onClick={() => closeConfirmation(false)} className="form-cancel-action min-h-10 rounded-lg px-4 text-sm font-semibold">{activeConfirmation.cancelLabel ?? "Cancel"}</button>
                  <button type="button" autoFocus onClick={() => closeConfirmation(true)} className={`min-h-10 rounded-lg px-4 text-sm font-semibold text-white ${activeConfirmation.destructive ? "bg-red-600 hover:bg-red-700" : "bg-black hover:bg-neutral-700"}`}>{activeConfirmation.confirmLabel ?? "Confirm"}</button>
                </div>
              </section>
            </div>
          )}
        </>,
        document.body,
      )}
    </FeedbackContext.Provider>
  );
}
