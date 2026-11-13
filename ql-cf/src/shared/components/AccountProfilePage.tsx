import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Camera, KeyRound, Pencil, Save, UserRound } from "lucide-react";
import { useAuth } from "@/shared/context/useAuth";
import { StatusBadge } from "./StatusBadge";
import { BackButton } from "./BackButton";
import { ProfileEditDialog } from "./ProfileEditDialog";
import { useFeedback } from "./FeedbackContext";

export function AccountProfilePage({
  portalLabel,
  passwordPath,
  backPath,
  settingsPath,
}: {
  portalLabel: string;
  passwordPath: string;
  backPath?: string;
  settingsPath?: string;
}) {
  const { currentUser, updateCurrentProfile } = useAuth();
  const { confirm } = useFeedback();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState(currentUser?.fullName ?? "");
  const [contactEmail, setContactEmail] = useState(currentUser?.contactEmail ?? "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState(currentUser?.avatarUrl ?? "");
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
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
  const hasChanges = hasNameChanged
    || contactEmail.trim().toLowerCase() !== currentUser.contactEmail
    || avatarFile !== null
    || removeAvatar;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setErrorMessage("Enter your full name.");
      return;
    }
    if (!await confirm({
      title: "Save profile changes?",
      message: "Your name, contact email, and profile photo will be updated.",
      confirmLabel: "Save changes",
      cancelLabel: "Review changes",
    })) return;

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await updateCurrentProfile({ fullName: trimmedName, contactEmail, avatarFile, removeAvatar });
      setFullName(trimmedName);
      setContactEmail(contactEmail.trim().toLowerCase());
      setAvatarFile(null);
      setRemoveAvatar(false);
      setSuccessMessage("Profile updated.");
      setIsEditing(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update your profile.");
    } finally {
      setIsSaving(false);
    }
  }

  function chooseAvatar(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setErrorMessage("Choose a JPG, PNG, or WebP profile photo.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setErrorMessage("Profile photos must be 2 MB or smaller.");
      return;
    }
    setErrorMessage(null);
    setAvatarFile(file);
    setRemoveAvatar(false);
    setAvatarPreview(URL.createObjectURL(file));
  }

  return (
    <>
    <main className="account-profile-content pastel-pink-gradient-page flex min-h-full items-start justify-center px-2 py-2 text-ink sm:px-4 sm:py-3">
      <div className="mx-auto flex w-full max-w-[390px] flex-col items-start">
        <section aria-labelledby="account-profile-name" className="w-full overflow-hidden rounded-2xl border border-mist bg-white shadow-[0_18px_50px_rgba(30,35,30,0.1)]">
          <div className="relative h-20 bg-gradient-to-r from-sage-light via-porcelain to-sage-light sm:h-24">
            {backPath && <BackButton to={backPath} label="Back to dashboard" className="absolute left-3 top-1.5 z-10 text-ink hover:text-sage-deep sm:left-4 sm:top-2" />}
            <span className="absolute bottom-0 left-3 z-10 flex h-14 w-14 translate-y-1/2 items-center justify-center overflow-hidden rounded-2xl border-2 border-white bg-sage-deep font-display text-xl font-semibold text-white shadow-sm sm:left-5 sm:h-16 sm:w-16">
              {currentUser.avatarUrl
                ? <img src={currentUser.avatarUrl} alt="" className="h-full w-full object-cover" />
                : initials || <UserRound aria-hidden="true" />}
            </span>
          </div>
          <div className="px-3 pb-3 pt-7 sm:px-4 sm:pb-4 sm:pt-8">
            <div className="flex items-center justify-between gap-2">
              <h1 id="account-profile-name" className="min-w-0 break-words font-display text-xl font-semibold leading-tight text-ink sm:text-2xl">{currentUser.fullName}</h1>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  aria-label="Edit profile information"
                  title="Edit profile information"
                  onClick={() => {
                    setFullName(currentUser.fullName);
                    setContactEmail(currentUser.contactEmail);
                    setAvatarFile(null);
                    setAvatarPreview(currentUser.avatarUrl);
                    setRemoveAvatar(false);
                    setErrorMessage(null);
                    setSuccessMessage(null);
                    setIsEditing(true);
                  }}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-mist text-ink/65 transition hover:bg-sage-light hover:text-sage-deep"
                >
                  <Pencil size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => navigate(passwordPath)}
                  aria-label="Change password"
                  title="Change password"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-mist text-sage-deep transition hover:bg-sage-light"
                >
                  <KeyRound size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
            <p className="mt-1 break-all text-xs text-ink/55 sm:text-sm">@{currentUser.username}</p>
            {currentUser.contactEmail && <p className="mt-1 break-all text-xs text-ink/55">{currentUser.contactEmail}</p>}
            <span className="mt-2 inline-flex rounded-full bg-sage-light px-3 py-1 text-xs font-semibold text-sage-deep">{roleLabel}</span>
            <dl className="mt-3 grid gap-2 border-t border-mist pt-2.5 text-sm sm:grid-cols-2 sm:pt-3">
              <div className="min-w-0 rounded-lg bg-[var(--app-canvas)] px-3 py-2">
                <dt className="text-[11px] text-ink/60">Name</dt>
                <dd className="mt-0.5 break-words font-medium">{currentUser.fullName}</dd>
              </div>
              <div className="min-w-0 rounded-lg bg-[var(--app-canvas)] px-3 py-2">
                <dt className="text-[11px] text-ink/60">Email</dt>
                <dd className="mt-0.5 break-all font-medium">{currentUser.contactEmail || "Not provided"}</dd>
              </div>
              <div className="min-w-0 rounded-lg bg-[var(--app-canvas)] px-3 py-2">
                <dt className="text-[11px] text-ink/60">Username</dt>
                <dd className="mt-0.5 break-all font-medium">{currentUser.username}</dd>
              </div>
              <div className="min-w-0 rounded-lg bg-[var(--app-canvas)] px-3 py-2">
                <dt className="text-[11px] text-ink/60">Account status</dt>
                <dd className="mt-1">
                  <StatusBadge status={currentUser.isActive ? "active" : "inactive"}>
                    {currentUser.isActive ? "Active" : "Inactive"}
                  </StatusBadge>
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-ink/55">{portalLabel}</p>
            {settingsPath && (
              <Link to={settingsPath} className="mt-3 flex min-h-10 items-center justify-between rounded-lg border border-mist px-3 text-sm font-semibold text-sage-deep transition hover:bg-sage-light">
                <span>System settings</span>
                <span aria-hidden="true">›</span>
              </Link>
            )}
            {successMessage && <p role="status" className="mt-3 rounded-lg bg-success-soft px-3 py-2 text-sm text-success">{successMessage}</p>}
          </div>
        </section>
      </div>
    </main>
    {isEditing && (
      <ProfileEditDialog
        title="Edit profile information"
        description="Add an optional contact email and profile photo."
        onClose={() => setIsEditing(false)}
      >
        <form onSubmit={(event) => void handleSubmit(event)} className="mt-4 max-h-[70dvh] space-y-3 overflow-y-auto">
          {errorMessage && <p role="alert" className="dashboard-error-message">{errorMessage}</p>}
          <div className="flex items-center gap-3">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-sage-light text-sage-deep">
              {avatarPreview ? <img src={avatarPreview} alt="Profile preview" className="h-full w-full object-cover" /> : <UserRound size={24} aria-hidden="true" />}
            </span>
            <div className="min-w-0">
              <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-mist px-3 text-xs font-semibold text-ink/75 hover:bg-porcelain">
                <Camera size={15} aria-hidden="true" />
                Change photo
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => chooseAvatar(event.target.files?.[0])} />
              </label>
              {(avatarPreview || avatarFile) && (
                <button type="button" onClick={() => { setAvatarFile(null); setAvatarPreview(""); setRemoveAvatar(true); }} className="ml-2 text-xs font-semibold text-clay underline">
                  Remove
                </button>
              )}
              <p className="mt-1 text-[11px] text-ink/50">Optional · JPG, PNG, or WebP · up to 2 MB</p>
            </div>
          </div>
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
            Contact email <span className="font-normal text-ink/50">Optional</span>
            <input
              type="email"
              maxLength={254}
              value={contactEmail}
              onChange={(event) => setContactEmail(event.target.value)}
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
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setIsEditing(false)} className="form-cancel-action min-h-10 rounded-lg px-4 text-sm font-semibold">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !hasChanges}
              className="dashboard-primary-action inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Save size={15} aria-hidden="true" />
              {isSaving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </ProfileEditDialog>
    )}
    </>
  );
}
