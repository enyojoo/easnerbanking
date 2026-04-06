import { NextResponse } from "next/server"
import { noahFetch } from "@/lib/noah/http"
import { pickTxAmountAndCurrency } from "@/lib/noah/map-transactions"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireAuth, requireNoahEnv, resolveNoahContextAsync } from "../../_helpers"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"

type Props = { params: Promise<{ transferId: string }> }

/** Treat transfer id as Noah transaction id (UUID). */
export async function GET(request: Request, routeCtx: Props) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth
  const noahCtx = await resolveNoahContextAsync(user.id, request)
  if (!noahCtx.ok) return noahCtx.response
  const { noahCustomerId } = noahCtx

  const { transferId } = await routeCtx.params
  if (!transferId) {
    return NextResponse.json({ error: "Missing transfer id" }, { status: 400 })
  }

  try {
    const tx = await noahFetch<Record<string, unknown>>({
      method: "GET",
      path: `/transactions/${encodeURIComponent(transferId)}`,
    })
    if (String(tx.CustomerID ?? "") !== noahCustomerId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    const { amount, currency } = pickTxAmountAndCurrency(tx)
    const id = String(tx.ID ?? transferId)
    const st = String(tx.Status ?? "")
    const status = st.toLowerCase()
    const admin = createSupabaseAdmin()
    let txUserId = user.id
    const businessId = noahCtx.businessId
    if (noahCtx.scope === "business" && noahCtx.businessId) {
      const owner = await resolveBusinessOrgOwnerUserId(admin, noahCtx.businessId)
      if (owner) txUserId = owner
    }
    await admin.from("transactions").upsert(
      {
        user_id: txUserId,
        business_id: businessId,
        noah_transaction_id: id,
        provider: "noah",
        status,
        amount,
        currency,
        direction: "out",
        payload: tx,
        metadata: {
          source: "api_noah_transfers_status",
        },
      },
      { onConflict: "provider,noah_transaction_id" },
    )
    return NextResponse.json({
      id,
      transaction_id: id,
      amount: String(amount),
      currency: currency.toLowerCase(),
      status,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("404") || /not found/i.test(msg)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
