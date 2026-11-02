import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Bell, ChevronDown, CircleUserRound, LogOut, Menu, ShieldCheck } from "lucide-react";
import { createPortal } from "react-dom";
import { AdminSidebar } from "./AdminSidebar";
import { useAuth } from "@/shared/context/AuthContext";
import { SystemIcon } from "@/shared/components/SystemIcon";
import { StatusBadge } from "@/shared/components/StatusBadge";

export function AdminLayout() {
  const { logout, currentUser, user } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [showLogoutConfirmation, setShowLogoutConfirmation] = useState(false);
  const initials = currentUser?.fullName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || currentUser?.username.slice(0, 2).toUpperCase() || "A";
  const usernameLabel = `@${(currentUser?.username ?? user?.email ?? "admin").replace(/^@/, "")}`;
  const accountRole = currentUser?.accountRole === "admin"
    ? "Administrator"
    : currentUser?.staffRole
      ? currentUser.staffRole.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
      : "Staff";

  return (
    <div data-admin-theme="light" className="admin-shell pastel-pink-gradient-page flex h-screen overflow-hidden">
      {isMobileOpen && <button type="button" aria-label="Close admin navigation" onClick={() => setIsMobileOpen(false)} className="fixed inset-0 z-40 bg-ink/30 md:hidden" />}
      <AdminSidebar
        isCollapsed={isCollapsed}
        isMobileOpen={isMobileOpen}
        onToggle={() => setIsCollapsed((value) => !value)}
        onMobileClose={() => setIsMobileOpen(false)}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-transparent">
        <header className="admin-topbar relative z-30 flex h-[72px] shrink-0 items-center gap-3 border-b px-4 sm:px-6">
          <button type="button" aria-label="Open admin navigation" onClick={() => setIsMobileOpen(true)} className="admin-topbar-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-xl md:hidden">
            <Menu size={18} aria-hidden="true" />
          </button>
          <div className="flex-1" />
          <div className="flex shrink-0 items-center gap-3 sm:gap-4">
            <div className="relative shrink-0">
              <button
                type="button"
                aria-label="Notifications"
                aria-haspopup="dialog"
                aria-expanded={isNotificationsOpen}
                onClick={() => {
                  setIsNotificationsOpen((open) => !open);
                  setIsAccountMenuOpen(false);
                }}
                className={`admin-topbar-icon flex h-10 w-10 items-center justify-center rounded-xl border transition-colors ${isNotificationsOpen ? "is-open" : ""}`}
              >
                <Bell size={17} aria-hidden="true" />
              </button>
              {isNotificationsOpen && (
                <div role="dialog" aria-label="Notifications" className="absolute right-0 top-12 z-50 w-72 rounded-xl border border-[var(--app-border)] bg-white p-4 text-ink shadow-xl">
                  <h2 className="text-sm font-semibold">Notifications</h2>
                  <p className="mt-2 text-xs leading-5 text-ink/60">You’re all caught up. New queue and system alerts will appear here.</p>
                </div>
              )}
            </div>
            <div className="relative shrink-0">
              <button
                type="button"
                title="Account"
                aria-label="Open account menu"
                aria-haspopup="menu"
                aria-expanded={isAccountMenuOpen}
                onClick={() => {
                  setIsAccountMenuOpen((open) => !open);
                  setIsNotificationsOpen(false);
                }}
                className="admin-topbar-account flex items-center gap-2.5 rounded-lg text-left sm:gap-3"
              >
                <span className="admin-topbar-avatar flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold" aria-hidden="true">
                  {initials}
                </span>
                <span className="admin-account-copy min-w-0">
                  <span className="admin-topbar-name block max-w-36 truncate text-[13px] font-semibold leading-5">{currentUser?.fullName ?? "Admin"}</span>
                  <span className="admin-topbar-muted block max-w-24 truncate text-xs leading-4 sm:max-w-36">{usernameLabel}</span>
                </span>
                <ChevronDown size={15} className="admin-topbar-muted" aria-hidden="true" />
              </button>
              {isAccountMenuOpen && (
                <div role="menu" className="absolute right-0 top-11 z-50 w-64 overflow-hidden rounded-xl border border-[var(--app-border)] bg-white shadow-xl">
                  <div className="flex items-center gap-3 bg-sage-light/60 px-4 py-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sage-deep text-sm font-bold text-white">
                      {initials || <CircleUserRound size={20} aria-hidden="true" />}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{currentUser?.fullName ?? "Account"}</p>
                      <p className="truncate text-xs text-ink/55">{usernameLabel}</p>
                      <p className="mt-1 flex items-center gap-1 text-[10px] font-medium text-ink/60">
                        <ShieldCheck size={12} aria-hidden="true" />
                        {accountRole}
                        {currentUser && (
                          <StatusBadge status={currentUser.isActive ? "active" : "inactive"} className="px-1.5 py-0 text-[9px] leading-4">
                            {currentUser.isActive ? "Active" : "Inactive"}
                          </StatusBadge>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="p-1.5">
                    <NavLink
                      to="/lyn-co/admin/account"
                      role="menuitem"
                      onClick={() => setIsAccountMenuOpen(false)}
                      className="block rounded-lg px-3 py-2.5 text-left text-xs font-medium text-ink hover:bg-sage-light"
                    >
                      Account Management
                    </NavLink>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setIsAccountMenuOpen(false);
                        setShowLogoutConfirmation(true);
                      }}
                      className="ui-action-danger flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-medium"
                    >
                      <SystemIcon icon={LogOut} />
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </div>
      {showLogoutConfirmation && createPortal(
        <div className="fixed inset-0 z-[100] flex min-h-screen items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-xs rounded-[10px] bg-white p-5 text-center shadow-2xl">
            <h2 className="text-base font-semibold text-ink">Are you sure you want to log out?</h2>
            <p className="mt-2 text-sm text-ink/60">You’ll need to sign in again to access the admin system.</p>
            <div className="mt-5 flex flex-col gap-2">
              <button type="button" onClick={() => void logout()} className="w-full rounded-[8px] bg-sage-deep px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-clay">Yes, log out</button>
              <button type="button" onClick={() => setShowLogoutConfirmation(false)} className="w-full rounded-[8px] px-4 py-2.5 text-sm text-ink/70 transition-colors hover:bg-sage-light hover:text-sage-deep">Cancel</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
