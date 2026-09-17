export type PriorityType = "regular" | "senior" | "pwd" | "vip";
export type ArrivalType = "walk_in" | "appointment";

const PRIORITY_RANK: Record<PriorityType, number> = {
  vip: 0,
  senior: 1,
  pwd: 1,
  regular: 2,
};

export function isLateAppointment(appointmentIso: string | null, graceMinutes = 15) {
  if (!appointmentIso) return false;
  const scheduled = new Date(appointmentIso).getTime();
  if (Number.isNaN(scheduled)) return false;
  return Date.now() - scheduled > graceMinutes * 60 * 1000;
}

/**
 * Administrator-defined rules from Chapter 3:
 * appointments before walk-ins; late appointments lose appointment rank;
 * senior / PWD / VIP are served ahead of regular walk-ins.
 */
export function queueRank(input: {
  arrivalType: ArrivalType;
  priorityType: PriorityType;
  lateAppointment: boolean;
}) {
  const arrivalRank =
    input.arrivalType === "appointment" && !input.lateAppointment ? 0 : 1;
  return arrivalRank * 10 + PRIORITY_RANK[input.priorityType];
}

export function resolveJoinStatus(arrivalType: ArrivalType, lateAppointment: boolean) {
  if (arrivalType === "appointment" && !lateAppointment) return "scheduled";
  return "waiting";
}

export function resolveEffectiveArrival(
  arrivalType: ArrivalType,
  lateAppointment: boolean
): ArrivalType {
  if (arrivalType === "appointment" && lateAppointment) return "walk_in";
  return arrivalType;
}
