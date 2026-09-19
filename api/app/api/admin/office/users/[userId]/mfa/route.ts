import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"

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
 * Office: whether the user has enrolled TOTP (authenticator app) MFA.
 * Used to show/hide "Reset MFA" in the user detail dialog.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const auth = await requireOfficeAdmin(_request)
  if (!auth.ok) return auth.response

  const { userId: targetUserId } = await params
  if (!targetUserId || typeof targetUserId !== "string") {
    return NextResponse.json({ error: "Missing user id" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const mfa = admin.auth.admin.mfa as
    | {
        listFactors: (args: { userId: string }) => Promise<{ data: unknown; error: { message: string } | null }>
      }
    | undefined

  if (!mfa?.listFactors) {
    return NextResponse.json({ hasTotp: false, unsupported: true })
  }

  const { data: listData, error: listErr } = await mfa.listFactors({ userId: targetUserId })
  if (listErr) {
    return NextResponse.json({ error: listErr.message }, { status: 500 })
  }

  const factors = factorsFromListPayload(listData)
  const totpFactors = factors.filter((f) => (f.factor_type ?? "totp") === "totp" || !f.factor_type)

  return NextResponse.json({ hasTotp: totpFactors.length > 0 })
}
