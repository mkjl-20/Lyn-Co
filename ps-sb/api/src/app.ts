import express from "express";
import cors from "cors";
import { networkInterfaces } from "node:os";
import { catalogRouter } from "./routes/catalog.js";
import { queueRouter } from "./routes/queue.js";
import { forecastRouter } from "./routes/forecast.js";
import { architectureRouter } from "./routes/architecture.js";
import { authRouter } from "./routes/auth.js";
import { staffRouter } from "./routes/staff.js";
import { adminWorkspaceRouter } from "./routes/adminWorkspace.js";
import { customerRouter } from "./routes/customer.js";
import { getSupabaseAdmin } from "./lib/supabase.js";
import { adminDeviceMonitoringRouter, deviceHeartbeatRouter } from "./routes/deviceMonitoring.js";
import { config } from "./config.js";

export function createApp() {
  const app = express();
  const developmentLanOrigins = process.env.NODE_ENV === "production"
    ? []
    : Object.values(networkInterfaces())
      .flatMap((interfaces) => interfaces ?? [])
      .filter((address) => !address.internal && address.family === "IPv4")
      .flatMap(({ address }) => [5173, 4173].map((port) => `http://${address}:${port}`));
  const allowedOrigins = new Set(
    [
      config.webAppUrl,
      ...(process.env.NODE_ENV === "production"
        ? []
        : [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:4173",
            "http://127.0.0.1:4173",
            ...developmentLanOrigins,
          ]),
    ]
      .filter(Boolean)
      .map((origin) => {
        try {
          return new URL(origin).origin;
        } catch {
          throw new Error("WEB_APP_URL must be a valid origin.");
        }
      })
  );
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin is not allowed by CORS."));
    },
    exposedHeaders: ["X-Backup-Record-Counts"],
  }));
  app.use(express.json({ limit: "200mb" }));

  app.get("/api/health", async (_req, res) => {
    try {
      const supabase = getSupabaseAdmin();
      const healthProbeSignal = AbortSignal.timeout(5_000);
      const { error: databaseError } = await supabase
        .from("services")
        .select("id", { head: true })
        .limit(1)
        .abortSignal(healthProbeSignal);
      if (databaseError) {
        console.error("Health check database probe failed:", databaseError.message);
        res.status(503).json({
          success: false,
          service: "Lyn & Co Salon and Spa Application Layer",
          status: "degraded",
          timestamp: new Date().toISOString(),
          dependencies: { database: "unavailable" },
        });
        return;
      }

      const schemaChecks = await Promise.all([
        supabase.from("queue_entry_services")
          .select("preferred_staff_id", { head: true }).limit(0).abortSignal(healthProbeSignal)
          .then(({ error }) => ({ name: "queue_entry_services.preferred_staff_id", migration: "20261028213000_add_queue_service_staff_preferences.sql", error })),
        supabase.from("forecast_events")
          .select("id", { head: true }).limit(0).abortSignal(healthProbeSignal)
          .then(({ error }) => ({ name: "forecast_events", migration: "20261028230000_repair_forecast_schema.sql", error })),
        supabase.from("forecast_logs")
          .select("id", { head: true }).limit(0).abortSignal(healthProbeSignal)
          .then(({ error }) => ({ name: "forecast_logs", migration: "20261028230000_repair_forecast_schema.sql", error })),
        supabase.from("service_history")
          .select("id", { head: true }).limit(0).abortSignal(healthProbeSignal)
          .then(({ error }) => ({ name: "service_history", migration: "20261102110000_add_forecast_training_datasets.sql", error })),
        supabase.from("mlr_models")
          .select("id", { head: true }).limit(0).abortSignal(healthProbeSignal)
          .then(({ error }) => ({ name: "mlr_models", migration: "20261102110000_add_forecast_training_datasets.sql", error })),
        supabase.from("staff_availability")
          .select("staff_id", { head: true }).limit(0).abortSignal(healthProbeSignal)
          .then(({ error }) => ({ name: "staff_availability", migration: "20261101090000_queue_availability_and_sms_outbox.sql", error })),
        supabase.from("queue_sms_outbox")
          .select("id", { head: true }).limit(0).abortSignal(healthProbeSignal)
          .then(({ error }) => ({ name: "queue_sms_outbox", migration: "20261101090000_queue_availability_and_sms_outbox.sql", error })),
        supabase.from("queue_parties")
          .select("id", { head: true }).limit(0).abortSignal(healthProbeSignal)
          .then(({ error }) => ({ name: "queue_parties", migration: "20261107100000_party_queue_support.sql", error })),
        supabase.from("queue_entries")
          .select("party_id", { head: true }).limit(0).abortSignal(healthProbeSignal)
          .then(({ error }) => ({ name: "queue_entries.party_id", migration: "20261107100000_party_queue_support.sql", error })),
        supabase.from("pos_transaction_adjustments")
          .select("id", { head: true }).limit(0).abortSignal(healthProbeSignal)
          .then(({ error }) => ({ name: "pos_transaction_adjustments", migration: "20261027130000_add_pos_adjustments.sql", error })),
        supabase.from("pos_transactions")
          .select("id", { head: true }).limit(0).abortSignal(healthProbeSignal)
          .then(({ error }) => ({ name: "pos_transactions", migration: null, error })),
        supabase.from("pos_transaction_items")
          .select("id", { head: true }).limit(0).abortSignal(healthProbeSignal)
          .then(({ error }) => ({ name: "pos_transaction_items", migration: null, error })),
      ]);
      const missingMigrations = new Set<string>();
      const unavailableSchema = new Set<string>();
      const missingSchemaCodes = new Set(["PGRST204", "PGRST205", "42703", "42P01"]);
      const partySchemaChecks = schemaChecks.filter(({ name }) =>
        name === "queue_parties" || name === "queue_entries.party_id"
      );
      const requiredSchemaChecks = schemaChecks.filter(({ name }) =>
        name !== "queue_parties" && name !== "queue_entries.party_id"
      );
      const partyCheckInAvailable = partySchemaChecks.every(({ error }) => !error);

      for (const check of partySchemaChecks) {
        if (check.error && !missingSchemaCodes.has(check.error.code ?? "")) {
          console.error(`Health check schema probe failed for ${check.name}:`, check.error.message);
        }
      }

      for (const check of requiredSchemaChecks) {
        if (!check.error) continue;
        if (missingSchemaCodes.has(check.error.code ?? "")) {
          if (check.migration) missingMigrations.add(check.migration);
          else unavailableSchema.add(check.name);
        } else {
          console.error(`Health check schema probe failed for ${check.name}:`, check.error.message);
          unavailableSchema.add(check.name);
        }
      }

      if (missingMigrations.size > 0 || unavailableSchema.size > 0) {
        res.status(503).json({
          success: false,
          service: "Lyn & Co Salon and Spa Application Layer",
          status: "degraded",
          timestamp: new Date().toISOString(),
          dependencies: { database: "healthy", schema: "incomplete" },
          missingMigrations: [...missingMigrations],
          unavailableSchema: [...unavailableSchema],
        });
        return;
      }

      res.json({
        success: true,
        service: "Lyn & Co Salon and Spa Application Layer",
        architecture: "Modular Three-Tier Client-Server Architecture",
        status: "healthy",
        timestamp: new Date().toISOString(),
        dependencies: { database: "healthy", schema: "ready" },
        features: {
          partyCheckIn: {
            status: partyCheckInAvailable ? "available" : "unavailable",
            ...(!partyCheckInAvailable ? { requiredMigration: "20261107100000_party_queue_support.sql" } : {}),
          },
        },
        layers: {
          presentation: {
            tier: "Client Tier",
            stack: "React 19 + TypeScript + Vite (ql-cf)",
            status: "connected",
          },
          application: {
            tier: "Business Logic Tier",
            stack: "Node.js 20+ LTS + Express.js 5 (ps-sb/api)",
            status: "active",
          },
          data: {
            tier: "Persistence & Analytics Tier",
            stack: "Supabase Managed PostgreSQL 15+ + PL/pgSQL Forecasting RPC",
            status: "active",
          },
        },
      });
    } catch (error) {
      console.error("Health check failed:", error);
      res.status(503).json({
        success: false,
        service: "Lyn & Co Salon and Spa Application Layer",
        status: "degraded",
        timestamp: new Date().toISOString(),
        dependencies: { database: "unavailable", schema: "unchecked" },
      });
    }
  });

  app.use("/api/catalog", catalogRouter);
  app.use("/api/queue", queueRouter);
  app.use("/api/forecast", forecastRouter);
  app.use("/api/architecture", architectureRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/customer", customerRouter);
  app.use("/api/admin/staff", staffRouter);
  app.use("/api/admin/workspace", adminWorkspaceRouter);
  app.use("/api/devices", deviceHeartbeatRouter);
  app.use("/api/admin/devices", adminDeviceMonitoringRouter);

  return app;
}
