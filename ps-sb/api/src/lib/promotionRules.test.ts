import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseBestEligiblePromotion,
  type AutomaticPromotionCandidate,
  type PromotionServiceLine,
} from "./promotionRules.js";

const service: PromotionServiceLine = { id: "haircut", price: 500 };
const now = Date.parse("2026-03-01T12:00:00.000Z");

function promotion(
  id: string,
  discount_type: AutomaticPromotionCandidate["discount_type"],
  discount_value: number,
  overrides: Partial<AutomaticPromotionCandidate> = {},
): AutomaticPromotionCandidate {
  return {
    id,
    is_active: true,
    starts_at: "2026-02-01T00:00:00.000Z",
    ends_at: "2026-04-01T00:00:00.000Z",
    discount_type,
    discount_value,
    redemption_count: 0,
    eligible_service_ids: null,
    minimum_spend: null,
    maximum_discount: null,
    usage_limit: null,
    one_per_customer: false,
    exclude_packages: false,
    ...overrides,
  };
}

test("chooses the eligible promotion with the largest discount without stacking", () => {
  const result = chooseBestEligiblePromotion(
    [
      promotion("fixed", "fixed", 80),
      promotion("percent", "percent", 20),
      promotion("smaller", "percentage", 10),
    ],
    [service],
    null,
    null,
    now,
  );

  assert.equal(result?.promotion.id, "percent");
  assert.equal(result?.discountAmount, 100);
});

test("excludes inactive, out-of-date, exhausted, and ineligible promotions", () => {
  const result = chooseBestEligiblePromotion(
    [
      promotion("inactive", "fixed", 500, { is_active: false }),
      promotion("expired", "fixed", 500, { ends_at: "2026-02-28T00:00:00.000Z" }),
      promotion("exhausted", "fixed", 500, { usage_limit: 1, redemption_count: 1 }),
      promotion("minimum", "fixed", 500, { minimum_spend: 501 }),
    ],
    [service],
    null,
    null,
    now,
  );

  assert.equal(result, null);
});

test("uses deterministic ID ordering when eligible discounts tie", () => {
  const result = chooseBestEligiblePromotion(
    [promotion("z-offer", "fixed", 100), promotion("a-offer", "fixed", 100)],
    [service],
    null,
    null,
    now,
  );

  assert.equal(result?.promotion.id, "a-offer");
});

test("skips a one-per-customer offer already redeemed by this customer", () => {
  const result = chooseBestEligiblePromotion(
    [
      promotion("redeemed", "fixed", 200, { one_per_customer: true }),
      promotion("available", "fixed", 100),
    ],
    [service],
    null,
    "09123456789",
    now,
    new Set(["redeemed"]),
  );

  assert.equal(result?.promotion.id, "available");
});
