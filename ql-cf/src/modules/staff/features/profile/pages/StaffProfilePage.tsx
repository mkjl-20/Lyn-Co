import { AccountProfilePage } from "@/shared/components/AccountProfilePage";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { IconActionButton } from "@/shared/components/IconActionButton";
import { useAuth } from "@/shared/context/useAuth";
import { LogoutConfirmationDialog } from "@/shared/components/LogoutConfirmationDialog";
import { StaffServiceHistory } from "@/modules/staff/features/history/components/StaffServiceHistory";

export default function StaffProfilePage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [showLogoutConfirmation, setShowLogoutConfirmation] = useState(false);

  async function handleLogout() {
    await logout();
    navigate("/lyn-co/login");
  }

  return (
    <div className="account-profile-shell pastel-pink-gradient-page flex h-dvh flex-col overflow-hidden text-ink">
      <header className="shrink-0 border-b border-[var(--app-border)] bg-white/75 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-end px-4 sm:px-6">
          <IconActionButton
            onClick={() => setShowLogoutConfirmation(true)}
            icon={LogOut}
            label="Sign out"
          />
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <AccountProfilePage
          portalLabel="LynQ Staff"
          passwordPath="/lyn-co/staff/change-password"
          backPath="/lyn-co/staff"
        />
        <section aria-labelledby="staff-service-history-title" className="mx-auto w-full max-w-[430px] px-3 pb-6 sm:px-5">
          <h1 id="staff-service-history-title" className="mb-3 font-display text-xl font-semibold text-ink">My service history</h1>
          <StaffServiceHistory />
        </section>
      </div>
      {showLogoutConfirmation && (
        <LogoutConfirmationDialog
          onCancel={() => setShowLogoutConfirmation(false)}
          onConfirm={handleLogout}
        />
      )}
    </div>
  );
}
