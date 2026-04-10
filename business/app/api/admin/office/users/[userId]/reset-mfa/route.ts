import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { logAdminAction } from "@/lib/admin-audit"

type FactorRow = { id: string; factor_type?: string; status?: string }

function factorsFromListPayload(data: unknown): FactorRow[] {
  if (!data || typeof data !== "object") return []
  const d = data as { all?: FactorRow[]; factors?: FactorRow[]; totp?: FactorRow[] }
  if (Array.isArray(d.all)) return d.all
  if (Array.isArray(d.factors)) return d.factors
  if (Array.isArray(d.totp)) return d.totp
  return []
}

/**
 * Office support: remove all TOTP (authenticator) factors for a user so they can sign in with
 * password only and re-enroll MFA. Requires staff JWT + `admin_users` row.
 * Uses Supabase Auth Admin MFA APIs (service role).
 */
export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const { userId: targetUserId } = await params
  if (!targetUserId || typeof targetUserId !== "string") {
    return NextResponse.json({ error: "Missing user id" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const mfa = admin.auth.admin.mfa as
    | {
        listFactors: (args: { userId: string }) => Promise<{ data: unknown; error: { message: string } | null }>
        deleteFactor: (args: { id: string; userId: string }) => Promise<{ error: { message: string } | null }>
      }
    | undefined

  if (!mfa?.listFactors || !mfa.deleteFactor) {
    return NextResponse.json(
      { error: "Supabase client does not expose auth.admin.mfa (upgrade @supabase/supabase-js)" },
      { status: 501 },
    )
  }

  const { data: listData, error: listErr } = await mfa.listFactors({ userId: targetUserId })
  if (listErr) {
    return NextResponse.json({ error: listErr.message }, { status: 500 })
  }

  const factors = factorsFromListPayload(listData)
  const totpFactors = factors.filter((f) => (f.factor_type ?? "totp") === "totp" || !f.factor_type)

  if (totpFactors.length === 0) {
    await logAdminAction(auth.ctx.userId, "auth.mfa_reset", targetUserId, { removed: 0, note: "no_factors" })
    return NextResponse.json({ ok: true, removed: 0, message: "No authenticator factors on this account." })
  }

  let removed = 0
  const errors: string[] = []
  for (const f of totpFactors) {
    const { error: delErr } = await mfa.deleteFactor({ id: f.id, userId: targetUserId })
    if (delErr) {
      errors.push(`${f.id}: ${delErr.message}`)
    } else {
      removed++
    }
  }

  await logAdminAction(auth.ctx.userId, "auth.mfa_reset", targetUserId, {
    removed,
    factorIds: totpFactors.map((x) => x.id),
    errors: errors.length ? errors : undefined,
  })

  if (errors.length > 0 && removed === 0) {
    return NextResponse.json({ error: errors.join("; ") }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    removed,
    partialErrors: errors.length ? errors : undefined,
    message:
      removed > 0
        ? "Authenticator factors removed. User sessions may be invalidated; they can sign in with password and set up MFA again."
        : undefined,
  })
}
