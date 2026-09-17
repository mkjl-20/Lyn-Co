import { useState, type FormEvent } from "react";
import { createStaffAccount } from "../services/adminService";
type StaffRole = "receptionist" | "hairstylist" | "manicurist" | "pedicurist";

export function RegisterStaffDialog({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [staffRole, setStaffRole] = useState<StaffRole>("receptionist");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await createStaffAccount({ username, fullName, staffRole, temporaryPassword });
      onSuccess();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create account.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        placeholder="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        className="w-full rounded-md border px-3 py-2"
        required
      />
      <input
        placeholder="Full name"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        className="w-full rounded-md border px-3 py-2"
        required
      />
      <select
        value={staffRole}
        onChange={(e) => setStaffRole(e.target.value as StaffRole)}
        className="w-full rounded-md border px-3 py-2"
      >
        <option value="receptionist">Receptionist</option>
        <option value="hairstylist">Hairstylist</option>
        <option value="manicurist">Manicurist</option>
        <option value="pedicurist">Pedicurist</option>
      </select>
      <div className="relative">
        <input
          type={showPassword ? "text" : "password"}
          placeholder="Temporary password"
          value={temporaryPassword}
          onChange={(e) => setTemporaryPassword(e.target.value)}
          className="w-full rounded-md border px-3 py-2 pr-11"
          required
        />
        <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-ink/40 hover:bg-sage-light hover:text-sage-deep focus:outline-none focus:ring-2 focus:ring-sage-light">
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6Z" /><circle cx="12" cy="12" r="3" />{showPassword && <path d="M3 3l18 18" strokeLinecap="round" />}</svg>
        </button>
      </div>
      {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
      <button type="submit" disabled={isSubmitting} className="w-full rounded-md bg-gray-900 py-2 text-white">
        {isSubmitting ? "Creating…" : "Create staff account"}
      </button>
    </form>
  );
}