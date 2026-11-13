import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { KeyRound, Save, ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "@/shared/context/AuthContext";
import { StatusBadge } from "./StatusBadge";

export function AccountProfilePage({
  portalLabel,
  passwordPath,
}: {
  portalLabel: string;
  passwordPath: string;
}) {
  const { currentUser, updateCurrentProfile } = useAuth();
  const [fullName, setFullName] = useState(currentUser?.fullName ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!currentUser) return null;

  const initials = currentUser.fullName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const roleLabel = currentUser.accountRole === "admin"
    ? "Administrator"
    : currentUser.staffRole
      ? currentUser.staffRole.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
      : "Staff";
  const hasNameChanged = fullName.trim() !== currentUser.fullName;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setErrorMessage("Enter your full name.");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await updateCurrentProfile(trimmedName);
      setFullName(trimmedName);
      setSuccessMessage("Profile updated.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update your profile.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="pastel-pink-gradient-page flex h-full min-h-0 items-center justify-center overflow-hidden px-3 py-3 text-ink sm:px-5 sm:py-4">
      <div className="mx-auto grid max-h-full w-full max-w-5xl items-center gap-3 overflow-y-auto lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-4">
        <section className="overflow-hidden rounded-2xl border border-mist bg-white shadow-sm">
          <div className="h-20 bg-gradient-to-r from-sage-light via-porcelain to-sage-light" aria-hidden="true" />
          <div className="px-5 pb-5">
            <div className="-mt-9 flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-2xl border-4 border-white bg-sage-deep font-display text-xl font-semibold text-white shadow-sm">
              {initials || <UserRound aria-hidden="true" />}
            </div>
            <h1 className="mt-3 break-words font-display text-xl font-semibold text-ink">{currentUser.fullName}</h1>
            <p className="mt-1 break-all text-sm text-ink/55">@{currentUser.username}</p>
            <span className="mt-3 inline-flex rounded-full bg-sage-light px-3 py-1 text-xs font-semibold text-sage-deep">
              {roleLabel}
            </span>
            <dl className="mt-5 space-y-3 border-t border-mist pt-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink/55">Account status</dt>
                <dd>
                  <StatusBadge status={currentUser.isActive ? "active" : "inactive"}>
                  {currentUser.isActive ? "Active" : "Inactive"}
                  </StatusBadge>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink/55">Portal</dt>
                <dd className="font-medium text-ink">{portalLabel}</dd>
              </div>
            </dl>
          </div>
        </section>

        <div className="space-y-5">
          <section className="rounded-2xl border border-mist bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sage-light text-sage-deep">
                <UserRound size={19} aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-ink">Profile information</h2>
                <p className="mt-1 text-sm text-ink/55">Update the name shown to your team.</p>
              </div>
            </div>
            <form onSubmit={(event) => void handleSubmit(event)} className="mt-5 space-y-4">
              {errorMessage && <p role="alert" className="rounded-lg bg-clay-light px-3 py-2 text-sm text-clay">{errorMessage}</p>}
              {successMessage && <p role="status" className="rounded-lg bg-success-soft px-3 py-2 text-sm text-success">{successMessage}</p>}
              <label className="block text-xs font-semibold text-ink/70">
                Full name
                <input
                  required
                  maxLength={100}
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className="dashboard-filter-control mt-1.5 w-full text-sm"
                />
              </label>
              <label className="block text-xs font-semibold text-ink/70">
                Username
                <input
                  value={currentUser.username}
                  readOnly
                  className="dashboard-filter-control mt-1.5 w-full bg-porcelain text-sm text-ink/60"
                />
              </label>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSaving || !hasNameChanged}
                  className="dashboard-primary-action inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Save size={15} aria-hidden="true" />
                  {isSaving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </section>

          <section className="flex flex-col gap-4 rounded-2xl border border-mist bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sage-light text-sage-deep">
                <ShieldCheck size={19} aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-ink">Security</h2>
                <p className="mt-1 text-sm text-ink/55">Change your password to keep your account secure.</p>
              </div>
            </div>
            <Link to={passwordPath} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-mist px-4 text-sm font-semibold text-sage-deep transition hover:bg-sage-light">
              <KeyRound size={15} aria-hidden="true" />
              Change password
            </Link>
          </section>
        </div>
      </div>
    </main>
  );
}
