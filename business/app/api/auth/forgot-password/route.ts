import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

type Body = {
  email?: string
}

function normalizeEmail(input: unknown): string {
  if (typeof input !== "string") return ""
  return input.trim().toLowerCase()
}

function resolveResetRedirectTo(request: NextRequest): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    request.headers.get("origin")?.trim() ||
    ""
  const origin = base.replace(/\/+$/, "")
  return `${origin}/auth/reset-password`
}

/**
 * OTP password reset request.
 *
 * Always returns 200 to avoid email enumeration.
 * If the email exists, triggers a Supabase recovery OTP email.
 */
export async function POST(request: NextRequest) {
  let body: Body = {}
  try {
    body = (await request.json()) as Body
  } catch {
    body = {}
  }

  const email = normalizeEmail(body.email)
  if (!email) {
    return NextResponse.json({ ok: true }, { status: 200 })
  }

  const admin = createSupabaseAdmin()
  try {
    // Check existence without revealing it.
    const { data } = await admin.from("users").select("id").eq("email", email).limit(1).maybeSingle()
    if (data?.id) {
      const redirectTo = resolveResetRedirectTo(request)
      await admin.auth.resetPasswordForEmail(email, { redirectTo })
    }
  } catch {
    // Intentionally ignore: we never reveal whether the email exists.
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}

