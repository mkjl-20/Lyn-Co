import type { Request, RequestHandler } from "express";

interface RateLimitRule {
  key: (request: Request) => string;
  limit: number;
  windowMs: number;
}

interface RateLimitBucket {
  count: number;
  resetsAt: number;
}

export function rateLimit(rules: RateLimitRule[], message: string): RequestHandler {
  const buckets = rules.map(() => new Map<string, RateLimitBucket>());

  return (req, res, next) => {
    const now = Date.now();
    let retryAfterSeconds = 0;

    for (const bucketMap of buckets) {
      for (const [key, bucket] of bucketMap) {
        if (bucket.resetsAt <= now) bucketMap.delete(key);
      }
    }

    rules.forEach((rule, index) => {
      const key = rule.key(req);
      if (!key) return;
      const bucketMap = buckets[index];
      const bucket = bucketMap.get(key);
      if (!bucket || bucket.resetsAt <= now) {
        bucketMap.set(key, { count: 1, resetsAt: now + rule.windowMs });
        return;
      }
      bucket.count += 1;
      if (bucket.count > rule.limit) {
        retryAfterSeconds = Math.max(retryAfterSeconds, Math.ceil((bucket.resetsAt - now) / 1000));
      }
    });

    if (retryAfterSeconds > 0) {
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({ success: false, message });
      return;
    }
    next();
  };
}

export function requestIpKey(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

export function bodyIdentityKey(field: string): (req: Request) => string {
  return (req) => {
    const value = req.body?.[field];
    return typeof value === "string" && value.trim()
      ? value.trim().toLowerCase()
      : "";
  };
}
