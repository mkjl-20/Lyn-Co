import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "@/shared/lib/apiClient";
import { useAuth } from "@/shared/context/useAuth";
import { supabaseClient } from "@/shared/lib/supabaseClient";
import { PasswordVisibilityButton } from "@/shared/components/PasswordVisibilityButton";
import { useFeedback } from "@/shared/components/FeedbackContext";

export default function StaffChangePasswordPage() {
  const { logout, currentUser } = useAuth();
  const { confirm } = useFeedback();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    if (!await confirm({
      title: "Confirm password change",
      message: "Your current password will be replaced. Continue?",
      confirmLabel: "Change password",
      cancelLabel: "Keep current password",
      destructive: true,
    })) return;

    setSaving(true);
    try {
      const { data: sessionData } = await supabaseClient.auth.getSession();
      await apiRequest("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
        headers: {
          Authorization: `Bearer ${sessionData.session?.access_token ?? ""}`,
        },
      });
      await logout();
      navigate("/lyn-co/login", { replace: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to change password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pastel-pink-gradient-page flex h-full min-h-0 items-center justify-center overflow-y-auto p-4">
      <main className="w-full max-w-md rounded-2xl border border-mist bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-sage-deep">First sign-in</p>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink">Change your password</h1>
        <p className="mt-2 text-sm text-ink/60">{currentUser?.fullName}, set a private password before continuing to the staff portal.</p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && <p role="alert" className="text-sm text-clay">{error}</p>}
          <div className="relative">
            <input required type={showCurrentPassword ? "text" : "password"} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Temporary password" className="w-full rounded-lg border border-mist px-3 py-3 pr-12 text-sm outline-none focus:border-sage" />
            <PasswordVisibilityButton visible={showCurrentPassword} onToggle={() => setShowCurrentPassword((visible) => !visible)} />
          </div>
          <div className="relative">
            <input required minLength={8} type={showNewPassword ? "text" : "password"} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="New password" className="w-full rounded-lg border border-mist px-3 py-3 pr-12 text-sm outline-none focus:border-sage" />
            <PasswordVisibilityButton visible={showNewPassword} onToggle={() => setShowNewPassword((visible) => !visible)} />
          </div>
          <div className="relative">
            <input required minLength={8} type={showConfirmPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm new password" className="w-full rounded-lg border border-mist px-3 py-3 pr-12 text-sm outline-none focus:border-sage" />
            <PasswordVisibilityButton visible={showConfirmPassword} onToggle={() => setShowConfirmPassword((visible) => !visible)} />
          </div>
          <button disabled={saving} type="submit" className="dashboard-primary-action w-full rounded-lg py-3 text-sm font-semibold disabled:opacity-50">{saving ? "Saving..." : "Set password"}</button>
        </form>
      </main>
    </div>
  );
}
