export function PaginationControls({
  page,
  totalPages,
  firstItem,
  lastItem,
  totalItems,
  onPageChange,
  label = "Rows",
}: {
  page: number;
  totalPages: number;
  firstItem: number;
  lastItem: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  label?: string;
}) {
  return (
    <nav aria-label={`${label} pagination`} className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--app-border)] px-4 py-3 text-sm">
      <p className="text-xs text-[var(--app-ink-muted)]" aria-live="polite">
        Showing {firstItem}–{lastItem} of {totalItems}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="min-h-10 rounded-lg border border-[var(--app-border)] px-3 font-semibold text-[var(--color-ink)] transition hover:bg-[var(--app-surface-soft)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          Previous
        </button>
        <span className="min-w-20 text-center text-xs font-medium text-[var(--app-ink-muted)]">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="min-h-10 rounded-lg border border-[var(--app-border)] px-3 font-semibold text-[var(--color-ink)] transition hover:bg-[var(--app-surface-soft)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          Next
        </button>
      </div>
    </nav>
  );
}
