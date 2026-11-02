import { describe, expect, it } from "vitest";
import { buildCustomerQueueUrl, buildCustomerTrackingUrl } from "./queueQr";

describe("queue QR links", () => {
  it("builds the customer join URL at the configured host", () => {
    expect(buildCustomerQueueUrl("http://192.168.100.119:5173"))
      .toBe("http://192.168.100.119:5173/?source=qr_mobile");
  });

  it("builds a tracking URL with an encoded ticket identifier", () => {
    expect(buildCustomerTrackingUrl("https://salon.example/", "ticket/17"))
      .toBe("https://salon.example/queue-status/ticket%2F17");
  });

  it("rejects invalid protocols and credential-bearing links", () => {
    expect(() => buildCustomerQueueUrl("ftp://salon.example")).toThrow(/HTTP or HTTPS/);
    expect(() => buildCustomerQueueUrl("https://user:pass@salon.example")).toThrow(/credentials/);
  });
});
