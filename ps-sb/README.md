# ps&sb — Application + Data layer

Express processing unit and Supabase (PostgreSQL, Auth, Realtime, Edge Functions) for LynQ.

## Express API (`api/`)

| Route | Purpose |
|-------|---------|
| `GET /api/health` | Architecture health check |
| `GET /api/catalog/services` | Visible services |
| `GET /api/catalog/staff` | Active service staff |
| `POST /api/queue/join` | QR / kiosk join with priority rules |
| `GET /api/queue/:id` | Ticket + hybrid EWT |
| `POST /api/queue/:id/cancel` | Customer cancel |
| `GET /api/forecast` | Hybrid MA + linear regression |
| `GET /api/forecast/analytics` | Admin snapshot + peak-hour chart data |
| `GET /api/forecast/now-serving` | TV display payload |

```bash
cd api
npm install
npm run dev
```

## Edge Functions

| Function | Purpose |
|----------|---------|
| `login` | Resolves username → internal auth email for staff/admin sign-in |
| `create-staff` | Creates staff auth user + profile (admin use) |
| `forecast` | Runs `compute_hybrid_forecast` in PostgreSQL |

```bash
npx supabase functions serve
```
