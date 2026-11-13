import { useState } from "react";
import { ChevronDown, CircleUserRound, LogOut, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { LogoutConfirmationDialog } from "@/shared/components/LogoutConfirmationDialog";

interface PortalAccountMenuProps {
  fullName: string;
  identifier: string;
  roleLabel: string;
  isActive: boolean;
  accountHref: string;
  accountLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  onSignOut: () => Promise<void>;
}

export function PortalAccountMenu({
  fullName,
  identifier,
  roleLabel,
  isActive,
  accountHref,
  accountLabel = "Account Management",
  secondaryHref,
  secondaryLabel,
  onSignOut,
}: PortalAccountMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showLogoutConfirmation, setShowLogoutConfirmation] = useState(false);
  const initials = fullName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  async function handleSignOut() {
    await onSignOut();
    setIsOpen(false);
    setShowLogoutConfirmation(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Open account menu"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="dashboard-icon-control flex min-h-11 items-center gap-2 rounded-xl px-2 text-left transition-colors hover:bg-[var(--app-surface-soft)]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--app-accent)] text-xs font-bold text-white">
          {initials || <CircleUserRound size={20} aria-hidden="true" />}
        </span>
        <span className="hidden min-w-0 sm:block">
          <span className="block max-w-36 truncate text-sm font-semibold text-[var(--color-ink)]">{fullName}</span>
          <span className="block max-w-36 truncate text-xs text-[var(--app-ink-muted)]">{identifier}</span>
        </span>
        <ChevronDown size={15} className="text-[var(--app-ink-muted)]" aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label="Account options"
          className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--color-ink)] shadow-xl"
        >
          <div className="flex items-center gap-3 bg-[var(--app-surface-soft)] px-4 py-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--app-accent)] text-sm font-bold text-white">
              {initials || <CircleUserRound size={22} aria-hidden="true" />}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{fullName}</span>
              <span className="block truncate text-xs text-[var(--app-ink-muted)]">{identifier}</span>
              <span className="mt-1 flex items-center gap-1 text-[10px] font-medium text-[var(--app-ink-muted)]">
                <ShieldCheck size={12} aria-hidden="true" />
                {roleLabel}
                <StatusBadge status={isActive ? "active" : "inactive"} className="px-1.5 py-0 text-[9px] leading-4">
                  {isActive ? "Active" : "Inactive"}
                </StatusBadge>
              </span>
            </span>
          </div>
          <div className="p-1.5">
            <Link
              to={accountHref}
              role="menuitem"
              onClick={() => setIsOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-colors hover:bg-[var(--app-surface-soft)]"
            >
              {accountLabel}
            </Link>
            {secondaryHref && secondaryLabel && (
              <Link
                to={secondaryHref}
                role="menuitem"
                onClick={() => setIsOpen(false)}
                className="block rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-colors hover:bg-[var(--app-surface-soft)]"
              >
                {secondaryLabel}
              </Link>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => setShowLogoutConfirmation(true)}
              className="ui-action-danger flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              <LogOut size={15} aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      )}
      {showLogoutConfirmation && (
        <LogoutConfirmationDialog
          onCancel={() => setShowLogoutConfirmation(false)}
          onConfirm={handleSignOut}
        />
      )}
    </div>
  );
}
