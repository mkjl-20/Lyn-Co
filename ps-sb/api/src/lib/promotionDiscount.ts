export type PromotionDiscountType = "percent" | "fixed";

export function toDatabasePromotionDiscountType(type: PromotionDiscountType) {
  return type === "percent" ? "percentage" : "fixed";
}

export function fromDatabasePromotionDiscountType(type: string): PromotionDiscountType {
  if (type === "percent" || type === "percentage") return "percent";
  if (type === "fixed") return "fixed";
  throw new Error(`Unsupported promotion discount type: ${type}`);
}

export interface PromotionDiscount {
  id: string;
  discount_type: string;
  discount_value: number;
}

export function selectBestPromotion<T extends PromotionDiscount>(promotions: T[], subtotal: number) {
  let best: { promotion: T; discountAmount: number } | null = null;

  for (const promotion of promotions) {
    const discountAmount = Math.min(
      subtotal,
      Math.round(
        (promotion.discount_type === "percentage" || promotion.discount_type === "percent"
          ? subtotal * Number(promotion.discount_value) / 100
          : Number(promotion.discount_value)) * 100
      ) / 100,
    );
    if (!best || discountAmount > best.discountAmount) {
      best = { promotion, discountAmount };
    }
  }

  return best;
}
