export interface ServiceDurationObservation {
  serviceId: string;
  serviceName: string;
  estimatedMinutes: number;
  actualMinutes: number;
}

export interface ServiceDurationSummary {
  serviceId: string;
  serviceName: string;
  sampleCount: number;
  averageEstimatedMinutes: number;
  averageActualMinutes: number;
  averageDifferenceMinutes: number;
  meanAbsoluteErrorMinutes: number;
}

export interface QueueWaitOutcome {
  status: string;
  predictedWaitMinutes: number | null;
  actualWaitMinutes: number | null;
}

export function summarizeQueueWaitAccuracy(outcomes: QueueWaitOutcome[]) {
  const completed = outcomes.filter((outcome) => outcome.status === "completed");
  const noShowCount = outcomes.filter((outcome) => outcome.status === "no_show").length;
  const matched = completed.filter((outcome) =>
    Number.isFinite(outcome.predictedWaitMinutes)
    && Number.isFinite(outcome.actualWaitMinutes)
    && Number(outcome.predictedWaitMinutes) >= 0
    && Number(outcome.actualWaitMinutes) >= 0
    && Number(outcome.actualWaitMinutes) <= 720
  );
  const actualWaitMinutes = matched.map((outcome) => Number(outcome.actualWaitMinutes));
  const waitMeanAbsoluteErrorMinutes = matched.length
    ? matched.reduce((sum, outcome) =>
        sum + Math.abs(Number(outcome.predictedWaitMinutes) - Number(outcome.actualWaitMinutes)), 0,
      ) / matched.length
    : null;

  return {
    sampleCount: matched.length,
    linkedOutcomeCount: outcomes.filter((outcome) => Number.isFinite(outcome.predictedWaitMinutes)).length,
    waitMeanAbsoluteErrorMinutes: waitMeanAbsoluteErrorMinutes === null
      ? null
      : round(waitMeanAbsoluteErrorMinutes),
    averageActualWaitMinutes: actualWaitMinutes.length
      ? round(actualWaitMinutes.reduce((sum, value) => sum + value, 0) / actualWaitMinutes.length)
      : null,
    noShowCount,
    completedCount: completed.length,
  };
}

export function summarizeServiceDurations(
  observations: ServiceDurationObservation[],
): ServiceDurationSummary[] {
  const grouped = new Map<string, ServiceDurationObservation[]>();
  for (const observation of observations) {
    if (!observation.serviceId
      || !Number.isFinite(observation.estimatedMinutes)
      || observation.estimatedMinutes <= 0
      || !Number.isFinite(observation.actualMinutes)
      || observation.actualMinutes <= 0
      || observation.actualMinutes > 720) {
      continue;
    }
    const values = grouped.get(observation.serviceId) ?? [];
    values.push(observation);
    grouped.set(observation.serviceId, values);
  }

  return [...grouped.entries()]
    .map(([serviceId, samples]) => {
      const count = samples.length;
      const averageEstimated = samples.reduce((sum, item) => sum + item.estimatedMinutes, 0) / count;
      const averageActual = samples.reduce((sum, item) => sum + item.actualMinutes, 0) / count;
      const averageDifference = samples.reduce((sum, item) => sum + item.actualMinutes - item.estimatedMinutes, 0) / count;
      const meanAbsoluteError = samples.reduce(
        (sum, item) => sum + Math.abs(item.actualMinutes - item.estimatedMinutes),
        0,
      ) / count;
      return {
        serviceId,
        serviceName: samples[0].serviceName || "Service",
        sampleCount: count,
        averageEstimatedMinutes: round(averageEstimated),
        averageActualMinutes: round(averageActual),
        averageDifferenceMinutes: round(averageDifference),
        meanAbsoluteErrorMinutes: round(meanAbsoluteError),
      };
    })
    .sort((left, right) => left.serviceName.localeCompare(right.serviceName));
}

export interface HourlyDemandPoint {
  hour: number;
  movingAverage: number;
  average: number;
}

export function aggregateHourlyDemand(
  rows: { created_at: string }[],
  currentDate: Date,
  historyDays = 90,
  windowSize = 7,
): HourlyDemandPoint[] {
  if (!Number.isFinite(currentDate.getTime())) throw new Error("Current forecast date must be valid.");
  const dayCount = Math.max(1, Math.floor(historyDays));
  const safeWindow = Math.max(1, Math.floor(windowSize));
  const manilaFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const dateParts = manilaFormatter.formatToParts(currentDate);
  const datePart = (type: string) => dateParts.find((part) => part.type === type)?.value;
  const currentDay = `${datePart("year")}-${datePart("month")}-${datePart("day")}`;
  const currentUtcDate = new Date(`${currentDay}T00:00:00Z`);
  const dates = Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(currentUtcDate.getTime() - (dayCount - index - 1) * 24 * 60 * 60 * 1000);
    return date.toISOString().slice(0, 10);
  });
  const dateSet = new Set(dates);
  const buckets = new Map<string, number>();

  for (const row of rows) {
    const createdAt = new Date(row.created_at);
    if (!Number.isFinite(createdAt.getTime())) continue;
    const parts = manilaFormatter.formatToParts(createdAt);
    const value = (type: string) => parts.find((part) => part.type === type)?.value;
    const day = `${value("year")}-${value("month")}-${value("day")}`;
    if (!dateSet.has(day)) continue;
    const hour = Number(value("hour"));
    const key = `${day}-${hour}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return Array.from({ length: 24 }, (_, hour) => {
    const series = dates.map((day) => buckets.get(`${day}-${hour}`) ?? 0);
    const recent = series.slice(-safeWindow);
    return {
      hour,
      movingAverage: recent.reduce((sum, count) => sum + count, 0) / recent.length,
      average: series.reduce((sum, count) => sum + count, 0) / series.length,
    };
  });
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
