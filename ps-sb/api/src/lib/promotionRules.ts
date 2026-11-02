export interface PromotionRuleSet {
  eligible_service_ids: string[] | null;
  minimum_spend: number | string | null;
  maximum_discount: number | string | null;
  usage_limit: number | null;
  one_per_customer: boolean;
  exclude_packages: boolean;
}

export interface PromotionServiceLine {
  id: string;
  price: number;
}

export interface AutomaticPromotionCandidate extends PromotionRuleSet {
  id: string;
  is_active: boolean;
  starts_at: string;
  ends_at: string;
  discount_type: "percent" | "percentage" | "fixed";
  discount_value: number;
  redemption_count: number;
}

export interface BestPromotion {
  promotion: AutomaticPromotionCandidate;
  discountAmount: number;
}

export function promotionIneligibilityReason(
  promotion: PromotionRuleSet,
  services: PromotionServiceLine[],
  packagePrice: number | null,
  contactNumber: string | null,
): string | null {
  if (promotion.exclude_packages && packagePrice !== null) {
    return "This promotion cannot be used with a service package.";
  }

  const eligibleIds = promotion.eligible_service_ids ?? [];
  if (eligibleIds.length > 0 && services.some((service) => !eligibleIds.includes(service.id))) {
    return "This promotion requires all selected services to be eligible.";
  }

  const subtotal = packagePrice ?? services.reduce((total, service) => total + service.price, 0);
  if (promotion.minimum_spend !== null && subtotal < Number(promotion.minimum_spend)) {
    return `This promotion requires a minimum spend of ₱${Number(promotion.minimum_spend).toFixed(2)}.`;
  }
  if (promotion.one_per_customer && !contactNumber?.trim()) {
    return "A mobile number is required for this one-per-customer promotion.";
  }
  return null;
}

export function calculatePromotionDiscount(
  discountType: string,
  discountValue: number,
  subtotal: number,
  maximumDiscount: number | string | null,
) {
  const calculated = discountType === "percentage" || discountType === "percent"
    ? subtotal * discountValue / 100
    : discountValue;
  const capped = maximumDiscount === null
    ? calculated
    : Math.min(calculated, Number(maximumDiscount));
  return Math.min(subtotal, Math.round(capped * 100) / 100);
}

export function chooseBestEligiblePromotion(
  promotions: AutomaticPromotionCandidate[],
  services: PromotionServiceLine[],
  packagePrice: number | null,
  contactNumber: string | null,
  now = Date.now(),
  redeemedPromotionIds: ReadonlySet<string> = new Set(),
): BestPromotion | null {
  const subtotal = packagePrice ?? services.reduce((total, service) => total + service.price, 0);

  return promotions
    .filter((promotion) =>
      promotion.is_active
      && Date.parse(promotion.starts_at) <= now
      && Date.parse(promotion.ends_at) >= now
      && (promotion.usage_limit === null || promotion.redemption_count < promotion.usage_limit)
      && !redeemedPromotionIds.has(promotion.id)
      && promotionIneligibilityReason(promotion, services, packagePrice, contactNumber) === null
    )
    .map((promotion) => ({
      promotion,
      discountAmount: calculatePromotionDiscount(
        promotion.discount_type,
        Number(promotion.discount_value),
        subtotal,
        promotion.maximum_discount,
      ),
    }))
    .filter((candidate) => candidate.discountAmount > 0)
    .sort((first, second) =>
      second.discountAmount - first.discountAmount
      || first.promotion.id.localeCompare(second.promotion.id)
    )[0] ?? null;
}
