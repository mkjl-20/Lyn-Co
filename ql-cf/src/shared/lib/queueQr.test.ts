import { describe, expect, it } from "vitest";
import { buildCustomerQueueUrl, buildCustomerTrackingUrl, resolveCustomerQueueBaseUrl } from "./queueQr";

describe("queue QR links", () => {
  it("builds the customer join URL at the configured host", () => {
    expect(buildCustomerQueueUrl("http://192.168.100.119:5173"))
      .toBe("http://192.168.100.119:5173/?source=qr_mobile");
  });

  it("uses the app root when the configured URL comes from an admin route", () => {
    expect(buildCustomerQueueUrl("https://salon.example/lyn-co/login"))
      .toBe("https://salon.example/?source=qr_mobile");
  });

  it("builds a tracking URL with an encoded ticket identifier", () => {
    expect(buildCustomerTrackingUrl("https://salon.example/", "ticket/17"))
      .toBe("https://salon.example/?track=ticket%2F17");
  });

  it("uses the current deployed host when a saved QR address is localhost", () => {
    expect(resolveCustomerQueueBaseUrl("http://localhost:5173", "https://salon.example"))
      .toBe("https://salon.example");
  });

  it("uses the current site when no queue address has been configured", () => {
    expect(resolveCustomerQueueBaseUrl("", "https://salon.example"))
      .toBe("https://salon.example");
  });

  it("preserves a configured reachable queue address", () => {
    expect(resolveCustomerQueueBaseUrl("https://queue.salon.example/path", "http://localhost:5173"))
      .toBe("https://queue.salon.example");
  });

  it("rejects invalid protocols and credential-bearing links", () => {
    expect(() => buildCustomerQueueUrl("ftp://salon.example")).toThrow(/HTTP or HTTPS/);
    expect(() => buildCustomerQueueUrl("https://user:pass@salon.example")).toThrow(/credentials/);
  });
});
