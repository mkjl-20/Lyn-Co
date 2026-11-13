import assert from "node:assert/strict";
import test from "node:test";
import {
  isLateAppointment,
  queueRank,
  resolveEffectiveArrival,
  staffCanPerformCategory,
} from "./queueRules.js";

test("on-time appointments rank before walk-ins regardless of priority", () => {
  assert.ok(queueRank({
    arrivalType: "appointment",
    priorityType: "regular",
    lateAppointment: false,
  }) < queueRank({
    arrivalType: "walk_in",
    priorityType: "vip",
    lateAppointment: false,
  }));
});

test("priority ranks VIP first, senior and PWD equally, then regular within an arrival group", () => {
  const rank = (priorityType: "vip" | "senior" | "pwd" | "regular") =>
    queueRank({ arrivalType: "walk_in", priorityType, lateAppointment: false });

  assert.ok(rank("vip") < rank("senior"));
  assert.equal(rank("senior"), rank("pwd"));
  assert.ok(rank("pwd") < rank("regular"));
});

test("late appointments become walk-ins after the grace period", () => {
  const now = Date.now();
  assert.equal(isLateAppointment(new Date(now - 16 * 60_000).toISOString()), true);
  assert.equal(isLateAppointment(new Date(now - 14 * 60_000).toISOString()), false);
  assert.equal(resolveEffectiveArrival("appointment", true), "walk_in");
  assert.equal(resolveEffectiveArrival("appointment", false), "appointment");
});

test("service eligibility matches staff lanes", () => {
  assert.equal(staffCanPerformCategory("hairstylist", "Hair"), true);
  assert.equal(staffCanPerformCategory("nail_technician", "Manicure"), true);
  assert.equal(staffCanPerformCategory("hairstylist", "Pedicure"), false);
});
