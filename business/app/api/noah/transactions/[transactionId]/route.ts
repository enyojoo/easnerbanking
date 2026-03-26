import { NextResponse } from "next/server"
import { noahFetch } from "@/lib/noah/http"
import { mapNoahTransactionToMobileDetail } from "@/lib/noah/map-transactions"
import { requireAuth, requireNoahEnv, resolveNoahContext } from "../../_helpers"

type Props = { params: Promise<{ transactionId: string }> }

export async function GET(request: Request, routeCtx: Props) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth
  const noahCtx = resolveNoahContext(user.id, request)
  const { noahCustomerId } = noahCtx

  const { transactionId } = await routeCtx.params
  if (!transactionId) {
    return NextResponse.json({ error: "Missing transaction id" }, { status: 400 })
  }

  try {
    const tx = await noahFetch<Record<string, unknown>>({
      method: "GET",
      path: `/transactions/${encodeURIComponent(transactionId)}`,
    })
    if (String(tx.CustomerID ?? "") !== noahCustomerId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    return NextResponse.json({ transaction: mapNoahTransactionToMobileDetail(tx) })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("404") || /not found/i.test(msg)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
