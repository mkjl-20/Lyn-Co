import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateHourlyDemand,
  summarizeQueueWaitAccuracy,
  summarizeServiceDurations,
} from "./forecastAnalytics.js";

test("fills missing hourly arrivals with zero and groups timestamps in Manila time", () => {
  const hourly = aggregateHourlyDemand([
    { created_at: "2026-01-01T01:00:00.000Z" },
    { created_at: "2026-01-02T01:00:00.000Z" },
  ], new Date("2026-01-02T04:00:00.000Z"), 2, 2);

  assert.equal(hourly[9].movingAverage, 1);
  assert.equal(hourly[9].average, 1);
  assert.equal(hourly[10].movingAverage, 0);
  assert.equal(hourly[10].average, 0);
});

test("matches stored wait predictions to completed waits and counts linked no-shows", () => {
  const accuracy = summarizeQueueWaitAccuracy([
    { status: "completed", predictedWaitMinutes: 20, actualWaitMinutes: 30 },
    { status: "completed", predictedWaitMinutes: 45, actualWaitMinutes: 15 },
    { status: "no_show", predictedWaitMinutes: 10, actualWaitMinutes: null },
    { status: "completed", predictedWaitMinutes: null, actualWaitMinutes: 25 },
    { status: "completed", predictedWaitMinutes: 60, actualWaitMinutes: 800 },
  ]);

  assert.deepEqual(accuracy, {
    sampleCount: 2,
    linkedOutcomeCount: 4,
    waitMeanAbsoluteErrorMinutes: 20,
    averageActualWaitMinutes: 22.5,
    noShowCount: 1,
    completedCount: 4,
  });
});

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
