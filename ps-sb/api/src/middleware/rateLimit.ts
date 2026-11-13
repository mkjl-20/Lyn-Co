import { createHash } from "node:crypto";
import type { Request, RequestHandler } from "express";
import { config } from "../config.js";
import { getSupabaseAdmin } from "../lib/supabase.js";

interface RateLimitRule {
  key: (request: Request) => string;
  limit: number;
  windowMs: number;
}

interface RateLimitBucket {
  count: number;
  resetsAt: number;
}

interface RateLimitResult {
  allowed: boolean;
  retry_after_seconds: number;
}

const localBuckets = new Map<string, RateLimitBucket>();
let warnedLocalRateLimiting = false;

export function rateLimit(rules: RateLimitRule[], message: string): RequestHandler {
  const namespace = createHash("sha256").update(message).digest("hex").slice(0, 16);

  return (req, res, next) => {
    void enforceRateLimit(req, rules, namespace)
      .then((retryAfterSeconds) => {
        if (retryAfterSeconds > 0) {
          res.setHeader("Retry-After", String(retryAfterSeconds));
          res.status(429).json({ success: false, message });
          return;
        }
        next();
      })
      .catch((error: unknown) => {
        console.error("Shared rate-limit check failed:", error);
        res.status(503).json({
          success: false,
          message: "Request protection is temporarily unavailable. Please try again shortly.",
        });
      });
  };
}

async function enforceRateLimit(
  request: Request,
  rules: RateLimitRule[],
  namespace: string,
): Promise<number> {
  if (!config.supabaseServiceRoleKey && process.env.NODE_ENV !== "production") {
    if (!warnedLocalRateLimiting) {
      console.warn("Shared rate limiting is unavailable; using process-local limits outside production.");
      warnedLocalRateLimiting = true;
    }
    return consumeLocalLimits(request, rules, namespace);
  }

  const supabase = getSupabaseAdmin();
  const results = await Promise.all(rules.map(async (rule, index) => {
    const rawKey = rule.key(request);
    if (!rawKey) return null;

    const keyHash = createHash("sha256")
      .update(`${namespace}:${index}:${rawKey}`)
      .digest("hex");
    const { data, error } = await supabase.rpc("consume_api_rate_limit", {
      p_namespace: namespace,
      p_key_hash: keyHash,
      p_limit: rule.limit,
      p_window_seconds: Math.ceil(rule.windowMs / 1000),
    });
    if (error) throw new Error(`Unable to consume shared rate limit: ${error.message}`);
    const result = Array.isArray(data) ? data[0] as RateLimitResult | undefined : undefined;
    if (!result || typeof result.allowed !== "boolean"
      || !Number.isFinite(result.retry_after_seconds)) {
      throw new Error("Shared rate-limit function returned an invalid response.");
    }
    return result;
  }));
  return results.reduce(
    (retryAfterSeconds, result) =>
      result && !result.allowed
        ? Math.max(retryAfterSeconds, result.retry_after_seconds)
        : retryAfterSeconds,
    0,
  );
}

function consumeLocalLimits(
  request: Request,
  rules: RateLimitRule[],
  namespace: string,
): number {
  const now = Date.now();
  let retryAfterSeconds = 0;
  for (const [key, bucket] of localBuckets) {
    if (bucket.resetsAt <= now) localBuckets.delete(key);
  }

  for (const [index, rule] of rules.entries()) {
    const rawKey = rule.key(request);
    if (!rawKey) continue;
    const bucketKey = `${namespace}:${index}:${rawKey}`;
    const bucket = localBuckets.get(bucketKey);
    if (!bucket || bucket.resetsAt <= now) {
      localBuckets.set(bucketKey, { count: 1, resetsAt: now + rule.windowMs });
      continue;
    }
    bucket.count += 1;
    if (bucket.count > rule.limit) {
      retryAfterSeconds = Math.max(retryAfterSeconds, Math.ceil((bucket.resetsAt - now) / 1000));
    }
  }
  return retryAfterSeconds;
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
