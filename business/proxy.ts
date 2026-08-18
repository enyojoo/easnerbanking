import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { maybeRedirectApiHostToBusiness } from "@/lib/api-subdomain-redirect"
import { applyCorsHeaders, corsPreflightResponse, getCorsAllowedOrigins } from "@/lib/cors"
import {
  maybeRedirectCustomerHostRootToBusiness,
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

  /** `api.*` domain: only `/api/*` is meant for clients; send browsers to the business web origin. */
  const apiHostRedirect = maybeRedirectApiHostToBusiness(request)
  if (apiHostRedirect) return apiHostRedirect

  /** Bare invoice/pay hosts are not customer pages. */
  const customerRootRedirect = maybeRedirectCustomerHostRootToBusiness(request)
  if (customerRootRedirect) return customerRootRedirect

  /** Customer hosts (invoice.easner.com, pay.easner.com) share this app. */
  const customerHostRewrite = maybeRewriteCustomerHost(request)
  if (customerHostRewrite) return customerHostRewrite

  // Browser calls from Easner Office (different origin) need CORS on API responses.
  if (pathname.startsWith("/api/")) {
    const allowed = getCorsAllowedOrigins()
    const preflight = corsPreflightResponse(request, allowed)
    if (preflight) return preflight
    const response = NextResponse.next()
    return applyCorsHeaders(response, request, allowed)
  }

  const response = NextResponse.next()

  // Set business owner IP when they visit invoicing or customer settings
  if (pathname.startsWith("/invoices") || pathname.startsWith("/settings")) {
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
