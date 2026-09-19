import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { applyCorsHeaders, corsPreflightResponse, getCorsAllowedOrigins } from "@/lib/cors"
import { requestAppDownloadLinkEmail } from "@/lib/marketing/app-download-link"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

type Body = {
  email?: string
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown"
  }
  return request.headers.get("x-real-ip") ?? "unknown"
}

/**
 * Public endpoint for easner.com “Get the app” popup email capture.
 *
 * POST { "email": "visitor@example.com" }
 * → sends `appDownloadLink` template from noreply@easner.com
 */
export async function OPTIONS(request: NextRequest) {
  const allowed = getCorsAllowedOrigins()
  const preflight = corsPreflightResponse(request, allowed)
  if (preflight) return preflight
  return new NextResponse(null, { status: 204 })
}

export async function POST(request: NextRequest) {
  const allowed = getCorsAllowedOrigins()
  const preflight = corsPreflightResponse(request, allowed)
  if (preflight) return preflight

  const respond = (status: number, payload: Record<string, unknown>) =>
    applyCorsHeaders(NextResponse.json(payload, { status }), request, allowed)

  let body: Body = {}
  try {
    body = (await request.json()) as Body
  } catch {
    body = {}
  }

  const admin = createSupabaseAdmin()
  const result = await requestAppDownloadLinkEmail({
    admin,
    email: body.email ?? "",
    clientIp: getClientIp(request),
  })

  if (!result.ok) {
    const status = result.code === "RATE_LIMITED" ? 429 : 200
    return respond(status, {
      ok: false,
      code: result.code,
      error: result.error,
    })
  }

  return respond(200, { ok: true })
}
