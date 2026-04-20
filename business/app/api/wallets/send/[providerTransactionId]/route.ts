import { NextResponse } from "next/server"
import { requireAuth, requireNoahEnv } from "@/app/api/noah/_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { reconcileTurnkeySendStatus } from "@/lib/turnkey/send"

type Props = { params: Promise<{ providerTransactionId: string }> }

export async function GET(request: Request, routeCtx: Props) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const accountCtx = await resolveNoahAccountContext(request, auth.user.id)
  if (!accountCtx.ok) return accountCtx.response

  const { providerTransactionId } = await routeCtx.params
  const id = String(providerTransactionId || "").trim()
  if (!id) return NextResponse.json({ error: "Missing provider transaction id" }, { status: 400 })

  const admin = createSupabaseAdmin()
  const { data: tx } = await admin
    .from("transactions")
    .select("id, user_id, business_id, metadata")
    .eq("provider", "turnkey")
    .eq("provider_transaction_id", id)
    .maybeSingle()
  if (!tx?.id) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const scopeBusinessId = accountCtx.ctx.subjectBusinessId
  if (scopeBusinessId) {
    if (String(tx.business_id || "") !== scopeBusinessId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
  } else if (String(tx.user_id || "") !== accountCtx.ctx.subjectUserId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const metadata = (tx.metadata || {}) as Record<string, unknown>
  const subOrgId = String(metadata.turnkey_sub_org_id || "").trim()
  if (!subOrgId) {
    return NextResponse.json({ status: "pending" })
  }

  const status = await reconcileTurnkeySendStatus(admin, { subOrgId, providerTransactionId: id })
  return NextResponse.json({ status: status.status, tx_hash: status.txHash })
}
