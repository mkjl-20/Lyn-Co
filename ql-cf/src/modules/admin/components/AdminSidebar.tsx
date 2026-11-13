import { NavLink } from "react-router-dom";
import { useState } from "react";
import {
  ChartLine,
  ChevronRight,
  CircleUserRound,
  CreditCard,
  Database,
  FileText,
  House,
  ListOrdered,
  LogOut,
  Menu,
  Monitor,
  Percent,
  Scissors,
  Settings,
  Star,
  TrendingUp,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/shared/context/useAuth";

const MENU_GROUPS = [
  {
    label: "Operations",
    items: [
      ["Queue Control", "/admin/queue"],
      ["TV Display", "/admin/tv"],
      ["Analytics", "/admin/analytics"],
      ["Forecasting", "/admin/module/forecasting"],
    ],
  },
  {
    label: "Management",
    items: [
      ["Staff Management", "/admin/staff"],
      ["Service Catalog", "/admin/module/service-catalog"],
      ["VIP & Customer Tags", "/admin/module/customer-tagging"],
      ["Promotions", "/admin/module/promotions-events"],
      ["POS & Transactions", "/admin/module/pos-transactions"],
      ["Reports", "/admin/module/reports"],
      ["Audit Logs", "/admin/module/audit-logs"],
      ["Backup & Restore", "/admin/module/backup-restore"],
    ],
  },
  {
    label: "Settings",
    items: [
      ["Settings & Branding", "/admin/module/settings-branding"],
      ["Account Management", "/admin/account"],
    ],
  },
];

const NAV_ICONS: Record<string, LucideIcon> = {
  Overview: House,
  Operations: ListOrdered,
  Management: UsersRound,
  Settings,
  "Queue Control": ListOrdered,
  "TV Display": Monitor,
  Analytics: ChartLine,
  Forecasting: TrendingUp,
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
  const { logout } = useAuth();
  const [showLogoutConfirmation, setShowLogoutConfirmation] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    Operations: false,
    Management: false,
    Settings: false,
  });

  return (
    <aside className={`fixed inset-y-0 left-0 z-50 h-screen shrink-0 overflow-hidden border-r border-[var(--color-sage)] bg-[linear-gradient(180deg,var(--app-accent-soft)_0%,var(--app-accent-soft)_52%,var(--app-accent-soft)_100%)] text-[var(--color-ink)] shadow-[0_16px_42px_rgba(103,58,77,0.12)] transition-[width,transform] duration-300 md:relative md:z-50 md:translate-x-0 ${isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"} ${isCollapsed ? "w-16" : "w-[15.5rem]"}`}>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-3.5">
          {!isCollapsed && (
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white/80 text-[10px] font-bold tracking-[0.22em] text-[var(--app-accent)]">L</div>
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
            <NavLink to="/admin" end title="Overview" onClick={onMobileClose} className={({ isActive }) => `dashboard-icon-control flex h-9 w-9 items-center justify-center transition-colors duration-200 ${isActive ? "text-[var(--color-ink)]" : "text-[var(--app-ink-muted)] hover:text-[var(--color-ink)]"}`}>
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
            <div className="mt-auto w-full border-t border-white/10 p-2">
              <button type="button" onClick={() => setShowLogoutConfirmation(true)} aria-label="Sign out" title="Sign out" className="dashboard-icon-control flex h-9 w-9 items-center justify-center text-[var(--app-ink-muted)] transition-colors duration-200 hover:text-[var(--color-ink)]">
                <LogOut className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
              </button>
            </div>
          </nav>
        ) : (
          <div className="flex flex-1 flex-col overflow-y-auto px-3 py-4">
            <NavLink to="/admin" end onClick={onMobileClose} className={({ isActive }) => `dashboard-icon-control flex min-h-11 items-center gap-3 px-3 text-sm font-medium transition-colors duration-200 ${isActive ? "text-[var(--color-ink)]" : "text-[var(--app-ink-muted)] hover:text-[var(--color-ink)]"}`}>
              <NavIcon label="Overview" className="h-4 w-4" />
              <span>Overview</span>
            </NavLink>

            <div className="mt-5 space-y-2.5">
              {MENU_GROUPS.map((group) => {
                const isOpen = openGroups[group.label] ?? false;
                return (
                  <div key={group.label} className="py-1">
                    <button
                      type="button"
                      onClick={() => setOpenGroups((previous) => ({ ...previous, [group.label]: !isOpen }))}
                      className="dashboard-icon-control flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm font-medium text-[var(--app-ink-muted)] transition-colors hover:text-[var(--color-ink)]"
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
                              className={({ isActive }) => `dashboard-icon-control flex min-h-10 items-center gap-3 px-3 text-sm font-medium transition-colors duration-200 ${isActive ? "text-[var(--color-ink)]" : "text-[var(--app-ink-muted)] hover:text-[var(--color-ink)]"}`}
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

            <div className="mt-auto border-t border-[var(--color-sage)] pt-3">
              <div className="flex justify-center">
                <button type="button" onClick={() => setShowLogoutConfirmation(true)} className="dashboard-icon-control flex w-[88%] items-center justify-center gap-3 px-3 py-2.5 text-sm font-medium text-[var(--app-ink-muted)] transition-colors hover:text-[var(--color-ink)]">
                  <LogOut className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
                  Sign out
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showLogoutConfirmation && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]">
        <div className="w-full max-w-xs rounded-[10px] bg-white p-5 text-center shadow-2xl">
          <h2 className="text-base font-semibold text-ink">Log out?</h2>
          <div className="mt-5 flex flex-col gap-2">
            <button type="button" onClick={logout} className="w-full rounded-[8px] bg-sage-deep px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-clay">Log out</button>
            <button type="button" onClick={() => setShowLogoutConfirmation(false)} className="w-full rounded-[8px] px-4 py-2.5 text-sm text-ink/70 transition-colors hover:bg-sage-light hover:text-sage-deep">Cancel</button>
          </div>
        </div>
      </div>}
    </aside>
  );
}
