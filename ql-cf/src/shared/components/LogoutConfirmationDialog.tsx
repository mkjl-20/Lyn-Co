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
        className="w-full max-w-[245px] overflow-hidden rounded-[10px] bg-white text-center shadow-xl"
      >
        <div className="px-5 pb-4 pt-3">
          <p id="logout-dialog-description" className="mt-3 text-xs text-ink">
            Are you sure you want to sign out?
          </p>
          {errorMessage && (
            <p role="alert" className="mt-2 text-xs text-clay">
              {errorMessage}
            </p>
          )}
        </div>
        <div className="flex border-t border-mist">
          <button
            type="button"
            disabled={isConfirming}
            onClick={onCancel}
            className="min-h-10 flex-1 border-r border-mist bg-white text-sm text-ink hover:bg-neutral-50 disabled:bg-white disabled:text-neutral-400"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isConfirming}
            onClick={() => void handleConfirm()}
            className="min-h-10 flex-1 bg-white text-sm font-semibold text-red-600 hover:bg-red-50 disabled:bg-white disabled:text-red-300"
          >
            {isConfirming ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
