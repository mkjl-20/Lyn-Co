export type SummaryPeriod = "day" | "week" | "month" | "year";

export type InsightSeverity = "info" | "warning";

export interface ComparisonDelta {
  absolute: number;
  percentChange: number;
}

export interface SummaryKpi {
  label: string;
  value: number;
  unit?: string;
  delta?: ComparisonDelta;
}

export interface SummaryFlag {
  code: string;
  message: string;
  severity: InsightSeverity;
}

export interface SummaryResult<T> {
  kpis: SummaryKpi[];
  comparison: Record<string, ComparisonDelta>;
  flags: SummaryFlag[];
  context: T;
}

export interface ForecastSummaryInput {
  period: SummaryPeriod;
  waiting: number;
  inService: number;
  completedToday: number;
  predictedWaitMinutes?: number;
  previousWaiting?: number;
  previousInService?: number;
  previousCompletedToday?: number;
  previousPredictedWaitMinutes?: number;
  occupancyRate?: number;
}

export interface WaitTimeSummaryInput {
  period: SummaryPeriod;
  averageWaitMinutes: number;
  previousAverageWaitMinutes?: number;
  p95WaitMinutes?: number;
  backlog?: number;
}

export interface PredictionAccuracySummaryInput {
  period: SummaryPeriod;
  mae: number;
  previousMae?: number;
  accuracyRate?: number;
  previousAccuracyRate?: number;
  noShowRate?: number;
}

export interface StaffWorkloadSummaryInput {
  period: SummaryPeriod;
  activeStaff: number;
  previousActiveStaff?: number;
  utilizationRate?: number;
  previousUtilizationRate?: number;
  hoursWorked?: number;
}

export interface ServiceSummaryInput {
  period: SummaryPeriod;
  topServiceRevenue: number;
  previousTopServiceRevenue?: number;
  totalServicesCompleted: number;
  previousTotalServicesCompleted?: number;
  topServiceName?: string;
}

export interface CustomerSegmentSummaryInput {
  period: SummaryPeriod;
  vipShare: number;
  previousVipShare?: number;
  newCustomerShare?: number;
  previousNewCustomerShare?: number;
  recurringShare?: number;
}

export interface QueueOperationsSummaryInput {
  period: SummaryPeriod;
  completedToday: number;
  previousCompletedToday?: number;
  waiting: number;
  previousWaiting?: number;
  averageServiceMinutes?: number;
}

export interface RevenuePromoSummaryInput {
  period: SummaryPeriod;
  revenue: number;
  previousRevenue?: number;
  promoImpact: number;
  previousPromoImpact?: number;
  promoCount?: number;
}

export interface CapacitySummaryInput {
  period: SummaryPeriod;
  capacityUsed: number;
  previousCapacityUsed?: number;
  recommendedStaff: number;
  previousRecommendedStaff?: number;
}

export interface DataQualitySummaryInput {
  period: SummaryPeriod;
  completenessRatio: number;
  previousCompletenessRatio?: number;
  missingRecords: number;
}

export interface EvaluationSummaryInput {
  period: SummaryPeriod;
  mae: number;
  meanDifference: number;
  tStatistic: number;
  degreesOfFreedom: number;
  throughputBefore: number;
  throughputAfter: number;
  utilizationBefore: number;
  utilizationAfter: number;
}

export interface SummaryInsight {
  message: string;
  severity: InsightSeverity;
  sourceMetric: string;
}
