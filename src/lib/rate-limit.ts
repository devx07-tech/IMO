import "server-only";
import { supabaseAdmin } from "./supabase-admin";

export type RateLimitResult = { ok: boolean; retryAfter: number };

// In-memory fallback, used only if the shared Postgres limiter is unreachable.
// On serverless each instance keeps its own counters, so it is best-effort.
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 5000;

export function memoryRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  if (buckets.size > MAX_BUCKETS) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}

/**
 * Fixed-window limiter shared across all server instances via the
 * `rate_limit_hit` Postgres function. Falls back to the per-instance
 * in-memory limiter if the database call fails, so an outage never
 * blocks legitimate traffic outright.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  try {
    const { data, error } = await supabaseAdmin
      .rpc("rate_limit_hit", {
        p_key: key,
        p_limit: limit,
        p_window_seconds: Math.ceil(windowMs / 1000),
      })
      .single();

    if (error || !data) throw error ?? new Error("Empty rate limit response.");
    return { ok: data.allowed, retryAfter: data.retry_after };
  } catch (err) {
    console.error("Shared rate limiter unavailable, using in-memory fallback", err);
    return memoryRateLimit(key, limit, windowMs);
  }
}
