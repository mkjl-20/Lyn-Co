import {
  Navigate,
  Outlet,
  useLocation,
} from "react-router-dom";

import { useAuth } from "../context/AuthContext";

interface ProtectedRouteProps {
  allowedRoles: (
    | "admin"
    | "staff"
  )[];
}

export function ProtectedRoute({
  allowedRoles,
}: ProtectedRouteProps) {
  const {
    user,
    role,
    currentUser,
    loading,
  } = useAuth();

  const location =
    useLocation();

  // ==========================================
  // WAIT FOR AUTH TO INITIALIZE
  // ==========================================

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-porcelain">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-mist border-t-sage" />

          <p className="text-sm text-gray-500">
            Checking authorization...
          </p>
        </div>
      </div>
    );
  }

  // ==========================================
  // NOT LOGGED IN
  // ==========================================

  if (!user) {
    return (
      <Navigate
        to="/lyn-co/login"
        replace
        state={{
          from: location,
        }}
      />
    );
  }

  // ==========================================
  // PROFILE / ROLE NOT FOUND
  // ==========================================

  if (!role) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-porcelain p-6">
        <div className="w-full max-w-md rounded-2xl border border-mist bg-white p-8 text-center shadow-sm">

          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-clay-light text-clay">
            !
          </div>

          <h1 className="font-display text-2xl font-semibold text-ink">
            Account Not Configured
          </h1>

          <p className="mt-2 text-sm leading-relaxed text-gray-500">
            Your account is authenticated, but
            no system role was found for your
            profile.
          </p>

          <button
            type="button"
            onClick={() =>
              window.location.reload()
            }
            className="mt-6 rounded-lg bg-sage px-5 py-2.5 text-sm font-semibold text-white hover:bg-sage-deep"
          >
            Try Again
          </button>

        </div>
      </div>
    );
  }

  // ==========================================
  // ROLE CHECK
  // ==========================================

  if (!allowedRoles.includes(role)) {
    console.error(
      "Authorization failed:",
      {
        userId: user.id,
        role,
        allowedRoles,
      }
    );

    return (
      <Navigate
        to="/unauthorized"
        replace
      />
    );
  }

  const passwordChangePath = role === "admin" ? "/lyn-co/admin/change-password" : "/lyn-co/staff/change-password";
  if (currentUser?.mustChangePassword && location.pathname !== passwordChangePath) {
    return <Navigate to={passwordChangePath} replace />;
  }

  // ==========================================
  // AUTHORIZED
  // ==========================================

  return <Outlet />;
}