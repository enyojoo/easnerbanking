import { NextResponse } from "next/server"
import { noahFetch } from "@/lib/noah/http"
import { mapNoahTransactionToMobileItem } from "@/lib/noah/map-transactions"
import { requireAuth, requireNoahEnv, resolveNoahContextAsync } from "../_helpers"

type TxResp = { Items?: Array<Record<string, unknown>>; PageToken?: string }

export async function GET(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth
  const ctx = await resolveNoahContextAsync(user.id, request)
  if (!ctx.ok) return ctx.response
  const { noahCustomerId } = ctx

  const url = new URL(request.url)
  const limitRaw = url.searchParams.get("limit")
  const pageSize = Math.min(100, Math.max(1, parseInt(limitRaw || "20", 10)))

  try {
    const collected: Array<Record<string, unknown>> = []
    let token: string | undefined
    for (let i = 0; i < 15 && collected.length < pageSize; i++) {
      const data = await noahFetch<TxResp>({
        method: "GET",
        path: "/transactions",
        query: {
          PageSize: Math.min(50, pageSize),
          SortDirection: "DESC",
          ...(token ? { PageToken: token } : {}),
        },
      })
      for (const tx of data.Items ?? []) {
        if (String(tx.CustomerID ?? "") !== noahCustomerId) continue
        collected.push(tx)
        if (collected.length >= pageSize) break
      }
      token = data.PageToken
      if (!token || (data.Items ?? []).length === 0) break
    }

    const transactions = collected.slice(0, pageSize).map((tx) => mapNoahTransactionToMobileItem(tx))

    return NextResponse.json({ transactions })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg, transactions: [] }, { status: 400 })
  }
}
