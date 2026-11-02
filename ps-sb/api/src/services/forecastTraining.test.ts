import assert from "node:assert/strict";
import test from "node:test";
import { trainForecastModel, type ForecastTrainingRow } from "./forecastTraining.js";

function trainingRows(count: number): ForecastTrainingRow[] {
  return Array.from({ length: count }, (_, index) => ({
    service: "cut",
    started_at: new Date(Date.UTC(2026, 0, 1, 9, index * 30)).toISOString(),
    duration_min: 30 + index % 8,
    waiting_min: 10 + index % 6,
    queue_length: index % 10,
    arrival_rate_per_hr: index % 5,
    hour_of_day: 9 + (index % 10),
    station_prep_min: 2,
    stylist_request: index % 2 === 0,
    add_on: index % 3 === 0,
    staff_experience: 1 + (index % 3),
    customer_type: index % 2 === 0 ? "Walk-in" : "Appointment",
    holiday: false,
    payday: index % 4 === 0,
  }));
}

test("trains and evaluates in chronological order with a moving-average warm-up", () => {
  const result = trainForecastModel(trainingRows(50).reverse());

  assert.equal(result.nTrain + result.nTest, 45);
  assert.equal(result.nTest, 9);
  assert.equal(result.model.features.length, 11);
  assert.ok(Number.isFinite(result.maeTest));
  assert.ok(Number.isFinite(result.baselineMae));
});

test("requires enough usable history after the moving-average warm-up", () => {
  assert.throws(() => trainForecastModel(trainingRows(34)), /Need at least 30 usable records/);
});
