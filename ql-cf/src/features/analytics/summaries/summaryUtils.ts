import type {
  CapacitySummaryInput,
  ComparisonDelta,
  CustomerSegmentSummaryInput,
  DataQualitySummaryInput,
  EvaluationSummaryInput,
  ForecastSummaryInput,
  PredictionAccuracySummaryInput,
  QueueOperationsSummaryInput,
  RevenuePromoSummaryInput,
  ServiceSummaryInput,
  StaffWorkloadSummaryInput,
  SummaryFlag,
  SummaryInsight,
  SummaryKpi,
  SummaryPeriod,
  SummaryResult,
  WaitTimeSummaryInput,
} from "./types";

export function calculateDelta(current?: number, previous?: number): ComparisonDelta {
  if (current === undefined || previous === undefined || previous === 0) {
    return { absolute: current ?? 0, percentChange: 0 };
  }

  const absolute = (current ?? 0) - previous;
  const percentChange = ((absolute / previous) * 100);

  return { absolute, percentChange };
}

export function makeKpi(label: string, value: number, unit?: string, delta?: ComparisonDelta): SummaryKpi {
  return { label, value, unit, delta };
}

export function buildOwnerSummary(period: SummaryPeriod, currentRevenue: number, previousRevenue?: number) {
  const delta = calculateDelta(currentRevenue, previousRevenue);
  const kpis = [makeKpi("Revenue", currentRevenue, "PHP", delta)];

  return {
    kpis,
    comparison: { revenue: delta },
    flags: [] as SummaryFlag[],
    context: { period, revenue: currentRevenue, previousRevenue },
  } satisfies SummaryResult<{ period: SummaryPeriod; revenue: number; previousRevenue?: number }>;
}

export function buildForecastSummary(input: ForecastSummaryInput) {
  const waitingDelta = calculateDelta(input.waiting, input.previousWaiting);
  const completedDelta = calculateDelta(input.completedToday, input.previousCompletedToday);
  const predictedWaitDelta = calculateDelta(input.predictedWaitMinutes, input.previousPredictedWaitMinutes);

  const kpis = [
    makeKpi("Waiting", input.waiting, "customers", waitingDelta),
    makeKpi("Completed", input.completedToday, "customers", completedDelta),
    makeKpi("Forecasted wait", input.predictedWaitMinutes ?? 0, "min", predictedWaitDelta),
  ];

  const flags: SummaryFlag[] = [];
  if ((input.occupancyRate ?? 0) > 0.8) {
    flags.push({ code: "high-occupancy", message: "Occupancy is above the healthy operating threshold.", severity: "warning" });
  }

  return {
    kpis,
    comparison: {
      waiting: waitingDelta,
      completedToday: completedDelta,
      predictedWaitMinutes: predictedWaitDelta,
    },
    flags,
    context: { ...input },
  } satisfies SummaryResult<ForecastSummaryInput>;
}

export function buildWaitTimeSummary(input: WaitTimeSummaryInput) {
  const waitDelta = calculateDelta(input.averageWaitMinutes, input.previousAverageWaitMinutes);
  const kpis = [
    makeKpi("Avg wait", input.averageWaitMinutes, "min", waitDelta),
    makeKpi("P95 wait", input.p95WaitMinutes ?? input.averageWaitMinutes, "min"),
  ];

  const flags: SummaryFlag[] = [];
  if ((input.averageWaitMinutes ?? 0) > 30) {
    flags.push({ code: "wait-time-alert", message: "Average wait time is elevated relative to target service levels.", severity: "warning" });
  }

  return {
    kpis,
    comparison: { averageWaitMinutes: waitDelta },
    flags,
    context: { ...input },
  } satisfies SummaryResult<WaitTimeSummaryInput>;
}

export function buildPredictionAccuracySummary(input: PredictionAccuracySummaryInput) {
  const maeDelta = calculateDelta(input.mae, input.previousMae);
  const accuracyDelta = calculateDelta(input.accuracyRate, input.previousAccuracyRate);

  const kpis = [
    makeKpi("MAE", input.mae, "min", maeDelta),
    makeKpi("Accuracy", input.accuracyRate ?? 0, "%", accuracyDelta),
  ];

  const flags: SummaryFlag[] = [];
  if ((input.noShowRate ?? 0) > 0.2) {
    flags.push({ code: "no-show-risk", message: "No-show risk is rising above the preferred threshold.", severity: "warning" });
  }

  return {
    kpis,
    comparison: { mae: maeDelta, accuracyRate: accuracyDelta },
    flags,
    context: { ...input },
  } satisfies SummaryResult<PredictionAccuracySummaryInput>;
}

export function buildStaffWorkloadSummary(input: StaffWorkloadSummaryInput) {
  const staffDelta = calculateDelta(input.activeStaff, input.previousActiveStaff);
  const utilizationDelta = calculateDelta(input.utilizationRate, input.previousUtilizationRate);

  const kpis = [
    makeKpi("Active staff", input.activeStaff, "staff", staffDelta),
    makeKpi("Utilization", input.utilizationRate ?? 0, "%", utilizationDelta),
  ];

  return {
    kpis,
    comparison: { activeStaff: staffDelta, utilizationRate: utilizationDelta },
    flags: [],
    context: { ...input },
  } satisfies SummaryResult<StaffWorkloadSummaryInput>;
}

export function buildServiceSummary(input: ServiceSummaryInput) {
  const revenueDelta = calculateDelta(input.topServiceRevenue, input.previousTopServiceRevenue);
  const volumeDelta = calculateDelta(input.totalServicesCompleted, input.previousTotalServicesCompleted);

  const kpis = [
    makeKpi("Top service revenue", input.topServiceRevenue, "PHP", revenueDelta),
    makeKpi("Completed services", input.totalServicesCompleted, "count", volumeDelta),
  ];

  return {
    kpis,
    comparison: { topServiceRevenue: revenueDelta, totalServicesCompleted: volumeDelta },
    flags: [],
    context: { ...input },
  } satisfies SummaryResult<ServiceSummaryInput>;
}

export function buildCustomerSegmentSummary(input: CustomerSegmentSummaryInput) {
  const vipDelta = calculateDelta(input.vipShare, input.previousVipShare);
  const newCustomerDelta = calculateDelta(input.newCustomerShare, input.previousNewCustomerShare);

  const kpis = [
    makeKpi("VIP share", input.vipShare, "%", vipDelta),
    makeKpi("New customers", input.newCustomerShare ?? 0, "%", newCustomerDelta),
  ];

  return {
    kpis,
    comparison: { vipShare: vipDelta, newCustomerShare: newCustomerDelta },
    flags: [],
    context: { ...input },
  } satisfies SummaryResult<CustomerSegmentSummaryInput>;
}

export function buildQueueOperationsSummary(input: QueueOperationsSummaryInput) {
  const completedDelta = calculateDelta(input.completedToday, input.previousCompletedToday);
  const waitingDelta = calculateDelta(input.waiting, input.previousWaiting);

  const kpis = [
    makeKpi("Completed", input.completedToday, "customers", completedDelta),
    makeKpi("Waiting", input.waiting, "customers", waitingDelta),
  ];

  return {
    kpis,
    comparison: { completedToday: completedDelta, waiting: waitingDelta },
    flags: [],
    context: { ...input },
  } satisfies SummaryResult<QueueOperationsSummaryInput>;
}

export function buildRevenuePromoSummary(input: RevenuePromoSummaryInput) {
  const revenueDelta = calculateDelta(input.revenue, input.previousRevenue);
  const promoDelta = calculateDelta(input.promoImpact, input.previousPromoImpact);

  const kpis = [
    makeKpi("Revenue", input.revenue, "PHP", revenueDelta),
    makeKpi("Promo impact", input.promoImpact, "%", promoDelta),
  ];

  return {
    kpis,
    comparison: { revenue: revenueDelta, promoImpact: promoDelta },
    flags: [],
    context: { ...input },
  } satisfies SummaryResult<RevenuePromoSummaryInput>;
}

export function buildCapacitySummary(input: CapacitySummaryInput) {
  const capacityDelta = calculateDelta(input.capacityUsed, input.previousCapacityUsed);
  const staffDelta = calculateDelta(input.recommendedStaff, input.previousRecommendedStaff);

  const kpis = [
    makeKpi("Capacity used", input.capacityUsed, "%", capacityDelta),
    makeKpi("Recommended staff", input.recommendedStaff, "staff", staffDelta),
  ];

  return {
    kpis,
    comparison: { capacityUsed: capacityDelta, recommendedStaff: staffDelta },
    flags: [],
    context: { ...input },
  } satisfies SummaryResult<CapacitySummaryInput>;
}

export function buildDataQualitySummary(input: DataQualitySummaryInput) {
  const completenessDelta = calculateDelta(input.completenessRatio, input.previousCompletenessRatio);
  const kpis = [
    makeKpi("Completeness", input.completenessRatio * 100, "%", completenessDelta),
    makeKpi("Missing records", input.missingRecords, "rows"),
  ];

  return {
    kpis,
    comparison: { completenessRatio: completenessDelta },
    flags: input.missingRecords > 0 ? [{ code: "data-gaps", message: "Some records are missing from the dataset.", severity: "warning" }] : [],
    context: { ...input },
  } satisfies SummaryResult<DataQualitySummaryInput>;
}

export function buildEvaluationSummary(input: EvaluationSummaryInput) {
  const kpis = [
    makeKpi("MAE", input.mae, "min"),
    makeKpi("Mean difference", input.meanDifference, "min"),
    makeKpi("T statistic", input.tStatistic, "value"),
    makeKpi("Throughput before", input.throughputBefore, "customers"),
    makeKpi("Throughput after", input.throughputAfter, "customers"),
    makeKpi("Utilization before", input.utilizationBefore, "%"),
    makeKpi("Utilization after", input.utilizationAfter, "%"),
  ];

  const flags: SummaryFlag[] = [];
  if (input.mae > 10) {
    flags.push({ code: "forecast-noise", message: "Model error is higher than the acceptable threshold.", severity: "warning" });
  }

  return {
    kpis,
    comparison: {
      throughputBefore: { absolute: input.throughputAfter - input.throughputBefore, percentChange: 0 },
      utilizationBefore: { absolute: input.utilizationAfter - input.utilizationBefore, percentChange: 0 },
    },
    flags,
    context: { ...input },
  } satisfies SummaryResult<EvaluationSummaryInput>;
}

export function generateInsightSummary(summaries: SummaryResult<unknown>[]): SummaryInsight[] {
  const insights: SummaryInsight[] = [];

  for (const summary of summaries) {
    const kpiWithDelta = summary.kpis.find((kpi) => Math.abs(kpi.delta?.percentChange ?? 0) > 15);
    if (kpiWithDelta) {
      insights.push({
        message: `${kpiWithDelta.label} changed materially versus the previous period.`,
        severity: "warning",
        sourceMetric: kpiWithDelta.label,
      });
    }

    if (summary.flags.some((flag) => flag.severity === "warning")) {
      insights.push({
        message: summary.flags[0]?.message ?? "Operational risk detected.",
        severity: "warning",
        sourceMetric: summary.flags[0]?.code ?? "overview",
      });
    }
  }

  if (insights.length === 0) {
    insights.push({
      message: "Performance remained stable across the selected period.",
      severity: "info",
      sourceMetric: "overall",
    });
  }

  return insights;
}
