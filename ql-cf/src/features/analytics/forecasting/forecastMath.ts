export interface MovingAverageOptions {
  windowSize?: number;
}

export interface HybridForecastOptions extends MovingAverageOptions {
  trendWeight?: number;
  minimumDataPoints?: number;
}

export interface HybridPoint {
  value: number;
  movingAverage: number;
  linearRegression: number;
  hybrid: number;
}

export function movingAverage(series: number[], windowSize = 3): number[] {
  if (series.length === 0) {
    return [];
  }

  const safeWindowSize = Math.max(1, Math.min(windowSize, series.length));
  const averages: number[] = [];

  for (let index = 0; index < series.length; index += 1) {
    const start = Math.max(0, index - safeWindowSize + 1);
    const window = series.slice(start, index + 1);
    const total = window.reduce((sum, value) => sum + value, 0);
    averages.push(total / window.length);
  }

  return averages;
}

export function fitLinearRegression(series: number[]): { slope: number; intercept: number } {
  if (series.length < 2) {
    return { slope: 0, intercept: series[0] ?? 0 };
  }

  const xValues = series.map((_, index) => index);
  const meanX = xValues.reduce((sum, value) => sum + value, 0) / xValues.length;
  const meanY = series.reduce((sum, value) => sum + value, 0) / series.length;

  const numerator = xValues.reduce((sum, x, index) => sum + (x - meanX) * (series[index] - meanY), 0);
  const denominator = xValues.reduce((sum, x) => sum + (x - meanX) ** 2, 0) || 1;

  const slope = numerator / denominator;
  const intercept = meanY - slope * meanX;

  return { slope, intercept };
}

export function calculateHybridForecast(
  series: number[],
  options: HybridForecastOptions = {}
): { series: HybridPoint[]; slope: number; intercept: number; confidence: "cold-start" | "sufficient"; method: string; forecastValue: number } {
  const windowSize = Math.max(1, options.windowSize ?? 3);
  const trendWeight = Math.min(1, Math.max(0, options.trendWeight ?? 0.6));
  const minimumDataPoints = Math.max(2, options.minimumDataPoints ?? 4);

  if (series.length === 0) {
    return {
      series: [],
      slope: 0,
      intercept: 0,
      confidence: "cold-start",
      method: "insufficient-data",
      forecastValue: 0,
    };
  }

  const movingAverageValues = movingAverage(series, windowSize);
  const regression = fitLinearRegression(series);
  const confidence = series.length >= minimumDataPoints ? "sufficient" : "cold-start";

  const points = series.map((value, index) => {
    const ma = movingAverageValues[index] ?? value;
    const predictedTrend = regression.slope * (index + 1) + regression.intercept;
    const hybrid = confidence === "sufficient"
      ? (1 - trendWeight) * ma + trendWeight * predictedTrend
      : ma;

    return {
      value,
      movingAverage: ma,
      linearRegression: predictedTrend,
      hybrid,
    };
  });

  const forecastValue = confidence === "sufficient"
    ? (1 - trendWeight) * (movingAverageValues.at(-1) ?? series.at(-1) ?? 0) + trendWeight * (regression.slope * (series.length + 1) + regression.intercept)
    : (movingAverageValues.at(-1) ?? series.at(-1) ?? 0);

  return {
    series: points,
    slope: regression.slope,
    intercept: regression.intercept,
    confidence,
    method: confidence === "sufficient" ? "hybrid" : "moving-average",
    forecastValue,
  };
}

export function calculateMeanAbsoluteError(actual: number[], predicted: number[]): number {
  if (actual.length === 0) {
    return 0;
  }

  if (actual.length !== predicted.length) {
    throw new Error("Actual and predicted arrays must have the same length.");
  }

  const totalError = actual.reduce((sum, current, index) => sum + Math.abs(current - (predicted[index] ?? 0)), 0);

  return totalError / actual.length;
}

export interface EstimatedWaitInput {
  customersAhead: number;
  estimatedDurationAheadMinutes: number;
  activeServiceMinutes: number;
  availableStaff: number;
  availableSeats: number;
  preferredStaffId?: string | null;
  serviceMinutes: number[];
  addOnMinutes?: number;
}

export function calculateEstimatedWaitTime(input: EstimatedWaitInput): number {
  const totalAheadMinutes = input.customersAhead * input.estimatedDurationAheadMinutes;
  const activeMinutes = Math.max(0, input.activeServiceMinutes);
  const addOnMinutes = Math.max(0, input.addOnMinutes ?? 0);
  const totalServiceMinutes = input.serviceMinutes.reduce((sum, value) => sum + value, 0) + addOnMinutes;
  const staffCoverage = Math.max(1, input.availableStaff);
  const seatCoverage = Math.max(1, input.availableSeats);

  const baseWait = totalAheadMinutes + activeMinutes + totalServiceMinutes;
  const availabilityFactor = staffCoverage * seatCoverage;
  return Math.max(0, Math.round(baseWait / availabilityFactor));
}
