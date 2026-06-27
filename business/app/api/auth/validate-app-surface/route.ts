import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { validateAppSurfaceAccess, type AppSurface } from "@/lib/auth/app-surface-access"
import { applyCorsHeaders, corsPreflightResponse, getCorsAllowedOrigins } from "@/lib/cors"

const SURFACES: AppSurface[] = ["business_web", "consumer_mobile"]

type SurfaceBody = {
  surface?: string
  /** Prefer body over `Authorization` on web: long JWT in headers can trigger 494 (header too large). */
  accessToken?: string
}

/**
 * POST body: `{ surface: "business_web" | "consumer_mobile", accessToken?: string }`
 * Auth: Easner session cookie, Supabase cookies, `Authorization: Bearer`, or `accessToken` in JSON body.
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

  let body: SurfaceBody = {}
  try {
    body = (await request.json()) as SurfaceBody
  } catch {
    body = {}
  }

  let user = await getUserFromApiRequest(request)
  if (!user) {
    const raw = typeof body.accessToken === "string" ? body.accessToken.trim() : ""
    if (raw) {
      const admin = createSupabaseAdmin()
      const { data, error } = await admin.auth.getUser(raw)
      if (!error && data.user) user = data.user
    }
  }
  if (!user) {
    const res = NextResponse.json({ ok: false, error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
    return applyCorsHeaders(res, request, allowed)
  }

  const surfaceRaw = typeof body.surface === "string" ? body.surface.trim() : ""
  const surface = SURFACES.includes(surfaceRaw as AppSurface) ? (surfaceRaw as AppSurface) : null
  if (!surface) {
    const res = NextResponse.json(
      { ok: false, error: "Invalid or missing surface.", code: "INVALID_SURFACE" },
      { status: 400 },
    )
    return applyCorsHeaders(res, request, allowed)
  }

  const access = await validateAppSurfaceAccess(user.id, surface, user.email)
  if (!access.ok) {
    const res = NextResponse.json(
      { ok: false, error: access.message, code: access.code },
      { status: access.status },
    )
    return applyCorsHeaders(res, request, allowed)
  }

  const res = NextResponse.json({ ok: true })
  return applyCorsHeaders(res, request, allowed)
}
