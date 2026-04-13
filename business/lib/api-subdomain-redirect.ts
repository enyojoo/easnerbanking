import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { getBusinessAppPublicOrigin } from "@/lib/business-app-public-url"

/**
 * Hostname dedicated to `/api/*` (e.g. Expo `EXPO_PUBLIC_API_URL`).
 * Override per environment with `EASNER_API_HOST` (no scheme, no path).
 */
export function getApiOnlyCanonicalHost(): string {
  const raw = process.env.EASNER_API_HOST?.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0]
  return raw || "api.easner.com"
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
  return "https://business.easner.com"
}

/**
 * If the request hits the API-only host with a path that is not an API route (and not Next internals),
 * send users to the business web app on the same path (so deep links can be preserved when useful).
 */
export function maybeRedirectApiHostToBusiness(request: NextRequest): NextResponse | null {
  const pathname = request.nextUrl.pathname
  if (pathname.startsWith("/api/")) return null
  if (pathname.startsWith("/_next/")) return null

  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase() ?? ""
  const apiHost = getApiOnlyCanonicalHost()
  if (!host || host !== apiHost) return null

  const origin = getBusinessWebOriginForApiHostRedirect()
  const target = `${origin}${pathname}${request.nextUrl.search}`
  return NextResponse.redirect(target, 307)
}
