import { NavLink } from "react-router-dom";
import { useState } from "react";
import {
  Activity,
  ChartLine,
  ChevronRight,
  CircleUserRound,
  CreditCard,
  Database,
  FileText,
  House,
  ListOrdered,
  Menu,
  Monitor,
  Percent,
  Scissors,
  Settings,
  Star,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { MENU_GROUPS } from "./adminNavigation";

const NAV_ICONS: Record<string, LucideIcon> = {
  Overview: House,
  Operations: ListOrdered,
  Management: UsersRound,
  Settings,
  "Queue Control": ListOrdered,
  "TV Display": Monitor,
  "Device Monitoring": Activity,
  "Analytics & Forecasting": ChartLine,
  "Staff Management": UsersRound,
  "Service Catalog": Scissors,
  "VIP & Customer Tags": Star,
  Promotions: Percent,
  "POS & Transactions": CreditCard,
  Reports: FileText,
  "Backup & Restore": Database,
  "Settings & Branding": Settings,
  "Account Management": CircleUserRound,
  "Audit Logs": FileText,
};

function NavIcon({ label, className = "h-4 w-4" }: { label: string; className?: string }) {
  const Icon = NAV_ICONS[label] ?? CircleUserRound;
  return <Icon className={`${className} shrink-0`} strokeWidth={1.7} aria-hidden="true" />;
}

export function AdminSidebar({ isCollapsed, isMobileOpen, onToggle, onMobileClose }: { isCollapsed: boolean; isMobileOpen: boolean; onToggle: () => void; onMobileClose: () => void }) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    Operations: false,
    Management: false,
  });

  return (
    <aside className={`fixed inset-y-0 left-0 z-50 h-screen shrink-0 overflow-hidden border-r border-[var(--app-border)] bg-[var(--app-surface-soft)] text-[var(--color-ink)] shadow-[var(--app-shadow)] transition-[width,transform] duration-300 md:relative md:z-50 md:translate-x-0 ${isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"} ${isCollapsed ? "w-16" : "w-[250px]"}`}>
      <div className="flex h-full flex-col">
        <div className="flex h-[72px] shrink-0 items-center justify-between border-b border-[var(--app-border)] px-3">
          {!isCollapsed && (
            <div className="flex items-center gap-2">
              <div>
                <div className="font-display text-lg leading-none text-[var(--color-ink)]">Lyn</div>
                <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--app-ink-muted)]">Admin</div>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={onToggle}
            aria-label={isCollapsed ? "Expand menu" : "Collapse menu"}
            title={isCollapsed ? "Expand menu" : "Collapse menu"}
            className="dashboard-icon-control ml-auto flex h-8 w-8 items-center justify-center text-[var(--app-ink-muted)] hover:text-[var(--color-ink)]"
          >
            <Menu size={16} aria-hidden="true" />
          </button>
        </div>

        {isCollapsed ? (
          <nav className="flex flex-1 flex-col items-center gap-2.5 px-2 py-4" aria-label="Primary admin navigation">
            <NavLink to="/lyn-co/admin" end title="Overview" onClick={onMobileClose} className={({ isActive }) => `dashboard-icon-control flex h-9 w-9 items-center justify-center transition-colors duration-200 ${isActive ? "text-[var(--color-ink)]" : "text-[var(--app-ink-muted)] hover:text-[var(--color-ink)]"}`}>
              <NavIcon label="Overview" className="h-4 w-4" />
            </NavLink>
            {MENU_GROUPS.map((group) => (
              <button key={group.label} type="button" onClick={() => {
                setOpenGroups((previous) => ({ ...previous, [group.label]: !previous[group.label] }));
                onToggle();
              }} aria-label={group.label} title={group.label} className="dashboard-icon-control flex h-9 w-9 items-center justify-center text-[var(--app-ink-muted)] transition-colors duration-200 hover:text-[var(--color-ink)]">
                <NavIcon label={group.label} className="h-4 w-4" />
              </button>
            ))}
            <div className="mt-auto w-full border-t border-[var(--app-border)] p-2">
              <NavLink to="/lyn-co/admin/module/settings-branding" title="Settings & Branding" onClick={onMobileClose} className={({ isActive }) => `dashboard-icon-control mb-2 flex h-9 w-9 items-center justify-center transition-colors duration-200 ${isActive ? "text-[var(--color-ink)]" : "text-[var(--app-ink-muted)] hover:text-[var(--color-ink)]"}`}>
                <NavIcon label="Settings & Branding" className="h-4 w-4" />
              </NavLink>
            </div>
          </nav>
        ) : (
          <div className="flex flex-1 flex-col overflow-y-auto px-4 py-5">
            <NavLink to="/lyn-co/admin" end onClick={onMobileClose} className={({ isActive }) => `dashboard-icon-control flex min-h-11 items-center gap-3 px-3 text-sm font-medium transition-colors duration-200 ${isActive ? "text-[var(--color-ink)]" : "text-[var(--app-ink-muted)] hover:text-[var(--color-ink)]"}`}>
              <NavIcon label="Overview" className="h-4 w-4" />
              <span>Overview</span>
            </NavLink>

            <div className="mt-4 space-y-3">
              {MENU_GROUPS.map((group) => {
                const isOpen = openGroups[group.label] ?? false;
                return (
                  <div key={group.label} className="py-0.5">
                    <button
                      type="button"
                      onClick={() => setOpenGroups((previous) => ({ ...previous, [group.label]: !isOpen }))}
                      className="dashboard-icon-control flex min-h-11 w-full items-center justify-between gap-3 px-3 text-left text-sm font-medium text-[var(--app-ink-muted)] transition-colors hover:text-[var(--color-ink)]"
                    >
                      <span className="flex items-center gap-2.5">
                        <NavIcon label={group.label} className="h-4 w-4 text-[var(--app-accent)]" />
                        <span className="text-[10px] font-bold uppercase text-[var(--app-ink-muted)]">{group.label}</span>
                      </span>
                      <ChevronRight size={16} className={`transition-transform duration-200 ${isOpen ? "rotate-90" : "rotate-0"}`} aria-hidden="true" />
                    </button>

                    <div className={`grid transition-[grid-template-rows,opacity] duration-200 ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                      <div className="overflow-hidden">
                        <div className="space-y-1 px-1 pb-2 pt-1">
                          {group.items.map(([label, path]) => (
                            <NavLink
                              key={path}
                              to={path}
                              title={label}
                              onClick={onMobileClose}
                              className={({ isActive }) => `dashboard-icon-control flex min-h-10 items-center gap-3 px-3 text-xs font-medium transition-colors duration-200 ${isActive ? "text-[var(--color-ink)]" : "text-[var(--app-ink-muted)] hover:text-[var(--color-ink)]"}`}
                            >
                              <NavIcon label={label} className="h-4 w-4" />
                              <span className="min-w-0 truncate">{label}</span>
                            </NavLink>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-auto border-t border-[var(--app-border)] pt-3">
              <NavLink to="/lyn-co/admin/module/settings-branding" onClick={onMobileClose} className={({ isActive }) => `dashboard-icon-control flex w-full items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? "text-[var(--color-ink)]" : "text-[var(--app-ink-muted)] hover:text-[var(--color-ink)]"}`}>
                <NavIcon label="Settings & Branding" className="h-4 w-4" />
                <span>Settings &amp; Branding</span>
              </NavLink>
            </div>
          </div>
        )}
      </div>

    </aside>
  );
}
