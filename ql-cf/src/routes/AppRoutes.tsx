import { Suspense, lazy, useEffect, useState } from "react";
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { ProtectedRoute } from "../shared/routes/ProtectedRoute";

import { StaffPresenceLayout } from "../modules/staff/StaffPresenceLayout";
import { AdminLayout } from "../modules/admin/components/AdminLayout";
import { DeviceHeartbeatReporter, type DeviceHeartbeatStatus } from "../shared/features/deviceMonitoring/DeviceHeartbeatReporter";
import { NotFoundPage } from "../shared/components/NotFoundPage";

const LoginPage = lazy(() => import("../modules/auth/pages/LoginPage").then((module) => ({ default: module.LoginPage })));
const AdminDashboardPage = lazy(() => import("../modules/admin/features/dashboard/pages/AdminDashboardPage").then((module) => ({ default: module.AdminDashboardPage })));
const AdminQueuePage = lazy(() => import("../modules/admin/features/queue/pages/AdminQueuePage").then((module) => ({ default: module.AdminQueuePage })));
const AdminAnalyticsPage = lazy(() => import("../modules/admin/features/analytics/pages/AdminAnalyticsPage").then((module) => ({ default: module.AdminAnalyticsPage })));
const StaffDashboardPage = lazy(() => import("../modules/staff/features/dashboard/pages/StaffDashboardPage"));
const StaffQueuePage = lazy(() => import("../modules/staff/features/queue/pages/StaffQueuePage"));
const StaffHistoryPage = lazy(() => import("../modules/staff/features/history/pages/StaffHistoryPage"));
const StaffProfilePage = lazy(() => import("../modules/staff/features/profile/pages/StaffProfilePage"));
const StaffChangePasswordPage = lazy(() => import("../modules/staff/features/profile/pages/StaffChangePasswordPage"));
const StaffPosPage = lazy(() => import("../modules/staff/features/pointOfSale/pages/StaffPosPage"));
const CustomerJoinPage = lazy(() => import("../modules/customer/features/queue/pages/CustomerJoinPage").then((module) => ({ default: module.CustomerJoinPage })));
const QueueStatusPage = lazy(() => import("../modules/customer/features/queue/pages/QueueStatusPage").then((module) => ({ default: module.QueueStatusPage })));
const PaymentReceiptPage = lazy(() => import("../modules/customer/features/queue/pages/PaymentReceiptPage").then((module) => ({ default: module.PaymentReceiptPage })));
const CustomerAccountPage = lazy(() => import("../modules/customer/features/account/pages/CustomerAccountPage").then((module) => ({ default: module.CustomerAccountPage })));
const StaffManagementPage = lazy(() => import("../modules/admin/features/staff/pages/StaffManagementPage"));
const AdminModulePage = lazy(() => import("../modules/admin/features/businessModules/pages/AdminModulePage").then((module) => ({ default: module.AdminModulePage })));
const AdminTvPage = lazy(() => import("../modules/admin/features/tv/pages/AdminTvPage").then((module) => ({ default: module.AdminTvPage })));
const AdminAccountPage = lazy(() => import("../modules/admin/features/account/pages/AdminAccountPage").then((module) => ({ default: module.AdminAccountPage })));
const AdminDeviceMonitoringPage = lazy(() => import("../modules/admin/features/deviceMonitoring/pages/AdminDeviceMonitoringPage").then((module) => ({ default: module.AdminDeviceMonitoringPage })));

export function AppRoutes() {
  return (
    <Suspense fallback={<PageLoading />}>
    <Routes>

      {/* =====================================================
          CUSTOMER
          No login required
      ===================================================== */}

      {/* Customer joins the queue */}
      <Route
        path="/"
        element={<CustomerJoinPage />}
      />
      <Route path="/kiosk" element={<KioskSession />}>
        <Route index element={<CustomerJoinPage />} />
        <Route path="queue-status/:entryId" element={<QueueStatusPage />} />
      </Route>

      {/* Customer tracks queue */}
      <Route
        path="/queue-status/:entryId"
        element={<QueueStatusPage />}
      />
      <Route
        path="/receipt/:entryId"
        element={<PaymentReceiptPage />}
      />
      <Route
        path="/customer-account"
        element={<CustomerAccountPage />}
      />

      <Route
        path="/tv"
        element={<AdminTvPage />}
      />


      {/* =====================================================
          AUTH
      ===================================================== */}

      <Route
        path="/login"
        element={<Navigate to="/lyn-co/login" replace />}
      />
      <Route
        path="/staff/login"
        element={<Navigate to="/lyn-co/login" replace />}
      />
      <Route
        path="/lyn-co/login"
        element={<LoginPage />}
      />

      <Route
        path="/unauthorized"
        element={
          <div className="flex min-h-screen items-center justify-center">
            <div className="text-center">
              <h1 className="text-2xl font-bold">
                Not authorized
              </h1>

              <p className="mt-2 text-gray-500">
                You do not have permission to access this page.
              </p>
            </div>
          </div>
        }
      />

      <Route path="*" element={<NotFoundPage />} />

      <Route path="/staff/*" element={<LegacyStaffRedirect />} />
      <Route path="/admin/*" element={<LegacyAdminRedirect />} />

      {/* =====================================================
          STAFF
      ===================================================== */}

      <Route
        element={
          <ProtectedRoute
            allowedRoles={["staff"]}
          />
        }
      >
        <Route element={<StaffPresenceLayout />}>
        <Route
          path="/lyn-co/staff"
          element={<StaffDashboardPage />}
        />

        <Route
          path="/lyn-co/staff/queue"
          element={<StaffQueuePage />}
        />

        <Route
          path="/lyn-co/staff/pos"
          element={<StaffPosPage />}
        />

        <Route
          path="/lyn-co/staff/history"
          element={<StaffHistoryPage />}
        />

        <Route
          path="/lyn-co/staff/profile"
          element={<StaffProfilePage />}
        />

        <Route
          path="/lyn-co/staff/change-password"
          element={<StaffChangePasswordPage />}
        />
        </Route>
      </Route>


      {/* =====================================================
          ADMIN
      ===================================================== */}

      <Route
        element={
          <ProtectedRoute
            allowedRoles={["admin"]}
          />
        }
      >
        <Route element={<AdminLayout />}>

        {/* Admin Dashboard */}
        <Route
          path="/lyn-co/admin"
          element={<AdminDashboardPage />}
        />

        {/* Staff Management */}
        <Route
          path="/lyn-co/admin/staff"
          element={<StaffManagementPage />}
        />

        {/* Queue Management */}
        <Route
          path="/lyn-co/admin/queue"
          element={<AdminQueuePage />}
        />

        {/* Analytics */}
        <Route
          path="/lyn-co/admin/analytics"
          element={<AdminAnalyticsPage />}
        />

        <Route path="/lyn-co/admin/tv" element={<AdminTvPage />} />
        <Route path="/lyn-co/admin/devices" element={<AdminDeviceMonitoringPage />} />
        <Route path="/lyn-co/admin/account" element={<AdminAccountPage />} />
        <Route path="/lyn-co/admin/change-password" element={<StaffChangePasswordPage />} />

        <Route
          path="/lyn-co/admin/module/:module"
          element={<AdminModulePage />}
        />

        </Route>

      </Route>

    </Routes>
    </Suspense>
  );
}

function LegacyStaffRedirect() {
  const { pathname, search, hash } = useLocation();
  const destination = pathname === "/staff"
    ? "/lyn-co/staff"
    : `/lyn-co${pathname}`;

  return <Navigate to={`${destination}${search}${hash}`} replace />;
}

function LegacyAdminRedirect() {
  const { pathname, search, hash } = useLocation();
  return <Navigate to={`/lyn-co${pathname}${search}${hash}`} replace />;
}

function PageLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--app-canvas)] text-[var(--app-ink-muted)]" role="status">
      <div className="flex items-center gap-3 text-sm">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--app-border)] border-t-[var(--app-accent)]" aria-hidden="true" />
        Loading LynQ…
      </div>
    </main>
  );
}

const KIOSK_IDLE_TIMEOUT_MS = 2 * 60 * 1000;

function KioskSession() {
  const navigate = useNavigate();
  const [resetKey, setResetKey] = useState(0);
  const [deviceStatus, setDeviceStatus] = useState<DeviceHeartbeatStatus>("online");

  useEffect(() => {
    let timer: number;
    const reportProblem = () => setDeviceStatus("needs_attention");
    const resetIdleTimer = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setResetKey((current) => current + 1);
        void navigate("/kiosk", { replace: true });
      }, KIOSK_IDLE_TIMEOUT_MS);
    };

    const activityEvents = ["pointerdown", "keydown", "touchstart"] as const;
    activityEvents.forEach((event) => window.addEventListener(event, resetIdleTimer));
    window.addEventListener("error", reportProblem);
    window.addEventListener("unhandledrejection", reportProblem);
    resetIdleTimer();

    return () => {
      window.clearTimeout(timer);
      activityEvents.forEach((event) => window.removeEventListener(event, resetIdleTimer));
      window.removeEventListener("error", reportProblem);
      window.removeEventListener("unhandledrejection", reportProblem);
    };
  }, [navigate]);

  return (
    <div key={resetKey}>
      <DeviceHeartbeatReporter kind="kiosk" deviceId="kiosk-main" status={deviceStatus} />
      <Outlet />
    </div>
  );
}