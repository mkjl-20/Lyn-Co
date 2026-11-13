import { Component, type ErrorInfo, type ReactNode } from "react";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false, errorMessage: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("The application encountered an unexpected error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-[var(--app-canvas)] p-6 text-[var(--color-ink)]">
          <section className="w-full max-w-md rounded-3xl border border-[var(--app-border)] bg-[var(--app-surface)] p-8 text-center shadow-[var(--app-shadow)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--app-ink-muted)]">LynQ</p>
            <h1 className="mt-4 font-display text-2xl font-semibold">This page needs a refresh</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--app-ink-muted)]">
              Something unexpected interrupted the page. Your account data has not been changed by this screen.
            </p>
            {this.state.errorMessage && (
              <details className="mt-4 text-left">
                <summary className="cursor-pointer text-xs font-semibold text-[var(--app-ink-muted)]">
                  Technical details
                </summary>
                <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--app-canvas)] p-3 text-xs text-[var(--app-ink-muted)]">
                  {this.state.errorMessage}
                </pre>
              </details>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 min-h-11 rounded-xl bg-[var(--app-accent)] px-5 text-sm font-semibold text-white transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              Reload page
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
