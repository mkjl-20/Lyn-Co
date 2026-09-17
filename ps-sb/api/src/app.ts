import express from "express";
import cors from "cors";
import { catalogRouter } from "./routes/catalog.js";
import { queueRouter } from "./routes/queue.js";
import { forecastRouter } from "./routes/forecast.js";
import { architectureRouter } from "./routes/architecture.js";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({
      success: true,
      service: "LynQ Application Layer",
      architecture: "Modular Three-Tier Client-Server Architecture",
      status: "healthy",
      timestamp: new Date().toISOString(),
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
  });

  app.use("/api/catalog", catalogRouter);
  app.use("/api/queue", queueRouter);
  app.use("/api/forecast", forecastRouter);
  app.use("/api/architecture", architectureRouter);

  return app;
}
