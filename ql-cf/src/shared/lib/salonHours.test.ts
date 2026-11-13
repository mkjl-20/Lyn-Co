import { describe, expect, it } from "vitest";
import {
  isAppointmentWithinSalonHours,
  isValidSalonHours,
  lastAppointmentTime,
} from "./salonHours";

const hours = { openingTime: "09:00", closingTime: "21:00" };

describe("salon appointment hours", () => {
  it("allows appointments at opening and before closing", () => {
    expect(isAppointmentWithinSalonHours("2026-11-03T09:00", hours)).toBe(true);
    expect(isAppointmentWithinSalonHours("2026-11-03T20:59", hours)).toBe(true);
  });

  it("rejects appointments before opening and at closing", () => {
    expect(isAppointmentWithinSalonHours("2026-11-03T08:59", hours)).toBe(false);
    expect(isAppointmentWithinSalonHours("2026-11-03T21:00", hours)).toBe(false);
    expect(isAppointmentWithinSalonHours("2026-11-03T21:15", hours)).toBe(false);
  });

  it("validates saved business hours and derives the latest selectable time", () => {
    expect(isValidSalonHours(hours)).toBe(true);
    expect(isValidSalonHours({ openingTime: "21:00", closingTime: "09:00" })).toBe(false);
    expect(lastAppointmentTime(hours.closingTime)).toBe("20:59");
  });
});
