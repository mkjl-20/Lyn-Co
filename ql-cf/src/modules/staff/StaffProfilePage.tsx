import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/shared/context/AuthContext";

export default function StaffProfilePage() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  if (!currentUser) {
    return null;
  }

  const staffRoleLabel = currentUser.staffRole
    ? currentUser.staffRole.charAt(0).toUpperCase() + currentUser.staffRole.slice(1)
    : "Staff";

  return (
    <div className="min-h-screen bg-mist text-ink">
      <header className="border-b border-mist bg-white">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link to="/staff" className="text-xs font-medium text-sage-deep hover:underline">
              ← Dashboard
            </Link>
            <h1 className="font-display text-base font-semibold">My Profile</h1>
          </div>
          <button
            type="button"
            onClick={() => {
              logout();
              navigate("/login");
            }}
            className="rounded-lg border border-mist px-3 py-2 text-xs font-medium"
          >
            Log out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-8 sm:px-6">
        <div className="rounded-2xl border border-mist bg-white p-6 shadow-sm">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-sage-light text-xl font-bold text-sage-deep">
            {currentUser.fullName
              .split(/\s+/)
              .map((p) => p[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </div>

          <h2 className="mt-4 font-display text-xl font-semibold">{currentUser.fullName}</h2>
          <p className="text-sm text-ink/50">@{currentUser.username}</p>

          <dl className="mt-6 space-y-4">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-ink/40">Role</dt>
              <dd className="mt-1 text-sm font-medium">{staffRoleLabel}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-ink/40">Account status</dt>
              <dd className="mt-1 text-sm font-medium">{currentUser.isActive ? "Active" : "Inactive"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-ink/40">Portal</dt>
              <dd className="mt-1 text-sm font-medium">LynQ Staff</dd>
            </div>
          </dl>
        </div>
      </main>
    </div>
  );
}
