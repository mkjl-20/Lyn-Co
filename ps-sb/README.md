# ps&sb - Application + Data layer

Express processing unit and Supabase (PostgreSQL, Auth, Realtime) for Lyn & Co Salon and Spa.

## Express API (`api/`)

| Route | Purpose |
|-------|---------|
| `GET /api/health` | Architecture health check |
| `GET /api/catalog/services` | Visible services |
| `GET /api/catalog/packages` | Active service packages |
| `GET /api/catalog/promotions` | Active promotions |
| `GET /api/catalog/staff` | Active service staff |
| `GET /api/catalog/theme` | Public salon theme and customer queue URL |
| `POST /api/queue/join` | QR / kiosk join with priority rules |
| `POST /api/queue/get-wait-quote` | Availability-aware estimate for the selected service |
| `GET /api/queue/:entryId/live` | Public active-ticket summary without customer details |
| `GET /api/queue/:entryId` | Ticket and estimated wait |
| `POST /api/queue/:entryId/cancel` | Customer cancellation |
| `GET /api/queue/history/transactions` | Queue/service transaction history |
| `POST /api/queue/service/:itemId/start` | Start a queued service |
| `POST /api/queue/service/:itemId/call` | Call a customer for service |
| `PATCH /api/queue/service/:itemId/progress` | Update service progress |
| `POST /api/queue/service/:itemId/complete` | Complete a service |
| `GET /api/forecast` | Hybrid moving-average and linear-regression forecast |
| `GET /api/forecast/analytics` | Authenticated admin snapshot and peak-hour forecast |
| `GET /api/forecast/dataset/status` | Admin training-history count and saved MLR model |
| `POST /api/forecast/dataset/import` | Admin-only validated historical CSV row import |
| `POST /api/forecast/dataset/train` | Admin-only MLR training with chronological holdout evaluation |
| `GET /api/forecast/now-serving` | TV display payload |
| `POST /api/devices/heartbeat` | Public kiosk/TV heartbeat; accepts only the seeded `kiosk/kiosk-main` or `tv/tv-main` device pair |
| `GET /api/admin/devices` | Online/offline/needs-attention status for registered devices (administrator only) |
| `GET /api/admin/workspace/audit-logs` | System audit events (administrator only) |
| `GET /api/admin/workspace/service-history` | Queue and service history (administrator only) |
| `GET/POST /api/admin/workspace/customers` | Customer records (administrator only) |
| `POST /api/admin/workspace/customers/:customerId/vip` | Update customer VIP status (administrator only) |
| `POST /api/admin/workspace/tags` | Create customer tag (administrator only) |
| `POST/DELETE /api/admin/workspace/customers/:customerId/tags/:tagId` | Assign or remove customer tag (administrator only) |
| `DELETE /api/admin/workspace/tags/:tagId` | Delete customer tag (administrator only) |
| `GET/POST/PATCH /api/admin/workspace/promotions` | Manage promotions and discounts (administrator only) |
| `GET/POST/PATCH /api/admin/workspace/packages` | Manage service packages (administrator only) |
| `GET /api/admin/workspace/checkout-candidates` | Completed unpaid visits (administrator only) |
| `GET/POST /api/admin/workspace/transactions` | POS transaction records and completed-ticket payments (administrator only) |
| `GET /api/admin/workspace/reports` | Date-filtered business reports (administrator only) |
| `GET /api/admin/workspace/backup` | Download administrative backup (administrator only) |
| `GET /api/admin/workspace/backup/history` | Backup history (administrator only) |
| `GET /api/admin/workspace/backup/schedule-status` | Scheduled backup status (administrator only) |
| `POST /api/admin/workspace/backup/restore` | Restore administrative backup (administrator only) |
| `GET/PUT /api/admin/workspace/settings` | Salon details, hours, queue URL, and theme (administrator only) |
| `PATCH /api/admin/workspace/queue/:entryId/status` | Cancel or mark a waiting visit as a no-show (administrator only) |
| `PATCH /api/admin/workspace/queue/:entryId/assignment` | Assign a waiting visit to staff (administrator only) |
| `PATCH /api/admin/workspace/queue/:entryId/position` | Reorder the waiting queue atomically (administrator only) |

Workspace transaction records are the point-of-sale ledger and are separate
from the removed transaction-log feature. The current API does not include the
previously documented `pos-packages`, `pos-promotions`, or `package-sales`
routes. Workspace APIs are administrator-only unless stated otherwise above.
At checkout the API automatically applies the single highest-value eligible
active promotion; promotions do not stack, and a customer's prior one-per-
customer redemption makes that offer ineligible.

### Queue and seating assignments

When a customer joins, the API independently assigns a lounge seat for waiting
and reserves an available customer service seat for the selected service when
possible. Customer service seat labels appear on the customer's queue status
page. Staff stations remain separate and identify staff queue/work areas.
Services on one visit run sequentially: staff must complete the active service
before another service for that customer can start. Starting a service releases
the lounge seat; a completed visit is closed after its final service. Customer
and administrator cancellations, no-shows, and queue reordering are guarded by
database functions so seat reservations and service-item states stay in sync.
Walk-ins reserve seats for their estimated service window; appointments reserve
their scheduled window. Exclusion constraints prevent overlapping reservations.

### Database setup and migrations

The migrations in this repository are a partial continuation of the database
schema, not a complete bootstrap for a new Supabase project. Provision the
existing LynQ base schema (including its tables, enums, functions, and
constraints) before applying these migrations. The original baseline schema is
not present in this repository, so these files are not sufficient to initialize
an empty database.

Available migrations, in timestamp order:

1. `supabase/migrations/20261016090000_queue_seat_and_service_completion.sql`
2. `supabase/migrations/20261017100000_grant_authenticated_start_service.sql`
3. `supabase/migrations/20261017110000_queue_service_start_milestone.sql`
4. `supabase/migrations/20261017120000_allow_parallel_queue_services.sql`
5. `supabase/migrations/20261018160000_promotions_and_service_packages.sql`
6. `supabase/migrations/20261018170000_restore_authenticated_package_catalog_reads.sql`
7. `supabase/migrations/20261021150000_add_salon_system_settings.sql`
8. `supabase/migrations/20261022100000_add_customer_accounts.sql`
9. `supabase/migrations/20261022110000_add_transaction_logs.sql`
10. `supabase/migrations/20261022120000_remove_transaction_logs.sql`
11. `supabase/migrations/20261023120000_promotion_and_package_images.sql`
12. `supabase/migrations/20261023130000_queue_promotion_selection.sql`
13. `supabase/migrations/20261023140000_promotion_redemption_rules.sql`
14. `supabase/migrations/20261025160000_queue_privacy_consent.sql`
15. `supabase/migrations/20261025170000_queue_lifecycle_guards.sql`
16. `supabase/migrations/20261027120000_add_audit_logs_and_report_indexes.sql`
17. `supabase/migrations/20261027123000_add_station_out_of_service.sql`
18. `supabase/migrations/20261027124500_add_forecast_events.sql`
19. `supabase/migrations/20261027130000_add_pos_adjustments.sql`
20. `supabase/migrations/20261027140000_add_device_heartbeats.sql`
21. `supabase/migrations/20261027150000_add_queue_parties.sql`
22. `supabase/migrations/20261028213000_add_queue_service_staff_preferences.sql`
23. `supabase/migrations/20261028230000_repair_forecast_schema.sql`
24. `supabase/migrations/20261101090000_queue_availability_and_sms_outbox.sql`
25. `supabase/migrations/20261101100000_assign_service_seat_on_start.sql`
26. `supabase/migrations/20261101110000_allow_authenticated_service_start.sql`
27. `supabase/migrations/20261102090000_customer_account_privacy_consent.sql`
28. `supabase/migrations/20261102100000_queue_admin_staff_workflows.sql`
29. `supabase/migrations/20261102110000_add_forecast_training_datasets.sql`

#### Queue/admin staff workflow deployment

Before deploying the API and web app changes, confirm that
`20261101090000_queue_availability_and_sms_outbox.sql` has been applied, then
apply `20261102100000_queue_admin_staff_workflows.sql` to the existing Supabase
project (for a linked project, use the repository's normal `supabase db push`
deployment process). This migration adds the staff rebalance request table and
transactional availability/reassignment functions, and extends the queue SMS
outbox for position and staff reassignment notifications.

Deploy the API and web app after the migration completes. The API requires its
existing Supabase service-role key for administrator password resets and
queue/staff workflow RPCs. To deliver customer notifications rather than just
record them, configure the existing queue SMS gateway settings. Verify staff
break/reassignment, queue reorder, workload accept/decline, and password reset
in a staging project before production rollout.

#### Forecast dataset import and MLR training

The admin Analytics page includes a CSV import and MLR training panel. Apply
`20261102110000_add_forecast_training_datasets.sql` before using it. The API
validates and idempotently imports historical records into `service_history`,
then evaluates the estimated-wait-time MLR with an 80/20 chronological holdout
and stores the model and MAE/baseline metrics in `mlr_models`.

The imported model is not yet wired into live customer wait estimates; current
queue estimates remain unchanged. Review source data, data permissions, sample
size, and holdout performance before any production prediction integration.
Do not upload customer-identifying information in the training CSV.
Download the CSV template from the Analytics page. Required headers are
`Date`, `Service_Category`, `Service`, `Staff_Name`, `Staff_Experience_Level`,
`Stylist_Request`, `Add_On_Service`, `Queue_Length`, `Arrival_Rate_Per_Hr`,
`Station_Prep_Min`, `Hour_of_Day`, `Holiday`, `Payday`, `Time_Arrived`,
`Service_Start`, `Service_End`, `Waiting_Time_Min`, and
`Service_Duration_Min`. `Seat_No`, `Customer_Group`, and `Customer_Type` are
optional. Dates use `YYYY-MM-DD`; times use 12-hour AM/PM or 24-hour notation
and are interpreted as Philippines time. Rows must be chronologically valid,
and training requires at least 30 usable rows after the moving-average warm-up.

The queue service staff-preferences migration lets customers request a
different eligible stylist for each selected service, including each member
of a party. Requests are stored per service; staff/admin still confirm the
available station and final assignment when service begins.

The service-start API forwards the signed-in staff member's Supabase token to
the start RPC so the database can verify the caller. Apply the latest queue
service-start migrations before deploying that API change.

Device monitoring seeds the front desk kiosk (`kiosk-main`) and TV display
(`tv-main`). Apply the device-heartbeat migration to the existing database and
run the API with its normal Supabase URL, anon key, and server-side
`SUPABASE_SERVICE_ROLE_KEY` configuration. Never put the service-role key in
the frontend. Kiosk and TV pages report every 20 seconds without sending user
credentials; statuses become offline after 90 seconds without a heartbeat.
The TV reports needs-attention while its live queue cannot be loaded. No
additional device secret or frontend environment variable is required.

The transaction-log migration pair is retained in migration history; the later
migration removes that feature's table. It does not remove POS transactions.
Apply the privacy-consent and queue-lifecycle migrations before deploying API
changes that write consent data or call the guarded queue operations.

The forecast API can calculate from its SQL RPC while the event calendar is
unavailable, but scheduled holiday/promotion adjustments and forecast-log
snapshots require `20261028230000_repair_forecast_schema.sql`. If the dashboard
shows that event adjustments are unavailable, apply this migration to the
existing Supabase database and restart the API.

### Production deployment and release checks

The root build and test commands cover both the frontend and API:

```bash
npm run build
npm test
```

Deploy `ql-cf/` as the frontend and `ps-sb/api/` as the API. Build each from
its package directory (or use the root build), then start the API with
`npm start`; the API start command runs the compiled `dist/index.js`, so build
it before starting. Use Node.js 20 or newer. Do not deploy the API with
development dependencies omitted until after its TypeScript build has run.

#### Render adviser demo

The repository root `render.yaml` defines `lynq-demo-api` and
`lynq-demo-web` Blueprint services. Both have auto-deploy disabled so a push
does not publish unreviewed changes automatically. In Render, create a new
Blueprint from the GitHub repository and enter these values when prompted:

- API `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`
- Web `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

Enter secrets only in Render's environment settings, never in chat or source
control. The Blueprint uses `https://lynq-demo-api.onrender.com` for the
frontend API URL and `https://lynq-demo-web.onrender.com` for the API CORS
origin and customer queue URL. If Render assigns different service domains,
update `VITE_API_URL`, `VITE_PUBLIC_QUEUE_URL`, and `WEB_APP_URL` to the exact
HTTPS service origins, then redeploy the frontend and API as needed.

Deploy the API first and check `/api/health`, then deploy the frontend and
verify login, queue, staff/admin pages, and the customer QR flow. The health
check returns 503 when required database tables/migrations are missing. This
project's migration history is a partial continuation; do not use Render as a
reason to push migrations blindly. Verify the existing Supabase migration
history and database backup/restore plan before applying any migration. The
Render Blueprint does not run database migrations.

Configure these frontend build-time variables in the web host:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (public client key only; never use the service-role key)
- `VITE_API_URL` (absolute API origin when hosted separately; leave empty for
  same-origin `/api` routing)
- `VITE_PUBLIC_QUEUE_URL` (optional public queue URL)

Customer accounts use Philippine mobile number and password for new sign-ins.
Configure a supported SMS provider in Supabase Auth and enable phone
confirmations before launch; the app uses Supabase SMS OTP for number
verification and password recovery/change. Queue milestone SMS uses the
separate API `SMS_GATEWAY_URL` and `SMS_API_KEY` settings and does not provide
account verification codes. Existing customer accounts can continue signing in
with their email while transitioning; staff/admin authentication is unchanged.

Configure these API runtime variables in the API host:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (secret; server-side only)
- `WEB_APP_URL` (the exact HTTPS frontend origin allowed by CORS)
- `PORT` (if required by the host)
- `NODE_ENV=production`

For daily flash-drive backups, configure `LYNQ_BACKUP_DIR` to a folder on a
flash drive connected to the API computer (for example, `E:\LynQBackups` on
Windows), `LYNQ_BACKUP_TIME=20:30`, and
`LYNQ_BACKUP_TIME_ZONE=Asia/Manila`. The API must remain running at the
scheduled time. If the configured drive is unavailable, the run is skipped and
the admin Backup & Restore page reports the result; backups are never redirected
to another drive. Existing backup files are kept. Leave `LYNQ_BACKUP_DIR`
unset until the USB drive is connected and its actual path is known; automatic
backups remain disabled in that case.

The API refuses to start in production without HTTPS URLs, an explicit web
origin, and the service-role key. `/api/health` returns HTTP 503 with the
missing migration/schema names until its database and required feature schema
probes pass; configure the platform's readiness check to use this endpoint.

Before any database release, take a verified backup and inspect the target:

```bash
supabase migration list --linked
supabase db push --linked --dry-run
```

This repository contains only migrations after the original baseline. The
linked database has previously reported remote baseline versions that do not
exist in the local migration directory, and the dry run stopped with
`LegacyDbPushMissingLocalError`. If that happens, stop: recover/review the
original baseline migrations or have the database owner reconcile the schema
and migration history. Do not run `supabase migration repair` or push pending
migrations blindly; history repair does not apply the missing schema. Review
each proposed migration and confirm a rollback/restore plan before applying
anything. In particular, `20261022120000_remove_transaction_logs.sql` drops
the `transaction_logs` table.

The API health check verifies the queue staff preference, forecast event/log,
and POS adjustment schema, as well as the POS transaction tables. A healthy
response is not a substitute for testing authenticated admin workflows;
verify transaction listing/checkout, queue assignment, and forecast events
with a staging administrator after migrations are reconciled.

```bash
cd api
npm install
npm run dev
```

Authentication, username resolution, staff creation, profile updates, and
password changes are provided by the Express API at `/api/auth`. They are not
Supabase Edge Functions.

### Open the local app on a phone

For phone testing, connect the phone and development computer to the same
Wi-Fi, then run `npm run dev` from the repository root. The API startup output
lists the computer's LAN address and the web app URL. Open that URL on the
phone (it looks like `http://192.168.x.x:5173/`); `localhost` only refers to the device you're
currently using. Vite serves the frontend on the LAN and proxies `/api`
requests to the local API. Development CORS allows the computer's current LAN
addresses on the Vite ports.

If the page still will not load, allow Node.js through Windows Defender
Firewall on **Private networks** and confirm both devices are on the same
network (guest Wi-Fi may block devices from communicating). Keep the API
terminal running alongside the frontend.
