import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import jwt from "jsonwebtoken"
import { createClient } from "@supabase/supabase-js"
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

function createSupabaseOtpVerifyClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
  return createClient(url, key)
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

  const otpClient = createSupabaseOtpVerifyClient()
  const candidateTypes = ["recovery", "email", "magiclink"] as const

  let lastErr: { message?: string; name?: string; status?: number } | null = null
  let verifiedType: (typeof candidateTypes)[number] | null = null
  const attempts: Array<{ type: (typeof candidateTypes)[number]; ok: boolean; message?: string; status?: number }> = []

  for (const type of candidateTypes) {
    const { error } = await otpClient.auth.verifyOtp({ email, token: otp, type })
    if (!error) {
      verifiedType = type
      lastErr = null
      attempts.push({ type, ok: true })
      break
    }
    lastErr = {
      message: error.message,
      name: (error as unknown as { name?: string }).name,
      status: (error as unknown as { status?: number }).status,
    }
    attempts.push({ type, ok: false, message: error.message, status: (error as unknown as { status?: number }).status })
  }

  if (!verifiedType) {
    console.warn("[verify-reset-otp] verifyOtp failed", {
      email,
      otpLen: otp.length,
      attempts,
      ...lastErr,
    })
    return NextResponse.json(
      {
        ok: false,
        error:
          process.env.NODE_ENV === "production"
            ? "Invalid or expired verification code."
            : lastErr?.message || "Invalid or expired verification code.",
      },
      { status: 401 },
    )
  }

  if (process.env.NODE_ENV !== "production") {
    console.info("[verify-reset-otp] verified", { type: verifiedType, attempts })
  }

  // Keep using service role for minting our reset token (no Supabase session needed).
  // Also ensures env validation remains consistent with other auth routes.
  createSupabaseAdmin()
  const secret = requireJwtSecret()
  const resetToken = jwt.sign({ purpose: "password_reset", email } satisfies ResetClaims, secret, {
    algorithm: "HS256",
    expiresIn: "15m",
  })

  return NextResponse.json({ ok: true, resetToken }, { status: 200 })
}

