import { NextResponse } from "next/server"
import { noahFetch } from "@/lib/noah/http"
import { pickTxAmountAndCurrency } from "@/lib/noah/map-transactions"
import { requireAuth, requireNoahEnv, resolveNoahContext } from "../../_helpers"

type Props = { params: Promise<{ transferId: string }> }

/** Treat transfer id as Noah transaction id (UUID). */
export async function GET(request: Request, routeCtx: Props) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth
  const noahCtx = resolveNoahContext(user.id, request)
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
    return NextResponse.json({
      id,
      transaction_id: id,
      amount: String(amount),
      currency: currency.toLowerCase(),
      status: st.toLowerCase(),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("404") || /not found/i.test(msg)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
