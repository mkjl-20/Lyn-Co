import { AccountProfilePage } from "@/shared/components/AccountProfilePage";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { BackButton } from "@/shared/components/BackButton";
import { IconActionButton } from "@/shared/components/IconActionButton";
import { useAuth } from "@/shared/context/AuthContext";

export default function StaffProfilePage() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="pastel-pink-gradient-page min-h-screen text-ink">
      <header className="border-b border-[var(--app-border)] bg-white/75 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-6">
          <BackButton to="/lyn-co/staff" label="Back to staff dashboard" />
          <IconActionButton
            onClick={() => {
              void logout();
              navigate("/lyn-co/login");
            }}
            icon={LogOut}
            label="Log out"
          />
        </div>
      </header>
      <AccountProfilePage portalLabel="LynQ Staff" passwordPath="/lyn-co/staff/change-password" />
    </div>
  );
}
