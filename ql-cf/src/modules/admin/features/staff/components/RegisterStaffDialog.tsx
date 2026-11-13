import { useState, type FormEvent } from "react";
import { createStaffAccount } from "../services/adminService";
import { PasswordVisibilityButton } from "../../../../../shared/components/PasswordVisibilityButton";

interface StaffRoleOption {
  role_key: string;
  label: string;
}

const STAFF_ROLES: StaffRoleOption[] = [
  { role_key: "hairstylist", label: "Hairstylist" },
  { role_key: "manicurist", label: "Manicurist" },
  { role_key: "pedicurist", label: "Pedicurist" },
  { role_key: "receptionist", label: "Receptionist" },
];

export function RegisterStaffDialog({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [staffRole, setStaffRole] = useState(STAFF_ROLES[0].role_key);
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
        onChange={(e) => setStaffRole(e.target.value)}
        className="dashboard-filter-control w-full"
        required
      >
        {STAFF_ROLES.map((role) => <option key={role.role_key} value={role.role_key}>{role.label}</option>)}
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
        <PasswordVisibilityButton
          visible={showPassword}
          onToggle={() => setShowPassword((visible) => !visible)}
        />
      </div>
      {errorMessage && <p role="alert" className="text-sm text-clay">{errorMessage}</p>}
      <button type="submit" disabled={isSubmitting} className="dashboard-primary-action w-full rounded-lg py-2 font-semibold disabled:opacity-50">
        {isSubmitting ? "Creating…" : "Create staff account"}
      </button>
    </form>
  );
}