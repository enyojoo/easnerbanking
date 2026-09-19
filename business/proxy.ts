import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import {
  maybeRedirectApiOnlyHostToDevelopers,
  maybeRedirectJsOnlyHostToDevelopers,
  maybeRewriteApiV1ToAppApi,
  maybeRewriteJsCheckoutScript,
} from "@/lib/api-subdomain-redirect"
import { applyCorsHeaders, corsPreflightResponse, getCorsAllowedOrigins } from "@/lib/cors"
import {
  maybeRedirectCustomerHostRootToMarketing,
  maybeRewriteCustomerHost,
} from "@/lib/customer-host-routing"

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown"
  }
  return request.headers.get("x-real-ip") ?? "unknown"
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  /** Versioned embed first so `/v1/checkout.js` is not treated as an API path. */
  const jsCheckoutRewrite = maybeRewriteJsCheckoutScript(request)
  if (jsCheckoutRewrite) return jsCheckoutRewrite

  /** `js.*` in a browser → marketing developers page; embed paths stay. */
  const jsHostRedirect = maybeRedirectJsOnlyHostToDevelopers(request)
  if (jsHostRedirect) return jsHostRedirect

  /** `/v1/*` is the public Checkout API; rewrite onto `/api/v1/*`. */
  const apiV1Rewrite = maybeRewriteApiV1ToAppApi(request)
  if (apiV1Rewrite) return apiV1Rewrite

  /** `api.*` in a browser → marketing developers page; `/api/*` stays. */
  const apiHostRedirect = maybeRedirectApiOnlyHostToDevelopers(request)
  if (apiHostRedirect) return apiHostRedirect

  /** Bare invoice/pay hosts are not customer pages. */
  const customerRootRedirect = maybeRedirectCustomerHostRootToMarketing(request)
  if (customerRootRedirect) return customerRootRedirect

  /** Customer hosts (invoice.easner.com, pay.easner.com) share this app. */
  const customerHostRewrite = maybeRewriteCustomerHost(request)
  if (customerHostRewrite) return customerHostRewrite

  // Browser calls from Easner Office (different origin) need CORS on API responses.
  if (pathname.startsWith("/api/") || pathname.startsWith("/v1/")) {
    const allowed = getCorsAllowedOrigins()
    const preflight = corsPreflightResponse(request, allowed)
    if (preflight) return preflight
    const response = NextResponse.next()
    return applyCorsHeaders(response, request, allowed)
  }

  const response = NextResponse.next()

  // Set business owner IP when they visit invoicing or customer settings.
  // Document requests only: a Set-Cookie on RSC/prefetch responses makes them
  // uncacheable, which defeats router prefetching for these routes.
  const isRscRequest =
    request.headers.get("rsc") === "1" || request.headers.get("next-router-prefetch") === "1"
  if (!isRscRequest && (pathname.startsWith("/invoices") || pathname.startsWith("/settings"))) {
    const ip = getClientIp(request)
    response.cookies.set("easner_business_owner_ip", ip, {
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours
      sameSite: "lax",
    })
  }

  return response
}

export const config = {
  matcher: [
    "/",
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
}
