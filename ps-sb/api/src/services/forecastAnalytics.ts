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

export interface ScenarioHourInput {
  hour: number;
  forecastCustomers: number;
}

export interface WhatIfScenarioInput {
  staffCount: number;
  activeStaff: number;
  demandMultiplier: number;
  eventMultiplier: number;
  averageServiceMinutes: number;
  serviceDurationMultiplier: number;
  projectedWaitMinutes: number;
  hourly: ScenarioHourInput[];
}

export function buildWhatIfScenario(input: WhatIfScenarioInput) {
  const baselineStaffCount = input.activeStaff;
  const baselineProjectedWaitMinutes = Math.round(input.projectedWaitMinutes * input.eventMultiplier);
  const totalMultiplier = Math.max(0.1, Math.min(5, input.demandMultiplier * input.eventMultiplier));
  const scenarioAverageServiceMinutes = round(input.averageServiceMinutes * input.serviceDurationMultiplier);
  const hourly = input.hourly.map(({ hour, forecastCustomers: baseForecast }) => {
    const baselineForecastCustomers = round(baseForecast * input.eventMultiplier);
    const forecastCustomers = round(baselineForecastCustomers * input.demandMultiplier);
    const baselineRecommendedStaff = Math.ceil(baselineForecastCustomers * input.averageServiceMinutes / 60);
    const recommendedStaff = Math.ceil(
      forecastCustomers * input.averageServiceMinutes * input.serviceDurationMultiplier / 60,
    );
    return {
      hour,
      baselineForecastCustomers,
      forecastCustomers,
      baselineRecommendedStaff,
      baselineStaffingGap: baselineRecommendedStaff - baselineStaffCount,
      recommendedStaff,
      staffingGap: recommendedStaff - input.staffCount,
    };
  });
  const projectedWaitMinutes = Math.round(
    input.projectedWaitMinutes
    * (Math.max(input.activeStaff, 1) / input.staffCount)
    * totalMultiplier
    * input.serviceDurationMultiplier,
  );

  return {
    staffCount: input.staffCount,
    baselineStaffCount,
    demandMultiplier: input.demandMultiplier,
    serviceDurationMultiplier: input.serviceDurationMultiplier,
    eventMultiplier: input.eventMultiplier,
    combinedMultiplier: totalMultiplier,
    baselineProjectedWaitMinutes,
    projectedWaitMinutes,
    waitChangeMinutes: projectedWaitMinutes - baselineProjectedWaitMinutes,
    averageServiceMinutes: round(input.averageServiceMinutes),
    scenarioAverageServiceMinutes,
    hourly,
  };
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
