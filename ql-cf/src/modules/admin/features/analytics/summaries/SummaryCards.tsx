import type { SummaryResult } from "./types";

interface SummaryCardsProps {
  summaries: SummaryResult<unknown>[];
}

export function SummaryCards({ summaries }: SummaryCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {summaries.map((summary, index) => (
        <div key={`${summary.kpis[0]?.label ?? "summary"}-${index}`} className="rounded-2xl border border-[var(--app-border)] bg-white/80 p-4 shadow-[0_10px_24px_rgba(0,0,0,0.04)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--app-ink-muted)]">{summary.kpis[0]?.label ?? "Summary"}</p>
          <div className="mt-3 flex items-end justify-between gap-3">
            <p className="font-display text-2xl font-semibold text-[var(--color-ink)]">
              {summary.kpis[0]?.value ?? 0}
              {summary.kpis[0]?.unit ? ` ${summary.kpis[0].unit}` : ""}
            </p>
            {summary.kpis[0]?.delta && (
              <span className={`text-xs font-medium ${summary.kpis[0].delta.absolute >= 0 ? "text-[#3d8065]" : "text-[var(--app-accent)]"}`}>
                {summary.kpis[0].delta.absolute >= 0 ? "+" : ""}
                {summary.kpis[0].delta.absolute}
              </span>
            )}
          </div>
          {summary.flags.length > 0 && (
            <p className="mt-3 text-xs text-[var(--app-ink-muted)]">{summary.flags[0]?.message}</p>
          )}
        </div>
      ))}
    </div>
  );
}
