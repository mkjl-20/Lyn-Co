import { describe, expect, it } from "vitest";
import { calculateHybridForecast, calculateMeanAbsoluteError, movingAverage, fitLinearRegression } from "./forecastMath";

describe("forecasting math", () => {
  it("calculates moving average for a known series", () => {
    expect(movingAverage([1, 2, 3, 4, 5], 3)).toEqual([1, 1.5, 2, 3, 4]);
  });

  it("fits a linear regression for a known slope", () => {
    const regression = fitLinearRegression([2, 4, 6, 8]);
    expect(regression.slope).toBeCloseTo(2, 5);
    expect(regression.intercept).toBeCloseTo(2, 5);
  });

  it("blends short-term moving average and trend into a hybrid forecast", () => {
    const result = calculateHybridForecast([10, 12, 15, 18, 20], { windowSize: 3, trendWeight: 0.6, minimumDataPoints: 4 });
    expect(result.confidence).toBe("sufficient");
    expect(result.series.length).toBe(5);
    expect(result.series[0].movingAverage).toBeCloseTo(10, 5);
    expect(result.series[4].hybrid).toBeGreaterThan(0);
  });

  it("calculates mean absolute error correctly", () => {
    expect(calculateMeanAbsoluteError([10, 20], [12, 18])).toBe(2);
  });
});
