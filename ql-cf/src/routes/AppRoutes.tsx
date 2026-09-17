import { Routes, Route } from "react-router-dom";

import { ProtectedRoute } from "../shared/routes/ProtectedRoute";

import { LoginPage } from "../modules/auth/pages/LoginPage";
import { AdminDashboardPage } from "../modules/admin/pages/AdminDashboardPage";
import { AdminQueuePage } from "../modules/admin/pages/AdminQueuePage";
import { AdminAnalyticsPage } from "../modules/admin/pages/AdminAnalyticsPage";
import StaffDashboardPage from "../modules/staff/StaffDashboardPage";
import StaffQueuePage from "../modules/staff/StaffQueuePage";
import StaffHistoryPage from "../modules/staff/StaffHistoryPage";
import StaffProfilePage from "../modules/staff/StaffProfilePage";

import { CustomerJoinPage } from "../modules/customer/pages/CustomerJoinPage";
import { QueueStatusPage } from "../modules/customer/pages/QueueStatusPage";

import StaffManagementPage from "../modules/admin/pages/StaffManagementPage";
import { AdminLayout } from "../modules/admin/components/AdminLayout";
import { AdminModulePage } from "../modules/admin/pages/AdminModulePage";
import { AdminTvPage } from "../modules/admin/pages/AdminTvPage";
import { AdminAccountPage } from "../modules/admin/pages/AdminAccountPage";

export function AppRoutes() {
  return (
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

      {/* Customer tracks queue */}
      <Route
        path="/queue-status/:entryId"
        element={<QueueStatusPage />}
      />


      {/* =====================================================
          AUTH
      ===================================================== */}

      <Route
        path="/login"
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
        <Route
          path="/staff"
          element={<StaffDashboardPage />}
        />

        <Route
          path="/staff/queue"
          element={<StaffQueuePage />}
        />

        <Route
          path="/staff/history"
          element={<StaffHistoryPage />}
        />

        <Route
          path="/staff/profile"
          element={<StaffProfilePage />}
        />
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
          path="/admin"
          element={<AdminDashboardPage />}
        />

        {/* Staff Management */}
        <Route
          path="/admin/staff"
          element={<StaffManagementPage />}
        />

        {/* Queue Management */}
        <Route
          path="/admin/queue"
          element={<AdminQueuePage />}
        />

        {/* Analytics */}
        <Route
          path="/admin/analytics"
          element={<AdminAnalyticsPage />}
        />

        <Route path="/admin/tv" element={<AdminTvPage />} />
        <Route path="/admin/account" element={<AdminAccountPage />} />

        <Route
          path="/admin/module/:module"
          element={<AdminModulePage />}
        />

        </Route>

      </Route>

    </Routes>
  );
}