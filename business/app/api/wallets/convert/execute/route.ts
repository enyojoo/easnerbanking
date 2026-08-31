import { NextResponse } from "next/server"
import { requireAuth } from "@/app/api/noah/_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { isRelayConfigured } from "@/lib/relay/config"
import { executeBalanceConvert } from "@/lib/balance-convert/execute-convert"
import { resolveWalletOwnerIdForEasnerContext } from "@/lib/wallet/resolve-wallet-owner"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  if (!isRelayConfigured()) {
    return NextResponse.json({ error: "relay_not_configured" }, { status: 503 })
  }

  const acc = await resolveNoahAccountContext(request, auth.user.id, undefined, "write")
  if (!acc.ok) return acc.response

  const body = (await request.json().catch(() => null)) as { sessionId?: string } | null
  const sessionId = String(body?.sessionId || "").trim()
  if (!sessionId) return NextResponse.json({ error: "sessionId_required" }, { status: 400 })

  const admin = createSupabaseAdmin()
  const ownerId = await resolveWalletOwnerIdForEasnerContext(admin, acc.ctx)
  if (!ownerId) return NextResponse.json({ error: "no_wallet_owner" }, { status: 404 })

  const { data: owner } = await admin
    .from("wallet_owners")
    .select("turnkey_sub_organization_id")
    .eq("id", ownerId)
    .maybeSingle()

  const subOrgId = String(owner?.turnkey_sub_organization_id || "").trim()
  if (!subOrgId) return NextResponse.json({ error: "no_turnkey_suborg" }, { status: 404 })

  const result = await executeBalanceConvert({
    admin,
    ctx: acc.ctx,
    userId: auth.user.id,
    businessId: acc.ctx.subjectBusinessId,
    sessionId,
    subOrganizationId: subOrgId,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }
  return NextResponse.json({ ok: true, ...result })
}
