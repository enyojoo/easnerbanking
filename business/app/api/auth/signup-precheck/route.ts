import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { resolveSignupEmailBlock } from "@easner/shared"
import { applyCorsHeaders, corsPreflightResponse, getCorsAllowedOrigins } from "@/lib/cors"

type Surface = "business_web" | "consumer_mobile"
const SURFACES: Surface[] = ["business_web", "consumer_mobile"]

type PrecheckBody = {
  email?: string
  surface?: string
}

/**
 * Pre-sign-up gate (called BEFORE `supabase.auth.signUp`, so it needs no session).
 *
 * Blocks early, with clear messaging, instead of failing late after OTP:
 *  1. Disposable / throwaway email domains and Apple Hide My Email relay addresses.
 *  2. An email already registered on the *other* product surface (business vs mobile share one
 *     Supabase project; role lives in `public.users`). Same-surface existing accounts are left to the
 *     normal sign-in/OTP flow to avoid widening account-enumeration beyond the cross-surface case.
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

  let body: PrecheckBody = {}
  try {
    body = (await request.json()) as PrecheckBody
  } catch {
    body = {}
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const surfaceRaw = typeof body.surface === "string" ? body.surface.trim() : ""
  const surface = SURFACES.includes(surfaceRaw as Surface) ? (surfaceRaw as Surface) : null

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !surface) {
    // Invalid input — let the client-side form validation handle it; don't block.
    return respond(200, { ok: true })
  }

  const emailBlock = resolveSignupEmailBlock(email)
  if (emailBlock) {
    return respond(200, {
      ok: false,
      code: emailBlock.code,
      error: emailBlock.error,
    })
  }

  const admin = createSupabaseAdmin()
  const { data: existing } = await admin
    .from("users")
    .select("role")
    .eq("email", email)
    .maybeSingle()

  const existingRole = existing?.role === "business" || existing?.role === "individual" ? existing.role : null

  if (existingRole) {
    const onBusiness = existingRole === "business"
    const wantsBusiness = surface === "business_web"
    if (onBusiness !== wantsBusiness) {
      return respond(200, {
        ok: false,
        code: "EMAIL_REGISTERED_OTHER_SURFACE",
        otherSurface: onBusiness ? "business_web" : "consumer_mobile",
        error: onBusiness
          ? "This email is already registered for Easner Business. Sign in at business.easner.com, or use a different email."
          : "This email is already registered for Easner Mobile. Sign in through the Easner mobile app, or use a different email.",
      })
    }
  }

  return respond(200, { ok: true })
}
