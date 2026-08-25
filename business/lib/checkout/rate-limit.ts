/**
 * Best-effort in-memory rate limiter for the merchant checkout API.
 *
 * Serverless caveat: state is per instance, so the real ceiling is
 * `limit × warm instances`. That still stops the common failure modes (runaway
 * retry loops, a leaked key hammered from one host) without a shared store.
 */

type Bucket = { count: number; windowStartMs: number }

const buckets = new Map<string, Bucket>()
const MAX_TRACKED_KEYS = 10_000

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number }

export function checkCheckoutRateLimit(
  key: string,
  options?: { limit?: number; windowMs?: number; nowMs?: number },
): RateLimitResult {
  const limit = options?.limit ?? 120
  const windowMs = options?.windowMs ?? 60_000
  const now = options?.nowMs ?? Date.now()

  const bucket = buckets.get(key)
  if (!bucket || now - bucket.windowStartMs >= windowMs) {
    if (buckets.size >= MAX_TRACKED_KEYS) buckets.clear()
    buckets.set(key, { count: 1, windowStartMs: now })
    return { allowed: true, retryAfterSeconds: 0 }
  }

  bucket.count += 1
  if (bucket.count <= limit) {
    return { allowed: true, retryAfterSeconds: 0 }
  }
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.windowStartMs + windowMs - now) / 1000)),
  }
}

/** Test hook. */
export function resetCheckoutRateLimit(): void {
  buckets.clear()
}
