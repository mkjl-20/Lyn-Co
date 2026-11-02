import assert from "node:assert/strict";
import test from "node:test";
import { buildWhatIfScenario, summarizeServiceDurations } from "./forecastAnalytics.js";

test("summarizes actual versus estimated durations per service", () => {
  const report = summarizeServiceDurations([
    { serviceId: "cut", serviceName: "Cut", estimatedMinutes: 30, actualMinutes: 40 },
    { serviceId: "cut", serviceName: "Cut", estimatedMinutes: 20, actualMinutes: 10 },
    { serviceId: "color", serviceName: "Color", estimatedMinutes: 60, actualMinutes: 720 },
    { serviceId: "bad", serviceName: "Bad", estimatedMinutes: 0, actualMinutes: 30 },
    { serviceId: "old", serviceName: "Old", estimatedMinutes: 30, actualMinutes: 721 },
  ]);

  assert.deepEqual(report, [
    {
      serviceId: "color",
      serviceName: "Color",
      sampleCount: 1,
      averageEstimatedMinutes: 60,
      averageActualMinutes: 720,
      averageDifferenceMinutes: 660,
      meanAbsoluteErrorMinutes: 660,
    },
    {
      serviceId: "cut",
      serviceName: "Cut",
      sampleCount: 2,
      averageEstimatedMinutes: 25,
      averageActualMinutes: 25,
      averageDifferenceMinutes: 0,
      meanAbsoluteErrorMinutes: 10,
    },
  ]);
});

test("compares baseline and what-if staffing, demand, service duration, and wait", () => {
  const result = buildWhatIfScenario({
    staffCount: 4,
    activeStaff: 2,
    demandMultiplier: 1.5,
    eventMultiplier: 1.2,
    averageServiceMinutes: 30,
    serviceDurationMultiplier: 1.5,
    projectedWaitMinutes: 20,
    hourly: [{ hour: 10, forecastCustomers: 4 }],
  });

  assert.equal(result.baselineProjectedWaitMinutes, 24);
  assert.equal(result.projectedWaitMinutes, 27);
  assert.equal(result.waitChangeMinutes, 3);
  assert.equal(result.scenarioAverageServiceMinutes, 45);
  assert.deepEqual(result.hourly[0], {
    hour: 10,
    baselineForecastCustomers: 4.8,
    forecastCustomers: 7.2,
    baselineRecommendedStaff: 3,
    baselineStaffingGap: 1,
    recommendedStaff: 6,
    staffingGap: 2,
  });
});
