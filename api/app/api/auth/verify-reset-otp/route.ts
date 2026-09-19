import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import jwt from "jsonwebtoken"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

type Body = {
  email?: string
  otp?: string
}

type ResetClaims = {
  purpose: "password_reset"
  email: string
}

function normalizeEmail(input: unknown): string {
  if (typeof input !== "string") return ""
  return input.trim().toLowerCase()
}

function normalizeOtp(input: unknown): string {
  if (typeof input !== "string") return ""
  return input.replace(/\D/g, "").slice(0, 6)
}

function requireJwtSecret(): string {
  const s = process.env.JWT_SECRET
  if (!s) throw new Error("JWT_SECRET is required")
  return s
}

export async function POST(request: NextRequest) {
  let body: Body = {}
  try {
    body = (await request.json()) as Body
  } catch {
    body = {}
  }

  const email = normalizeEmail(body.email)
  const otp = normalizeOtp(body.otp)
  if (!email || otp.length !== 6) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { error: verifyErr } = await admin.auth.verifyOtp({
    email,
    token: otp,
    type: "recovery",
  })
  if (verifyErr) {
    return NextResponse.json({ ok: false, error: "Invalid or expired verification code." }, { status: 401 })
  }

  const secret = requireJwtSecret()
  const resetToken = jwt.sign({ purpose: "password_reset", email } satisfies ResetClaims, secret, {
    algorithm: "HS256",
    expiresIn: "15m",
  })

  return NextResponse.json({ ok: true, resetToken }, { status: 200 })
}

