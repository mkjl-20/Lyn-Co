import { describe, expect, it } from "vitest";
import {
  buildCapacitySummary,
  buildCustomerSegmentSummary,
  buildDataQualitySummary,
  buildEvaluationSummary,
  buildForecastSummary,
  buildOwnerSummary,
  generateInsightSummary,
} from "./summaryUtils";

describe("analytics summary utilities", () => {
  it("builds a forecast summary with deltas", () => {
    const summary = buildForecastSummary({
      period: "day",
      waiting: 20,
      inService: 5,
      completedToday: 40,
      predictedWaitMinutes: 22,
      previousWaiting: 15,
      previousCompletedToday: 30,
      previousPredictedWaitMinutes: 18,
      occupancyRate: 0.85,
    });

    expect(summary.kpis[0].label).toBe("Waiting");
    expect(summary.kpis[0].delta?.percentChange).toBeGreaterThan(0);
    expect(summary.flags[0]?.code).toBe("high-occupancy");
  });

  it("handles empty data and returns stable defaults", () => {
    const summary = buildOwnerSummary("month", 0, 0);
    expect(summary.kpis[0].value).toBe(0);
    expect(summary.comparison.revenue.percentChange).toBe(0);
  });

  it("returns a data quality warning when records are missing", () => {
    const summary = buildDataQualitySummary({
      period: "week",
      completenessRatio: 0.92,
      previousCompletenessRatio: 0.98,
      missingRecords: 2,
    });

    expect(summary.flags[0]?.code).toBe("data-gaps");
  });

  it("builds an evaluation summary with MAE, t-stat, and throughput metrics", () => {
    const summary = buildEvaluationSummary({
      period: "month",
      mae: 8,
      meanDifference: 3,
      tStatistic: 2.45,
      degreesOfFreedom: 16,
      throughputBefore: 120,
      throughputAfter: 132,
      utilizationBefore: 68,
      utilizationAfter: 74,
    });

    expect(summary.kpis[0].label).toBe("MAE");
    expect(summary.context.throughputAfter).toBeGreaterThan(summary.context.throughputBefore);
  });

  it("builds customer segment and capacity summaries from fixed inputs", () => {
    const segments = buildCustomerSegmentSummary({
      period: "year",
      vipShare: 18,
      previousVipShare: 15,
      newCustomerShare: 22,
      previousNewCustomerShare: 19,
      recurringShare: 58,
    });

    const capacity = buildCapacitySummary({
      period: "month",
      capacityUsed: 78,
      previousCapacityUsed: 70,
      recommendedStaff: 6,
      previousRecommendedStaff: 5,
    });

    expect(segments.kpis[0].value).toBe(18);
    expect(capacity.kpis[1].value).toBe(6);
  });

  it("generates a plain-language insight summary", () => {
    const insights = generateInsightSummary([
      buildForecastSummary({
        period: "day",
        waiting: 30,
        inService: 7,
        completedToday: 60,
        predictedWaitMinutes: 45,
        previousWaiting: 10,
        previousCompletedToday: 40,
        previousPredictedWaitMinutes: 20,
      }),
    ]);

    expect(insights[0]?.severity).toBe("warning");
    expect(insights[0]?.sourceMetric).toBeDefined();
  });
});
