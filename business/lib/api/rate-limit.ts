import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"

export type ApiRateSurface = "v1" | "first_party" | "skip"

const WINDOW_MS = 60_000

function envInt(name: string, fallback: number): number {
  const raw = Number(process.env[name] ?? "")
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback
}

/** Public merchant /v1 reads (catalog, list) per IP on one Fluid isolate. */
export function v1IpReadLimit(): number {
  return envInt("API_V1_IP_READ_LIMIT", 120)
}

/** Public merchant /v1 writes per IP on one Fluid isolate. */
export function v1IpWriteLimit(): number {
  return envInt("API_V1_IP_WRITE_LIMIT", 30)
}

/** First-party Banking / Office / Mobile per IP — higher, separate bucket. */
export function firstPartyIpLimit(): number {
  return envInt("API_FIRST_PARTY_IP_LIMIT", 600)
}

/** Authoritative /v1 cap per business after the merchant key authenticates. */
export function v1BusinessReadLimit(): number {
  return envInt("API_V1_BUSINESS_READ_LIMIT", 300)
}

export function v1BusinessWriteLimit(): number {
  return envInt("API_V1_BUSINESS_WRITE_LIMIT", 40)
}

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])

const SKIP_PREFIXES = [
  "/api/webhooks",
  "/api/internal",
  "/api/cron",
  "/api/checkout/webhooks",
]

export function classifyApiRateSurface(pathname: string): ApiRateSurface {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`
  if (path === "/v1" || path.startsWith("/v1/") || path.startsWith("/api/v1/")) return "v1"
  if (SKIP_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return "skip"
  if (path.startsWith("/api/")) return "first_party"
  return "skip"
}

export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first
  }
  return headers.get("x-real-ip")?.trim() || "unknown"
}

type MemoryBucket = { resetAt: number; count: number }

const memoryBuckets = new Map<string, MemoryBucket>()

export function resetApiRateLimitMemoryForTests(): void {
  memoryBuckets.clear()
}

function pruneMemoryBuckets(now: number): void {
  if (memoryBuckets.size < 8_000) return
  for (const [key, bucket] of memoryBuckets) {
    if (bucket.resetAt <= now) memoryBuckets.delete(key)
  }
}

/** In-isolate limiter. Useful on Fluid Compute where one instance serves many requests. */
export function consumeMemoryRateLimit(key: string, limit: number, windowMs = WINDOW_MS): boolean {
  const now = Date.now()
  pruneMemoryBuckets(now)
  const current = memoryBuckets.get(key)
  if (!current || current.resetAt <= now) {
    memoryBuckets.set(key, { resetAt: now + windowMs, count: 1 })
    return true
  }
  current.count += 1
  return current.count <= limit
}

function rateLimitResponse(surface: ApiRateSurface): NextResponse {
  const retryAfter = "60"
  if (surface === "v1") {
    const response = NextResponse.json(
      {
        error: {
          type: "rate_limit",
          code: "rate_limit",
          message: "Too many requests",
        },
      },
      { status: 429 },
    )
    response.headers.set("Retry-After", retryAfter)
    return response
  }
  const response = NextResponse.json({ error: "Too many requests" }, { status: 429 })
  response.headers.set("Retry-After", retryAfter)
  return response
}

export function maybeRateLimitApiRequest(request: NextRequest): NextResponse | null {
  if (request.method === "OPTIONS") return null
  const surface = classifyApiRateSurface(request.nextUrl.pathname)
  if (surface === "skip") return null

  const ip = clientIpFromHeaders(request.headers)
  const write = WRITE_METHODS.has(request.method)
  const limit =
    surface === "v1" ? (write ? v1IpWriteLimit() : v1IpReadLimit()) : firstPartyIpLimit()
  const key = `${surface}:${write ? "w" : "r"}:${ip}`
  if (consumeMemoryRateLimit(key, limit)) return null
  return rateLimitResponse(surface)
}

export async function consumeApiRateLimit(
  admin: SupabaseClient,
  key: string,
  options: { limit: number; windowSeconds: number },
): Promise<boolean> {
  const { data, error } = await admin.rpc("consume_api_rate_limit", {
    p_rate_key: key,
    p_limit: options.limit,
    p_window_seconds: options.windowSeconds,
  })
  if (error) {
    if (error.code === "42883" || error.code === "PGRST202") return true
    console.warn("[api] rate limit rpc:", error.message)
    return true
  }
  return data === true
}

const WRITE_SCOPES = new Set([
  "transfers.write",
  "accounts.write",
  "customers.write",
  "destinations.write",
])

export function isV1WriteScope(scope: string): boolean {
  return WRITE_SCOPES.has(scope) || scope.endsWith(".write")
}
