# LynQ Functional Requirements Checklist

## Assessment scope

This is a repository-level implementation check against Tables 3.3 and 3.4.
“Present” means the application code has a corresponding user flow/API; it is
not proof that the feature was exercised against the live Supabase project.
The database was not available for end-to-end testing, and deployment settings
such as SMS credentials, production uptime, encryption-at-rest, and privacy
compliance cannot be verified from this repository alone.

Status legend:

- ✅ Implemented in code
- ⚠️ Partially implemented, or requires configuration/runtime verification
- ❌ Requirement is materially missing
- 🔎 Cannot be verified from source alone

## Functional requirements

| ID | Priority | Status | Requirement check / evidence |
|---|---|---|---|
| FR1 | High | ✅ | Admin can create, edit, and deactivate staff. Deactivation is sufficient for access control while preserving historical records; a separate archive action is unnecessary. [StaffManagementPage](./ql-cf/src/modules/admin/pages/StaffManagementPage.tsx), [staff API](./ps-sb/api/src/routes/staff.ts) |
| FR2 | High | ✅ | Service catalog supports creating/editing services, changing price/name, and visibility. [AdminModulePage](./ql-cf/src/modules/admin/pages/AdminModulePage.tsx), [catalog API](./ps-sb/api/src/routes/catalog.ts) |
| FR3 | High | ✅ | Admin can manage VIP status through customer-tag management. [AdminBusinessModules](./ql-cf/src/modules/admin/pages/AdminBusinessModules.tsx), [admin workspace API](./ps-sb/api/src/routes/adminWorkspace.ts) |
| FR4 | Medium | ✅ | Promotions can be created, edited, activated/deactivated, and scheduled. [AdminBusinessModules](./ql-cf/src/modules/admin/pages/AdminBusinessModules.tsx) |
| FR5 | Medium | ✅ | Salon settings and branding have an admin UI and API. [AdminSettingsPage](./ql-cf/src/modules/admin/pages/AdminSettingsPage.tsx), [admin workspace API](./ps-sb/api/src/routes/adminWorkspace.ts) |
| FR6 | Low | ✅ | Admin can manage holiday/promotion forecast events; event multipliers are applied to forecasts. [AdminBusinessModules](./ql-cf/src/modules/admin/pages/AdminBusinessModules.tsx), [forecast API](./ps-sb/api/src/routes/forecast.ts) |
| FR7 | High | ✅ | Customer queue join is available from the QR/mobile URL flow. [CustomerJoinPage](./ql-cf/src/modules/customer/pages/CustomerJoinPage.tsx), [queue QR helper](./ql-cf/src/shared/lib/queueQr.ts) |
| FR8 | High | ✅ | Kiosk join flow exists, with a kiosk route and inactivity reset. [CustomerJoinPage](./ql-cf/src/modules/customer/pages/CustomerJoinPage.tsx), [AppRoutes](./ql-cf/src/routes/AppRoutes.tsx) |
| FR9 | High | ✅ | Customers may join as guests without registering for an account; queue contact details are separate from account signup. [CustomerJoinPage](./ql-cf/src/modules/customer/pages/CustomerJoinPage.tsx), [queue API](./ps-sb/api/src/routes/queue.ts) |
| FR10 | Medium | ✅ | Group check-in creates linked party entries while keeping member services separate. The required additive schema change is in [queue parties migration](./ps-sb/supabase/migrations/20261107100000_party_queue_support.sql); it has not been applied to the live database. [queue API](./ps-sb/api/src/routes/queue.ts) |
| FR11 | High | ✅ | Staff can add walk-ins and phone bookings to the queue. [StaffQueuePage](./ql-cf/src/modules/staff/StaffQueuePage.tsx), [queue API](./ps-sb/api/src/routes/queue.ts) |
| FR12 | Medium | ⚠️ | Guest-by-default, phone OTP registration/login/password reset, and profile name/phone updates are implemented. Actual SMS delivery and verification in the deployed Supabase project remain unverified. [CustomerAccountPage](./ql-cf/src/modules/customer/pages/CustomerAccountPage.tsx) |
| FR13 | High | ⚠️ | Queue ticket/QR confirmation exists. SMS is sent only when a gateway is configured; live delivery was not tested. [QueueStatusPage](./ql-cf/src/modules/customer/pages/QueueStatusPage.tsx), [SMS service](./ps-sb/api/src/services/sms.ts), [queue API](./ps-sb/api/src/routes/queue.ts) |
| FR14 | High | ✅ | Customer can select a preferred staff member and request an availability-aware wait quote. [CustomerJoinPage](./ql-cf/src/modules/customer/pages/CustomerJoinPage.tsx), [queue API](./ps-sb/api/src/routes/queue.ts) |
| FR15 | Medium | ⚠️ | A visit can have separate service items assigned to different stations while sharing one customer seat. Actual simultaneous execution still requires database/runtime verification; the additive [shared-seat migration](./ps-sb/supabase/migrations/20261107101000_share_customer_seat_within_visit.sql) has not been applied to the live database. [CustomerJoinPage](./ql-cf/src/modules/customer/features/queue/pages/CustomerJoinPage.tsx), [queue API](./ps-sb/api/src/routes/queue.ts) |
| FR16 | High | ✅ | Service prices are displayed before selection and in the queue selection flow. [CustomerJoinPage](./ql-cf/src/modules/customer/pages/CustomerJoinPage.tsx) |
| FR17 | Medium | ✅ | Customer can choose regular/senior/PWD; staff can add VIP priority. Customer self-selection excludes VIP. [CustomerJoinPage](./ql-cf/src/modules/customer/pages/CustomerJoinPage.tsx), [StaffQueuePage](./ql-cf/src/modules/staff/StaffQueuePage.tsx) |
| FR18 | High | ✅ | Admin/staff queue tools assign service items to staff and stations, and the salon map shows service-seat and station availability/occupancy. A seat can be shared by service items in the same visit; database enforcement depends on the unapplied [shared-seat migration](./ps-sb/supabase/migrations/20261107101000_share_customer_seat_within_visit.sql). [Queueoverview](./ql-cf/src/modules/admin/components/Queueoverview.tsx), [LiveSalonMap](./ql-cf/src/modules/admin/features/queue/components/LiveSalonMap.tsx), [queue API](./ps-sb/api/src/routes/queue.ts) |
| FR19 | Medium | ✅ | Join response and customer status view expose the queue position. [queue API](./ps-sb/api/src/routes/queue.ts), [QueueStatusPage](./ql-cf/src/modules/customer/pages/QueueStatusPage.tsx) |
| FR20 | Medium | ✅ | No-show risk endpoint and queue UI flag at-risk appointments. [queue API](./ps-sb/api/src/routes/queue.ts), [Queueoverview](./ql-cf/src/modules/admin/components/Queueoverview.tsx) |
| FR21 | High | ✅ | API queue rules cover appointment/walk-in ranking, priority, and late-appointment demotion. [queueRules](./ps-sb/api/src/services/queueRules.ts), [queue API](./ps-sb/api/src/routes/queue.ts) |
| FR22 | High | ⚠️ | Joined/your-turn and automatic near-turn SMS flows are implemented. The dispatcher checks active entries every 15 seconds, enqueues once per visit/milestone, and uses the outbox when configured. Live gateway delivery remains unverified. [SMS service](./ps-sb/api/src/services/sms.ts), [queue notifications](./ps-sb/api/src/services/queueNotifications.ts), [queue API](./ps-sb/api/src/routes/queue.ts) |
| FR23 | High | ✅ | Customer ticket view refreshes live data through realtime, with a two-second polling fallback while the realtime subscription is unavailable. [QueueStatusPage](./ql-cf/src/modules/customer/pages/QueueStatusPage.tsx) |
| FR24 | High | ✅ | Customer cancellation is available and guarded by queue lifecycle rules. [QueueStatusPage](./ql-cf/src/modules/customer/pages/QueueStatusPage.tsx), [queue lifecycle migration](./ps-sb/supabase/migrations/20261025170000_queue_lifecycle_guards.sql) |
| FR25 | High | ⚠️ | Admin queue reorder audits changed positions and queues SMS notifications for affected customers. Staff station-specific reorder and live SMS delivery still require verification. [Queueoverview](./ql-cf/src/modules/admin/components/Queueoverview.tsx), [admin workspace API](./ps-sb/api/src/routes/adminWorkspace.ts), [queue notifications](./ps-sb/api/src/services/queueNotifications.ts) |
| FR26 | High | ✅ | Admin can view and manage the salon queue and reorder waiting entries. [Queueoverview](./ql-cf/src/modules/admin/components/Queueoverview.tsx), [AdminQueuePage](./ql-cf/src/modules/admin/pages/AdminQueuePage.tsx) |
| FR27 | High | ✅ | Admin can manually reorder waiting entries when needed. [Queueoverview](./ql-cf/src/modules/admin/components/Queueoverview.tsx) |
| FR28 | High | ✅ | Crowd threshold alerts are available in both the admin queue and staff queue. [Queueoverview](./ql-cf/src/modules/admin/components/Queueoverview.tsx), [StaffQueuePage](./ql-cf/src/modules/staff/StaffQueuePage.tsx), [forecast API](./ps-sb/api/src/routes/forecast.ts) |
| FR29 | High | ✅ | Staff can add a service to a waiting/in-service visit; estimates and assignments are recalculated. [StaffQueuePage](./ql-cf/src/modules/staff/StaffQueuePage.tsx), [queue API](./ps-sb/api/src/routes/queue.ts) |
| FR30 | Medium | ✅ | Public “Now Serving / Next Up” TV display exists. [AdminTvPage](./ql-cf/src/modules/admin/pages/AdminTvPage.tsx), [forecast API](./ps-sb/api/src/routes/forecast.ts) |
| FR31 | High | ✅ | Staff authentication and live queue dashboard are implemented. [StaffDashboardPage](./ql-cf/src/modules/staff/StaffDashboardPage.tsx), [AuthContext](./ql-cf/src/shared/context/AuthContext.tsx) |
| FR32 | High | ✅ | Admin can take a station out of service only with a reason. [AdminQueuePage](./ql-cf/src/modules/admin/pages/AdminQueuePage.tsx), [admin workspace API](./ps-sb/api/src/routes/adminWorkspace.ts), [station migration](./ps-sb/supabase/migrations/20261027123000_add_station_out_of_service.sql) |
| FR33 | High | ✅ | Staff break/unavailable changes reassign waiting services to the least-loaded eligible staff member and notify affected customers. [queue API](./ps-sb/api/src/routes/queue.ts), [queue notifications](./ps-sb/api/src/services/queueNotifications.ts) |
| FR34 | Medium | ✅ | Admin can propose workload rebalances; affected staff can accept or decline before assignments change. Suggestions use current workload ranking rather than forecast optimization. [StaffQueuePage](./ql-cf/src/modules/staff/StaffQueuePage.tsx), [admin workspace API](./ps-sb/api/src/routes/adminWorkspace.ts) |
| FR35 | High | ✅ | Admin analytics compares per-service estimated and actual durations, including average error. [forecast analytics](./ps-sb/api/src/services/forecastAnalytics.ts), [AdminAnalyticsPage](./ql-cf/src/modules/admin/pages/AdminAnalyticsPage.tsx) |
| FR36 | Medium | ✅ | Kiosk inactivity returns the session to its home flow. [AppRoutes](./ql-cf/src/routes/AppRoutes.tsx) |
| FR37 | High | ✅ | POS transaction recording and service-based reporting are present. [AdminBusinessModules](./ql-cf/src/modules/admin/pages/AdminBusinessModules.tsx), [admin workspace API](./ps-sb/api/src/routes/adminWorkspace.ts) |
| FR38 | High | ✅ | Queue service items store their selected price and checkout uses the stored item price rather than the current catalog price. [queue API](./ps-sb/api/src/routes/queue.ts), [admin workspace API](./ps-sb/api/src/routes/adminWorkspace.ts) |
| FR39 | High | ✅ | Refund/void adjustment records require a reason and a separate authorized approver; external payment-provider settlement is not part of this verification. [POS adjustment migration](./ps-sb/supabase/migrations/20261027130000_add_pos_adjustments.sql), [admin workspace API](./ps-sb/api/src/routes/adminWorkspace.ts) |
| FR40 | Medium | ✅ | Signed-in customer account view can load transaction history. [CustomerAccountPage](./ql-cf/src/modules/customer/pages/CustomerAccountPage.tsx), [customer API](./ps-sb/api/src/routes/customer.ts) |
| FR41 | Medium | ✅ | Staff history includes completed service and transaction records. [StaffHistoryPage](./ql-cf/src/modules/staff/StaffHistoryPage.tsx), [admin workspace API](./ps-sb/api/src/routes/adminWorkspace.ts) |
| FR42 | High | ✅ | Analytics accepts day/week/month/year periods. [AdminAnalyticsPage](./ql-cf/src/modules/admin/pages/AdminAnalyticsPage.tsx), [forecast API](./ps-sb/api/src/routes/forecast.ts) |
| FR43 | High | ✅ | Peak-hour/month forecasts use moving average and linear regression; the application fallback zero-fills daily Manila-time buckets. An active CSV-trained MLR wait-time model is blended into live estimates only when it beats its chronological holdout mean baseline. [AdminAnalyticsPage](./ql-cf/src/modules/admin/pages/AdminAnalyticsPage.tsx), [forecast service](./ps-sb/api/src/services/forecast.ts), [forecast training](./ps-sb/api/src/services/forecastTraining.ts) |
| FR44 | Medium | ✅ | Forecast-based staffing recommendations are displayed. [AdminAnalyticsPage](./ql-cf/src/modules/admin/pages/AdminAnalyticsPage.tsx), [forecast API](./ps-sb/api/src/routes/forecast.ts) |
| FR45 | Medium | ⚠️ | Scenario evaluation is handled as controlled UAT cases rather than an interactive “what-if” simulator in the admin analytics UI. Validate demand changes, eligible staff availability, and service-duration/scope changes using [UAT forecast scenarios](./UAT-FORECAST-CHECKLIST.md); record actual results before marking accepted. |
| FR46 | Medium | ⚠️ | Queue wait predictions are stored per visit and matched against actual wait at first service start; analytics reports wait MAE and observed completed/no-show outcomes. A per-visit no-show probability is not generated, so Brier scoring remains unavailable. Apply [wait prediction migration](./ps-sb/supabase/migrations/20261102120000_link_queue_wait_predictions.sql). [forecast analytics](./ps-sb/api/src/services/forecastAnalytics.ts), [AdminAnalyticsPage](./ql-cf/src/modules/admin/pages/AdminAnalyticsPage.tsx) |
| FR47 | Medium | ✅ | Reports can be printed/saved to PDF via the browser print dialog. [AdminBusinessModules](./ql-cf/src/modules/admin/pages/AdminBusinessModules.tsx) |
| FR48 | Medium | ✅ | No-show rates are calculated for reporting periods. [AdminBusinessModules](./ql-cf/src/modules/admin/pages/AdminBusinessModules.tsx), [admin workspace API](./ps-sb/api/src/routes/adminWorkspace.ts) |
| FR49 | High | ⚠️ | Admin backup/restore and daily scheduled backup code exist when a persistent backup directory is configured. The export currently covers selected business tables rather than all system data; USB/host persistence and a successful restore drill have not been verified. Render's ephemeral filesystem is not a suitable USB backup destination. [AdminBusinessModules](./ql-cf/src/modules/admin/pages/AdminBusinessModules.tsx), [admin workspace API](./ps-sb/api/src/routes/adminWorkspace.ts), [backup service](./ps-sb/api/src/services/adminBackup.ts) |
| FR50 | Medium | ⚠️ | Heartbeat reporting and admin device status are implemented, but the migration and configured API/database must be deployed before this works in production. [AdminDeviceMonitoringPage](./ql-cf/src/modules/admin/pages/AdminDeviceMonitoringPage.tsx), [device API](./ps-sb/api/src/routes/deviceMonitoring.ts), [device heartbeat migration](./ps-sb/supabase/migrations/20261027140000_add_device_heartbeats.sql) |
| FR51 | Medium | ✅ | Checkout automatically applies the single highest-value active promotion the customer qualifies for; offers do not stack, and prior one-per-customer redemptions are excluded. [promotion rules](./ps-sb/api/src/lib/promotionRules.ts), [admin workspace API](./ps-sb/api/src/routes/adminWorkspace.ts) |
| FR52 | Medium | ⚠️ | Audit coverage was expanded for queue reorders, staff reassignment/rebalance, password resets, and key staff actions. Complete coverage of every listed edit/action remains unverified. [audit log helper](./ps-sb/api/src/lib/auditLog.ts), [admin workspace API](./ps-sb/api/src/routes/adminWorkspace.ts), [staff API](./ps-sb/api/src/routes/staff.ts) |
| FR53 | Medium | ✅ | Admin can reset a staff password to a temporary credential; the staff member must change it at next login. [staff API](./ps-sb/api/src/routes/staff.ts), [StaffManagementPage](./ql-cf/src/modules/admin/pages/StaffManagementPage.tsx), [ProtectedRoute](./ql-cf/src/shared/routes/ProtectedRoute.tsx) |

## Non-functional requirements

| ID | Priority | Status | Check / evidence |
|---|---|---|---|
| NFR1 | High | 🔎 | 99% uptime is an operational SLO; it requires deployment monitoring and historical availability data. |
| NFR2 | High | ⚠️ | Queue views use realtime updates and refresh on reconnect. When the customer ticket's realtime subscription is unavailable, it falls back to two-second polling; the public TV view also polls every two seconds. End-to-end latency and a two-second service level have not been measured. [QueueStatusPage](./ql-cf/src/modules/customer/pages/QueueStatusPage.tsx), [AdminTvPage](./ql-cf/src/modules/admin/pages/AdminTvPage.tsx), [queue service](./ql-cf/src/modules/admin/services/queueAdminService.ts) |
| NFR3 | High | ⚠️ | Forecasts use stored history and event adjustments, but peak-load capacity and automatic model retraining are not demonstrated. [forecast service](./ps-sb/api/src/services/forecast.ts) |
| NFR4 | High | ⚠️ | Production HTTPS/configuration safeguards and server-side secret handling exist. Encryption-at-rest configuration and regulatory privacy compliance require provider/deployment review. [API config](./ps-sb/api/src/config.ts), [API app](./ps-sb/api/src/app.ts) |
| NFR5 | High | 🔎 | Responsive/user-friendly UI improvements exist, but no formal ISO/IEC 25010 usability assessment is included. |
| NFR6 | Medium | ✅ | Dedicated tests cover appointment-vs-walk-in ranking, priority ordering, late appointments, and staff/service eligibility. [queueRules](./ps-sb/api/src/services/queueRules.ts), [queueRules tests](./ps-sb/api/src/services/queueRules.test.ts) |
| NFR7 | High | ⚠️ | Imported-data MLR training reports chronological holdout MAE and a mean baseline; live queue wait predictions are now linked to actual waits for wait-MAE reporting. An accepted MAE threshold and per-visit no-show probabilities are not established. [forecast training](./ps-sb/api/src/services/forecastTraining.ts), [forecast analytics](./ps-sb/api/src/services/forecastAnalytics.ts), [forecast dataset panel](./ql-cf/src/modules/admin/components/ForecastDatasetImportPanel.tsx) |
| NFR8 | Medium | ⚠️ | Responsive layouts are present, but mobile/tablet/desktop browser-device testing was not performed for this checklist. |
| NFR9 | High | ⚠️ | Rate limits now use an atomic Supabase RPC with hashed client identifiers, shared across API instances; development falls back to process-local limits only when the service-role key is absent. Apply [shared rate-limit migration](./ps-sb/supabase/migrations/20261102121000_shared_rate_limit_buckets.sql) and verify it against the deployed database. [rate limiter](./ps-sb/api/src/middleware/rateLimit.ts), [queue API](./ps-sb/api/src/routes/queue.ts), [auth API](./ps-sb/api/src/routes/auth.ts) |

## Validation performed

- Frontend unit tests: 20 passed across 6 test files.
- API unit tests: 12 passed, including queue ordering and linked wait-accuracy calculations.
- Frontend and API production builds: passed.
- A live Supabase-backed end-to-end run was not performed for this checklist.
