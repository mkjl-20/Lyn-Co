export function buildCustomerQueueUrl(baseUrl: string): string {
  return `${normalizeQueueBaseUrl(baseUrl)}/?source=qr_mobile`;
}

export function buildCustomerTrackingUrl(baseUrl: string, entryId: string): string {
  return `${normalizeQueueBaseUrl(baseUrl)}/queue-status/${encodeURIComponent(entryId)}`;
}

function normalizeQueueBaseUrl(baseUrl: string): string {
  const parsed = new URL(baseUrl);
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.hostname) {
    throw new Error("Enter a valid HTTP or HTTPS queue address.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Queue addresses cannot contain login credentials.");
  }
  return parsed.origin;
}
