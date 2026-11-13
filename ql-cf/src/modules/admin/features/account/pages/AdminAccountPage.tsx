import { AccountProfilePage } from "@/shared/components/AccountProfilePage";

export function AdminAccountPage() {
  return (
    <AccountProfilePage
      portalLabel="LynQ Admin"
      passwordPath="/lyn-co/admin/change-password"
      backPath="/lyn-co/admin"
      settingsPath="/lyn-co/admin/module/settings-branding"
    />
  );
}
