import type { ReactNode } from "react";

export function AdminPageLayout({
  actions,
  children,
  maxWidth = "6xl",
  ariaBusy,
}: {
  title?: string;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
  maxWidth?: "6xl" | "7xl" | "full";
  ariaBusy?: boolean;
}) {
  const widthClass = {
    "6xl": "max-w-6xl",
    "7xl": "max-w-7xl",
    full: "max-w-none",
  }[maxWidth];

  return (
    <main
      className="pastel-pink-gradient-page min-h-full min-w-0 px-4 pb-5 pt-2 text-ink sm:px-6 sm:pb-6 sm:pt-3"
      aria-busy={ariaBusy}
    >
      <div className={`mx-auto min-w-0 w-full ${widthClass}`}>
        {actions && <div className="flex justify-end pt-2">{actions}</div>}
        {children}
      </div>
    </main>
  );
}
