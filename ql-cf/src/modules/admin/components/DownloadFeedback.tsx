import { X } from "lucide-react";

export interface DownloadFeedbackState {
  status: "idle" | "running" | "success" | "error";
  message?: string;
  progressPercent?: number | null;
  details?: { label: string; count: number | null }[];
}

export function DownloadFeedback({
  state,
  floating = false,
  onDismiss,
}: {
  state: DownloadFeedbackState;
  floating?: boolean;
  onDismiss?: () => void;
}) {
  if (state.status === "idle") return null;

  const isRunning = state.status === "running";
  const isError = state.status === "error";

  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className={`${floating ? "fixed bottom-4 right-4 z-[120] w-[min(24rem,calc(100vw-2rem))] shadow-xl" : ""} rounded-lg border bg-white px-4 py-3 text-sm ${
        isError
          ? "border-clay/20 bg-clay-light text-clay"
          : state.status === "success"
            ? "border-success/20 bg-success-soft text-success"
            : "border-sage/20 bg-sage-light/40 text-sage-deep"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium">{state.message}</p>
        {onDismiss && (
          <button type="button" onClick={onDismiss} aria-label="Dismiss download status" className="-mr-2 -mt-2 rounded p-2 opacity-70 hover:opacity-100">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {isRunning && state.progressPercent !== undefined && state.progressPercent !== null ? (
        <div className="mt-2">
          <div className="mb-1 flex justify-between text-xs">
            <span>Download progress</span>
            <span>{state.progressPercent}%</span>
          </div>
          <progress
            aria-label="Download progress"
            value={state.progressPercent}
            max={100}
            className="h-2 w-full accent-sage"
          />
        </div>
      ) : isRunning ? (
        <progress aria-label="Preparing download" className="mt-2 h-2 w-full accent-sage" />
      ) : state.status === "success" ? (
        <progress aria-label="Download prepared" value={100} max={100} className="mt-2 h-2 w-full accent-sage" />
      ) : null}
      {state.details && state.details.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-current/10 pt-2 text-xs">
          {state.details.map(({ label, count }) => (
            <li key={label} className="flex justify-between gap-3">
              <span>{label}</span>
              <span className="shrink-0 font-semibold">{count === null ? "…" : count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
