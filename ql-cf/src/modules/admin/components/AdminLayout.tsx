import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Menu } from "lucide-react";
import { AdminSidebar } from "./AdminSidebar";

export function AdminLayout() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <div className="pastel-pink-gradient-page flex h-screen overflow-hidden">
      {isMobileOpen && <button type="button" aria-label="Close admin navigation" onClick={() => setIsMobileOpen(false)} className="fixed inset-0 z-40 bg-ink/30 md:hidden" />}
      <AdminSidebar
        isCollapsed={isCollapsed}
        isMobileOpen={isMobileOpen}
        onToggle={() => setIsCollapsed((value) => !value)}
        onMobileClose={() => setIsMobileOpen(false)}
      />
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-transparent">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[var(--app-border)] bg-white/90 px-4 backdrop-blur-sm md:hidden">
          <button type="button" aria-label="Open admin navigation" onClick={() => setIsMobileOpen(true)} className="dashboard-icon-control flex h-10 w-10 items-center justify-center text-[var(--app-ink-muted)] hover:text-[var(--color-ink)]">
            <Menu size={19} aria-hidden="true" />
          </button>
          <span className="font-display text-sm font-semibold text-ink">LynQ Admin</span>
        </header>
        <Outlet />
      </div>
    </div>
  );
}
