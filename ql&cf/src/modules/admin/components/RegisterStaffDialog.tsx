import { useState, type FormEvent } from "react";
import { createStaffAccount } from "../services/adminService";
type StaffRole = "receptionist" | "hairstylist" | "manicurist" | "pedicurist";

export function RegisterStaffDialog({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [staffRole, setStaffRole] = useState<StaffRole>("receptionist");
  const [temporaryPassword, setTemporaryPassword] = useState("");
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
      <input
        type="password"
        placeholder="Temporary password"
        value={temporaryPassword}
        onChange={(e) => setTemporaryPassword(e.target.value)}
        className="w-full rounded-md border px-3 py-2"
        required
      />
      {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
      <button type="submit" disabled={isSubmitting} className="w-full rounded-md bg-gray-900 py-2 text-white">
        {isSubmitting ? "Creating…" : "Create staff account"}
      </button>
    </form>
  );
}