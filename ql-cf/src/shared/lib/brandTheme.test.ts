import { describe, expect, it } from "vitest";
import { BRAND_THEMES, isBrandTheme } from "./brandTheme";

describe("brand themes", () => {
  it("uses black, white, and gray as the default palette", () => {
    expect(BRAND_THEMES.monochrome.label).toContain("default");
    expect(BRAND_THEMES.monochrome.accent).toBe("#262626");
    expect(BRAND_THEMES.monochrome.surface).toBe("#ffffff");
    expect(BRAND_THEMES.monochrome.border).toBe("#d8d8d8");
    expect(BRAND_THEMES.monochrome.canvas).toBe("#f3f3f3");
  });

  it("accepts only supported theme names", () => {
    expect(isBrandTheme("monochrome")).toBe(true);
    expect(isBrandTheme("rose")).toBe(true);
    expect(isBrandTheme("lavender")).toBe(true);
    expect(isBrandTheme("forest")).toBe(true);
    expect(isBrandTheme("midnight")).toBe(true);
    expect(isBrandTheme("charcoal")).toBe(false);
  });
});
