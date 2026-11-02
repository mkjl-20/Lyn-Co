export const MLR_FEATURES = [
  "ma5",
  "queue_length",
  "arrival_rate",
  "hour_of_day",
  "station_prep_min",
  "stylist_request",
  "add_on",
  "staff_experience",
  "walk_in",
  "holiday",
  "payday",
] as const;

export interface ForecastTrainingRow {
  service: string;
  started_at: string;
  duration_min: number;
  waiting_min: number;
  queue_length: number;
  arrival_rate_per_hr: number;
  hour_of_day: number;
  station_prep_min: number;
  stylist_request: boolean;
  add_on: boolean;
  staff_experience: number;
  customer_type: string | null;
  holiday: boolean;
  payday: boolean;
}

export interface MlrModel {
  features: typeof MLR_FEATURES[number][];
  mean: number[];
  std: number[];
  coef: number[];
}

export interface TrainResult {
  nTrain: number;
  nTest: number;
  r2Test: number;
  maeTest: number;
  baselineMae: number;
  model: MlrModel;
}

function solve(matrix: number[][], values: number[]) {
  const size = values.length;
  const augmented = matrix.map((row, index) => [...row, values[index]]);

  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    if (Math.abs(divisor) < 1e-12) throw new Error("Training data does not contain enough variation.");
    for (let index = column; index <= size; index += 1) augmented[column][index] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let index = column; index <= size; index += 1) {
        augmented[row][index] -= factor * augmented[column][index];
      }
    }
  }

  return augmented.map((row) => row[size]);
}

function fitModel(features: number[][], targets: number[], ridge = 1e-3) {
  const featureCount = features[0].length;
  const means = Array(featureCount).fill(0) as number[];
  const deviations = Array(featureCount).fill(0) as number[];

  for (let column = 0; column < featureCount; column += 1) {
    means[column] = features.reduce((sum, row) => sum + row[column], 0) / features.length;
    deviations[column] = Math.sqrt(
      features.reduce((sum, row) => sum + (row[column] - means[column]) ** 2, 0) / features.length,
    ) || 1;
  }

  const standardized = features.map((row) => [1, ...row.map((value, index) => (
    (value - means[index]) / deviations[index]
  ))]);
  const width = featureCount + 1;
  const gram = Array.from({ length: width }, () => Array(width).fill(0) as number[]);
  const targetProducts = Array(width).fill(0) as number[];

  standardized.forEach((row, rowIndex) => {
    for (let left = 0; left < width; left += 1) {
      targetProducts[left] += row[left] * targets[rowIndex];
      for (let right = 0; right < width; right += 1) {
        gram[left][right] += row[left] * row[right];
      }
    }
  });
  for (let index = 1; index < width; index += 1) gram[index][index] += ridge * features.length;

  return { mean: means, std: deviations, coef: solve(gram, targetProducts) };
}

function predict(model: Pick<MlrModel, "mean" | "std" | "coef">, row: number[]) {
  return Math.max(0, model.coef[0] + row.reduce(
    (sum, value, index) => sum + model.coef[index + 1] * ((value - model.mean[index]) / model.std[index]),
    0,
  ));
}

function featureRows(rows: ForecastTrainingRow[]) {
  const historyByService = new Map<string, number[]>();
  const samples: { features: number[]; target: number }[] = [];

  for (const row of rows) {
    const previousDurations = historyByService.get(row.service) ?? [];
    if (previousDurations.length >= 5) {
      const ma5 = previousDurations.slice(-5).reduce((sum, value) => sum + value, 0) / 5;
      samples.push({
        features: [
          ma5,
          row.queue_length,
          row.arrival_rate_per_hr,
          row.hour_of_day,
          row.station_prep_min,
          Number(row.stylist_request),
          Number(row.add_on),
          row.staff_experience,
          Number(row.customer_type?.toLowerCase() === "walk-in"),
          Number(row.holiday),
          Number(row.payday),
        ],
        target: row.waiting_min,
      });
    }
    historyByService.set(row.service, [...previousDurations, row.duration_min]);
  }

  return samples;
}

export function trainForecastModel(rows: ForecastTrainingRow[]): TrainResult {
  const orderedRows = [...rows].sort(
    (left, right) => Date.parse(left.started_at) - Date.parse(right.started_at),
  );
  const samples = featureRows(orderedRows);
  if (samples.length < 30) {
    throw new Error(`Need at least 30 usable records after the five-row moving-average warm-up; found ${samples.length}.`);
  }

  const splitIndex = Math.floor(samples.length * 0.8);
  const train = samples.slice(0, splitIndex);
  const test = samples.slice(splitIndex);
  const trainingModel = fitModel(train.map((sample) => sample.features), train.map((sample) => sample.target));
  const predictions = test.map((sample) => predict(trainingModel, sample.features));
  const testTargets = test.map((sample) => sample.target);
  const testMean = testTargets.reduce((sum, value) => sum + value, 0) / testTargets.length;
  const trainingMean = train.reduce((sum, sample) => sum + sample.target, 0) / train.length;
  const squaredError = testTargets.reduce((sum, target, index) => sum + (target - predictions[index]) ** 2, 0);
  const totalSquaredDeviation = testTargets.reduce((sum, target) => sum + (target - testMean) ** 2, 0);
  const maeTest = testTargets.reduce((sum, target, index) => sum + Math.abs(target - predictions[index]), 0) / test.length;
  const baselineMae = testTargets.reduce((sum, target) => sum + Math.abs(target - trainingMean), 0) / test.length;
  const finalModel = fitModel(samples.map((sample) => sample.features), samples.map((sample) => sample.target));

  return {
    nTrain: train.length,
    nTest: test.length,
    r2Test: totalSquaredDeviation === 0 ? 0 : 1 - squaredError / totalSquaredDeviation,
    maeTest,
    baselineMae,
    model: { features: [...MLR_FEATURES], ...finalModel },
  };
}
