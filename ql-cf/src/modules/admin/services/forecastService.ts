import { apiRequest } from "@/shared/lib/apiClient";

export interface HourlyForecast {
  hour: number;
  movingAverage: number;
  linearRegression: number;
  hybrid: number;
}

export interface HybridForecast {
  method: string;
  source: string;
  hourly: HourlyForecast[];
  slope: number;
  intercept: number;
  ewtMinutes: number;
  waitingCount: number;
  remainingMinutes: number;
  activeStaff: number;
  crowdAlert: boolean;
}

export interface AnalyticsSnapshot {
  waiting: number;
  inService: number;
  completedToday: number;
  scheduledToday: number;
  activeStaff: number;
}

export async function fetchAnalyticsForecast() {
  return apiRequest<{ snapshot: AnalyticsSnapshot; forecast: HybridForecast }>(
    "/api/forecast/analytics"
  );
}
