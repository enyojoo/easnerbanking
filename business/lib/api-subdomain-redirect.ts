import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { getBusinessAppPublicOrigin } from "@/lib/business-app-public-url"

const DEFAULT_API_HOST = "api.easner.com"
const DEFAULT_BUSINESS_HOST = "business.easner.com"

function normalizeHostname(value: string | undefined): string | null {
  if (!value) return null
  const h = value.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0]?.split(":")[0]
  return h || null
}

/** Vercel / proxies often set this; `Host` alone can be wrong in some setups. */
export function getRequestHostname(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-host")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim()
    const h = normalizeHostname(first)
    if (h) return h
  }
  return normalizeHostname(request.headers.get("host") ?? undefined) ?? ""
}

/**
 * Hostnames dedicated to `/api/*` only (browser hits should go to the business origin).
 * - `EASNER_API_HOSTS` — comma-separated (e.g. `api.easner.com,www.api.easner.com`)
 * - `EASNER_API_HOST` — single host
 * - `NEXT_PUBLIC_EASNER_API_HOST` — inlined on Edge (use if proxy doesn’t see server-only env)
 */
export function getApiOnlyHostnames(): string[] {
  const list = process.env.EASNER_API_HOSTS?.split(",").map((s) => s.trim()).filter(Boolean) ?? []
  const single = process.env.EASNER_API_HOST?.trim()
  const pub = process.env.NEXT_PUBLIC_EASNER_API_HOST?.trim()
  const merged = [...list, single || "", pub || ""]
    .map((s) => normalizeHostname(s))
    .filter((h): h is string => Boolean(h))
  const unique = [...new Set(merged)]
  if (unique.length > 0) return unique
  return [DEFAULT_API_HOST]
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
  if (pathname.startsWith("/api/")) return null
  if (pathname.startsWith("/_next/")) return null

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
  return NextResponse.redirect(target, 307)
}
