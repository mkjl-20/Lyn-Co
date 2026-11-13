export type SeatArea = "hair" | "nail" | "shampoo";

export interface SeatSpot {
  area: SeatArea;
  label: string;
  x: number;
  y: number;
  rot: number;
}

export const SEAT_LAYOUT: Record<string, SeatSpot> = {
  "hair-7": { area: "hair", label: "Hair chair 7", x: 373, y: 880, rot: -47 },
  "hair-6": { area: "hair", label: "Hair chair 6", x: 461, y: 782, rot: -47 },
  "hair-5": { area: "hair", label: "Hair chair 5", x: 552, y: 685, rot: -47 },
  "hair-4": { area: "hair", label: "Hair chair 4", x: 634, y: 592, rot: -47 },
  "hair-3": { area: "hair", label: "Hair chair 3", x: 710, y: 505, rot: -47 },
  "hair-2": { area: "hair", label: "Hair chair 2", x: 820, y: 770, rot: -90 },
  "hair-1": { area: "hair", label: "Hair chair 1", x: 818, y: 930, rot: -90 },
  "nail-1": { area: "nail", label: "Nail seat 1", x: 1259, y: 691, rot: 90 },
  "nail-2": { area: "nail", label: "Nail seat 2", x: 1255, y: 846, rot: 90 },
  "nail-3": { area: "nail", label: "Nail seat 3", x: 1252, y: 985, rot: 90 },
  "shampoo-1": { area: "shampoo", label: "Shampoo bed 1", x: 1365, y: 235, rot: 0 },
  "shampoo-2": { area: "shampoo", label: "Shampoo bed 2", x: 1365, y: 360, rot: 0 },
};

function areaForServiceSeat(category: string, label: string): SeatArea | null {
  const value = `${category} ${label}`.toLowerCase();
  if (/hair|stylist|barber|color|make[\s_-]?up|brows?|eyebrows?|lash/.test(value)) return "hair";
  if (/nail|mani|pedi|foot/.test(value)) return "nail";
  if (/shampoo|wash/.test(value)) return "shampoo";
  return null;
}

export function mapServiceSeatsToLayout<T extends { category: string; label: string }>(
  seats: readonly T[],
): Map<string, T> {
  const mapped = new Map<string, T>();
  const usedLayoutIds = new Set<string>();

  for (const seat of seats) {
    const area = areaForServiceSeat(seat.category, seat.label);
    if (!area) continue;

    const areaLayoutIds = Object.entries(SEAT_LAYOUT)
      .filter(([, spot]) => spot.area === area)
      .map(([id]) => id);
    const numberMatch = seat.label.match(/(\d+)\s*$/);
    const numberedLayoutId = numberMatch ? `${area}-${numberMatch[1]}` : null;
    const layoutId = numberedLayoutId
      && areaLayoutIds.includes(numberedLayoutId)
      && !usedLayoutIds.has(numberedLayoutId)
      ? numberedLayoutId
      : areaLayoutIds.find((id) => !usedLayoutIds.has(id));

    if (layoutId) {
      usedLayoutIds.add(layoutId);
      mapped.set(layoutId, seat);
    }
  }

  return mapped;
}
