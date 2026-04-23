import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import jwt from "jsonwebtoken"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

type Body = {
  token?: string
  email?: string
  newPassword?: string
}

type ResetClaims = {
  purpose: "password_reset"
  email: string
}

function normalizeEmail(input: unknown): string {
  if (typeof input !== "string") return ""
  return input.trim().toLowerCase()
}

function requireJwtSecret(): string {
  const s = process.env.JWT_SECRET
  if (!s) throw new Error("JWT_SECRET is required")
  return s
}

async function findAuthUserIdByEmail(admin: ReturnType<typeof createSupabaseAdmin>, email: string): Promise<string | null> {
  // As specified: listUsers + find. Keep perPage high to reduce pagination.
  let page = 1
  const perPage = 1000
  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error || !data?.users) return null
    const match = data.users.find((u) => (u.email || "").toLowerCase() === email)
    if (match?.id) return match.id
    if (data.users.length < perPage) break
    page += 1
  }
  return null
}

export async function POST(request: NextRequest) {
  let body: Body = {}
  try {
    body = (await request.json()) as Body
  } catch {
    body = {}
  }

  const token = typeof body.token === "string" ? body.token.trim() : ""
  const email = normalizeEmail(body.email)
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : ""

  if (!token || !email || !newPassword) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 })
  }

  let decoded: ResetClaims
  try {
    decoded = jwt.verify(token, requireJwtSecret(), { algorithms: ["HS256"] }) as ResetClaims
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid or expired reset token." }, { status: 401 })
  }

  if (decoded?.purpose !== "password_reset" || normalizeEmail(decoded.email) !== email) {
    return NextResponse.json({ ok: false, error: "Invalid reset token." }, { status: 401 })
  }

  const admin = createSupabaseAdmin()
  const userId = await findAuthUserIdByEmail(admin, email)
  if (!userId) {
    return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 })
  }

  const { error: updErr } = await admin.auth.admin.updateUserById(userId, { password: newPassword })
  if (updErr) {
    return NextResponse.json({ ok: false, error: "Failed to reset password." }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}

