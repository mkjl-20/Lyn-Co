import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--app-canvas)] p-6 text-[var(--color-ink)]">
      <section className="w-full max-w-lg rounded-3xl border border-[var(--app-border)] bg-[var(--app-surface)] p-8 shadow-[var(--app-shadow)] sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--app-ink-muted)]">LynQ · Page not found</p>
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight">We couldn’t find that page.</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--app-ink-muted)]">
          The link may be outdated, or the address may have been entered incorrectly.
        </p>
        <Link
          to="/"
          className="mt-7 inline-flex min-h-11 items-center rounded-xl bg-[var(--app-accent)] px-5 text-sm font-semibold text-white transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Return to queue
        </Link>
      </section>
    </main>
  );
}
