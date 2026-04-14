import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { getBusinessAppPublicOrigin } from "@/lib/business-app-public-url"

const DEFAULT_API_HOST = "api.easner.com"
const DEFAULT_BUSINESS_HOST = "business.easner.com"

/** True for Next.js Route Handlers under `/api` (including `/api` with no trailing slash). */
export function isBusinessAppApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/")
}

function normalizeHostname(value: string | undefined): string | null {
  if (!value) return null
  const h = value.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0]?.split(":")[0]
  return h || null
}

/** Hostnames seen on this request (deduped). `Host` first — it matches the URL the client used on Vercel. */
function collectHostnameCandidates(request: NextRequest): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (raw: string | undefined | null) => {
    const h = normalizeHostname(raw ?? undefined)
    if (h && !seen.has(h)) {
      seen.add(h)
      out.push(h)
    }
  }
  push(request.headers.get("host"))
  const forwarded = request.headers.get("x-forwarded-host")
  if (forwarded) {
    for (const part of forwarded.split(",")) {
      push(part.trim())
    }
  }
  push(request.nextUrl.hostname)
  return out
}

/**
 * Best hostname for host-based routing. If `x-forwarded-host` lists several hosts (common behind proxies),
 * prefer the one that matches an API-only hostname so `api.easner.com` is not mistaken for another entry.
 */
export function getRequestHostname(request: NextRequest): string {
  const candidates = collectHostnameCandidates(request)
  const apiSet = new Set(getApiOnlyHostnames().map((h) => h.toLowerCase()))
  const apiMatch = candidates.find((h) => apiSet.has(h.toLowerCase()))
  if (apiMatch) return apiMatch
  return candidates[0] ?? ""
}

/**
 * Hostnames dedicated to `/api/*` only (browser hits should go to the business origin).
 * - `EASNER_API_HOSTS` — comma-separated (e.g. `api.easner.com,www.api.easner.com`)
 * - `EASNER_API_HOST` — single host
 * - `NEXT_PUBLIC_EASNER_API_HOST` — inlined on Edge (use if middleware doesn’t see server-only env)
 */
export function getApiOnlyHostnames(): string[] {
  const list = process.env.EASNER_API_HOSTS?.split(",").map((s) => s.trim()).filter(Boolean) ?? []
  const single = process.env.EASNER_API_HOST?.trim()
  const pub = process.env.NEXT_PUBLIC_EASNER_API_HOST?.trim()
  const merged = [...list, single || "", pub || ""]
    .map((s) => normalizeHostname(s))
    .filter((h): h is string => Boolean(h))
  const unique = [...new Set(merged)]
  /** Always include the production API host so redirects still run when env lists only alternates (e.g. staging-only). */
  return [...new Set([...unique, DEFAULT_API_HOST])]
}

export function isApiOnlyHostname(hostname: string): boolean {
  if (!hostname) return false
  return getApiOnlyHostnames().includes(hostname.toLowerCase())
}

/** Where browser users land when they open a non-API path on the API host. */
export function getBusinessWebOriginForApiHostRedirect(): string {
  const fromEnv = getBusinessAppPublicOrigin()
  if (fromEnv) return fromEnv.replace(/\/$/, "")
  const fallback = process.env.EASNER_BUSINESS_PUBLIC_ORIGIN?.trim()
  if (fallback) {
    try {
      return new URL(fallback.startsWith("http") ? fallback : `https://${fallback}`).origin
    } catch {
      return fallback.replace(/\/$/, "")
    }
  }
  return `https://${DEFAULT_BUSINESS_HOST}`
}

/**
 * If the request hits the API-only host with a path that is not an API route (and not Next internals),
 * send users to the business web app on the same path (so deep links can be preserved when useful).
 */
export function maybeRedirectApiHostToBusiness(request: NextRequest): NextResponse | null {
  const pathname = request.nextUrl.pathname
  if (isBusinessAppApiPath(pathname)) return null
  if (pathname.startsWith("/_next")) return null

  const host = getRequestHostname(request)
  if (!host || !isApiOnlyHostname(host)) return null

  let origin = getBusinessWebOriginForApiHostRedirect().replace(/\/$/, "")
  try {
    const businessHost = new URL(origin).hostname.toLowerCase()
    if (businessHost === host) {
      origin = `https://${DEFAULT_BUSINESS_HOST}`
    }
  } catch {
    origin = `https://${DEFAULT_BUSINESS_HOST}`
  }

  const target = `${origin}${pathname}${request.nextUrl.search}`
  const res = NextResponse.redirect(target, 307)
  res.headers.set("Cache-Control", "private, no-store")
  return res
}
