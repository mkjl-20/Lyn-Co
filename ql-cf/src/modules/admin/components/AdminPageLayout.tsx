import type { ReactNode } from "react";

export function AdminPageLayout({
  actions,
  children,
  maxWidth = "6xl",
  ariaBusy,
  fullHeight = false,
}: {
  title?: string;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
  maxWidth?: "6xl" | "7xl" | "full";
  ariaBusy?: boolean;
  fullHeight?: boolean;
}) {
  const widthClass = {
    "6xl": "max-w-6xl",
    "7xl": "max-w-7xl",
    full: "max-w-none",
  }[maxWidth];

  return (
    <main
      className="pastel-pink-gradient-page flex h-full min-w-0 min-h-0 flex-col overflow-hidden px-4 pb-10 pt-2 text-ink sm:px-6 sm:pb-10 sm:pt-3"
      aria-busy={ariaBusy}
      style={{ minHeight: fullHeight ? 0 : undefined }}
    >
      <div className={`mx-auto flex min-h-0 w-full ${widthClass} flex-1 flex-col`}>
        {actions && <div className="flex shrink-0 justify-end pt-2">{actions}</div>}
        <div className={`min-h-0 flex-1 ${fullHeight ? "flex flex-col overflow-hidden" : "overflow-y-auto"}`}>
          {children}
        </div>
      </div>
    </main>
  );
}
