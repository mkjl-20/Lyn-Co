import { useState } from "react";
import { createPortal } from "react-dom";

interface LogoutConfirmationDialogProps {
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}

export function LogoutConfirmationDialog({ onCancel, onConfirm }: LogoutConfirmationDialogProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleConfirm() {
    if (isConfirming) return;
    setIsConfirming(true);
    setErrorMessage(null);
    try {
      await onConfirm();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to sign out.");
    } finally {
      setIsConfirming(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex min-h-screen items-center justify-center bg-black/30 p-4">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-label="Confirm sign out"
        aria-describedby="logout-dialog-description"
        className="w-full max-w-xs overflow-hidden rounded-xl border border-ink/10 bg-white text-center shadow-xl"
      >
        <div className="px-5 pb-5 pt-4">
          <p id="logout-dialog-description" className="mt-2 text-base font-medium leading-6 text-ink">
            Are you sure you want to sign out?
          </p>
          {errorMessage && (
            <p role="alert" className="mt-2 text-sm leading-5 text-clay">
              {errorMessage}
            </p>
          )}
        </div>
        <div className="flex border-t border-mist">
          <button
            type="button"
            disabled={isConfirming}
            onClick={onCancel}
            className="min-h-12 flex-1 bg-white px-3 text-base font-semibold text-black transition-colors hover:bg-neutral-100 disabled:text-neutral-400"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isConfirming}
            onClick={() => void handleConfirm()}
            className="min-h-12 flex-1 border-l border-mist bg-white px-3 text-base font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:text-red-300"
          >
            {isConfirming ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
