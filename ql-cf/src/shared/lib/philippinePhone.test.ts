import { describe, expect, it } from "vitest";
import { formatPhilippinePhoneInput, normalizePhilippinePhoneInput } from "./philippinePhone";

describe("Philippine phone input", () => {
  it("normalizes local numbers to the format used by the queue API", () => {
    expect(normalizePhilippinePhoneInput("09123456789")).toBe("09123456789");
    expect(normalizePhilippinePhoneInput("9123456789")).toBe("09123456789");
  });

  it("accepts an international country code and formatted input", () => {
    expect(normalizePhilippinePhoneInput("+63 912 345 6789")).toBe("09123456789");
  });

  it("displays the national subscriber digits alongside the +63 prefix", () => {
    expect(formatPhilippinePhoneInput("09123456789")).toBe("9123456789");
  });
});
