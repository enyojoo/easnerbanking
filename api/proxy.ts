import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import {
  maybeRedirectApiOnlyHostToDevelopers,
  maybeRedirectJsOnlyHostToDevelopers,
  maybeRewriteApiV1ToAppApi,
  maybeRewriteJsCheckoutScript,
} from "@/lib/api-subdomain-redirect"
import { applyCorsHeaders, corsPreflightResponse, getCorsAllowedOrigins } from "@/lib/cors"
import { cronJobsEnabledOnThisProject, isScheduledCronPath } from "@/lib/api/cron-project"

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  if (isScheduledCronPath(pathname) && !cronJobsEnabledOnThisProject()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "EASNER_CRONS_ENABLED=false",
    })
  }

  const jsCheckoutRewrite = maybeRewriteJsCheckoutScript(request)
  if (jsCheckoutRewrite) return jsCheckoutRewrite

  const jsHostRedirect = maybeRedirectJsOnlyHostToDevelopers(request)
  if (jsHostRedirect) return jsHostRedirect

  const apiV1Rewrite = maybeRewriteApiV1ToAppApi(request)
  if (apiV1Rewrite) return apiV1Rewrite

  const apiHostRedirect = maybeRedirectApiOnlyHostToDevelopers(request)
  if (apiHostRedirect) return apiHostRedirect

  if (pathname.startsWith("/api/") || pathname.startsWith("/v1/")) {
    const allowed = getCorsAllowedOrigins()
    const preflight = corsPreflightResponse(request, allowed)
    if (preflight) return preflight
    const response = NextResponse.next()
    return applyCorsHeaders(response, request, allowed)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/", "/((?!_next/static|_next/image|favicon.ico).*)"],
}
