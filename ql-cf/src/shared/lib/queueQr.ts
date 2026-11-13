export function buildCustomerQueueUrl(baseUrl: string): string {
  return `${normalizeQueueBaseUrl(baseUrl)}/?source=qr_mobile`;
}

export function buildCustomerTrackingUrl(baseUrl: string, entryId: string): string {
  const url = new URL(normalizeQueueBaseUrl(baseUrl));
  url.searchParams.set("track", entryId);
  return url.toString();
}

export function resolveCustomerQueueBaseUrl(configuredUrl: string, currentOrigin: string): string {
  const currentBaseUrl = normalizeQueueBaseUrl(currentOrigin);
  if (!configuredUrl.trim()) return currentBaseUrl;

  const configuredBaseUrl = normalizeQueueBaseUrl(configuredUrl);
  const configuredHostname = new URL(configuredBaseUrl).hostname.toLowerCase();
  const currentHostname = new URL(currentBaseUrl).hostname.toLowerCase();
  if (isLoopbackHostname(configuredHostname) && !isLoopbackHostname(currentHostname)) {
    return currentBaseUrl;
  }
  return configuredBaseUrl;
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

function isLoopbackHostname(hostname: string): boolean {
  const normalizedHostname = hostname.replace(/^\[|\]$/g, "");
  return normalizedHostname === "localhost"
    || normalizedHostname.endsWith(".localhost")
    || normalizedHostname === "::1"
    || /^127(?:\.\d{1,3}){3}$/.test(normalizedHostname);
}
