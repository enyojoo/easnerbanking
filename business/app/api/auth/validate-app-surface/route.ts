import { NextResponse } from "next/server"
import { getUserFromApiRequest } from "@/lib/supabase/admin"
import { validateAppSurfaceAccess, type AppSurface } from "@/lib/auth/app-surface-access"
import { applyCorsHeaders, corsPreflightResponse, getCorsAllowedOrigins } from "@/lib/cors"

const SURFACES: AppSurface[] = ["business_web", "consumer_mobile"]

/**
 * POST body: `{ surface: "business_web" | "consumer_mobile" }`
 * Auth: Easner session cookie, Supabase cookies, or `Authorization: Bearer`.
 * Used after native Supabase sign-in from Business web or mobile (cross-origin Bearer).
 */
export async function OPTIONS(request: Request) {
  const allowed = getCorsAllowedOrigins()
  const preflight = corsPreflightResponse(request, allowed)
  if (preflight) return preflight
  return new NextResponse(null, { status: 204 })
}

export async function POST(request: Request) {
  const allowed = getCorsAllowedOrigins()
  const preflight = corsPreflightResponse(request, allowed)
  if (preflight) return preflight

  const user = await getUserFromApiRequest(request)
  if (!user) {
    const res = NextResponse.json({ ok: false, error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
    return applyCorsHeaders(res, request, allowed)
  }

  let body: { surface?: string } = {}
  try {
    body = (await request.json()) as { surface?: string }
  } catch {
    body = {}
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

  const access = await validateAppSurfaceAccess(user.id, surface)
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
