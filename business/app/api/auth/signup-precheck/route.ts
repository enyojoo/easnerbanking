import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  resolveSignupEmailBlock,
  resolveSignupExistingAccountBlock,
  type SignupAuthSurface,
  type SignupExistingRole,
} from "@easner/shared"
import { applyCorsHeaders, corsPreflightResponse, getCorsAllowedOrigins } from "@/lib/cors"
import { readPlatformAccess, registrationClosedBlock } from "@/lib/platform-access"

const SURFACES: SignupAuthSurface[] = ["business_web", "consumer_mobile"]

type PrecheckBody = {
  email?: string
  surface?: string
}

/** Escape `%` / `_` so ilike matches the email literally (case-insensitive). */
function emailIlikePattern(email: string): string {
  return email.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")
}

/**
 * Pre-sign-up gate (called BEFORE `supabase.auth.signUp`, so it needs no session).
 *
 * Blocks early, with clear messaging, instead of advancing to OTP:
 *  1. Office registration closed for this product surface.
 *  2. Disposable / throwaway email domains and Apple Hide My Email relay addresses.
 *  3. An email already registered on this product → "Please sign in instead."
 *  4. An email already registered on the other product (Business ↔ Mobile share one
 *     Supabase project; role lives in `public.users`).
 *  5. A hard-closed account → contact support (not "sign in").
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
  const surface = SURFACES.includes(surfaceRaw as SignupAuthSurface)
    ? (surfaceRaw as SignupAuthSurface)
    : null

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !surface) {
    // Invalid input – let the client-side form validation handle it; don't block.
    return respond(200, { ok: true })
  }

  const admin = createSupabaseAdmin()
  const closed = registrationClosedBlock(await readPlatformAccess(admin), surface)
  if (closed) {
    return respond(200, {
      ok: false,
      code: closed.code,
      error: closed.error,
    })
  }

  const emailBlock = resolveSignupEmailBlock(email)
  if (emailBlock) {
    return respond(200, {
      ok: false,
      code: emailBlock.code,
      error: emailBlock.error,
    })
  }

  const { data: existing, error: lookupError } = await admin
    .from("users")
    .select("role,deleted_at")
    .ilike("email", emailIlikePattern(email))
    .maybeSingle()

  if (lookupError) {
    console.warn("[signup-precheck] users lookup failed:", lookupError.message)
    // Fail open – client + Supabase duplicate fallbacks still cover confirmed accounts.
    return respond(200, { ok: true })
  }

  if (!existing) {
    return respond(200, { ok: true })
  }

  if (existing.deleted_at) {
    return respond(200, {
      ok: false,
      code: "ACCOUNT_CLOSED",
      error:
        "This account has been closed. Contact support@easner.com if you need help restoring access.",
    })
  }

  const existingRole: SignupExistingRole | null =
    existing.role === "business" || existing.role === "individual" ? existing.role : null

  if (existingRole) {
    const block = resolveSignupExistingAccountBlock({ surface, existingRole })
    return respond(200, {
      ok: false,
      code: block.code,
      ...(block.otherSurface ? { otherSurface: block.otherSurface } : {}),
      error: block.error,
    })
  }

  // Row exists without a normalized role – still an account; ask them to sign in.
  const block = resolveSignupExistingAccountBlock({
    surface,
    existingRole: surface === "business_web" ? "business" : "individual",
  })
  return respond(200, {
    ok: false,
    code: block.code,
    error: block.error,
  })
}
