/**
 * In-memory sliding-window rate limiter.
 *
 * Pilot-scale pragmatism: the app runs on Vercel Fluid Compute, which
 * reuses function instances across concurrent requests, so an in-memory
 * Map survives long enough to meaningfully throttle an attacker hammering
 * a single endpoint. At our scale (a handful of pilot users) this is
 * sufficient to stop accidental misuse and casual abuse.
 *
 * Known limitation: cold-start spawns a new process with an empty map,
 * so a distributed attacker could reset quotas by forcing cold starts.
 * If we outgrow pilot, swap the `hits` Map for Upstash Redis keyed by
 * `${namespace}:${key}` with a TTL of windowMs. The call sites don't
 * need to change.
 */

type Bucket = number[]; // request timestamps (ms) within the active window

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - windowMs;

  const existing = buckets.get(key) ?? [];
  const trimmed = existing.filter((t) => t > windowStart);

  if (trimmed.length >= limit) {
    const oldest = trimmed[0];
    const retryAfterMs = Math.max(oldest + windowMs - now, 0);
    buckets.set(key, trimmed);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    };
  }

  trimmed.push(now);
  buckets.set(key, trimmed);

  if (buckets.size > 5000) evictOldest(now, windowMs);

  return {
    allowed: true,
    remaining: limit - trimmed.length,
    retryAfterSeconds: 0,
  };
}

function evictOldest(now: number, windowMs: number) {
  const cutoff = now - windowMs;
  for (const [k, bucket] of buckets.entries()) {
    const fresh = bucket.filter((t) => t > cutoff);
    if (fresh.length === 0) buckets.delete(k);
    else buckets.set(k, fresh);
  }
}

/** Test-only: wipe all buckets between test cases. */
export function __resetRateLimitForTests(): void {
  buckets.clear();
}

export function getClientIp(req: Request): string {
  // Vercel sets x-vercel-forwarded-for and x-real-ip at its edge; both are
  // trustworthy because the function only ever sees requests that landed
  // through Vercel's ingress. x-forwarded-for is attacker-controllable: an
  // attacker can send "x-forwarded-for: fake" and Vercel appends the real
  // IP to it — taking the FIRST value would pick the attacker's string and
  // reset the rate-limit bucket per spoofed IP. So we fall back to the
  // RIGHTMOST XFF entry (the one Vercel itself added) as a last resort.
  const vercelFwd = req.headers.get("x-vercel-forwarded-for");
  if (vercelFwd) return vercelFwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",");
    return parts[parts.length - 1].trim();
  }
  return "unknown";
}
