import assert from "node:assert/strict";
import { test } from "node:test";
import { getDeviceStatus, isAllowlistedDevice } from "./deviceMonitoring.js";

test("only registered device kind and id pairs are allowlisted", () => {
  assert.equal(isAllowlistedDevice("kiosk", "kiosk-main"), true);
  assert.equal(isAllowlistedDevice("tv", "tv-main"), true);
  assert.equal(isAllowlistedDevice("kiosk", "tv-main"), false);
  assert.equal(isAllowlistedDevice("tv", "unregistered"), false);
  assert.equal(isAllowlistedDevice("admin", "kiosk-main"), false);
});

test("device status becomes offline after the heartbeat grace period", () => {
  const now = Date.parse("2026-10-27T12:00:00.000Z");
  assert.equal(getDeviceStatus({ last_seen_at: null, reported_status: "online" }, now), "offline");
  assert.equal(
    getDeviceStatus({ last_seen_at: "2026-10-27T11:58:29.000Z", reported_status: "online" }, now),
    "offline",
  );
  assert.equal(
    getDeviceStatus({ last_seen_at: "2026-10-27T11:58:30.000Z", reported_status: "online" }, now),
    "online",
  );
});

test("a recent device-reported fault is surfaced as needs attention", () => {
  assert.equal(
    getDeviceStatus(
      { last_seen_at: "2026-10-27T12:00:00.000Z", reported_status: "needs_attention" },
      Date.parse("2026-10-27T12:00:20.000Z"),
    ),
    "needs_attention",
  );
  assert.equal(
    getDeviceStatus(
      { last_seen_at: "2026-10-27T11:58:00.000Z", reported_status: "needs_attention" },
      Date.parse("2026-10-27T12:00:00.000Z"),
    ),
    "offline",
  );
});
