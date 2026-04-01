import { NextResponse } from "next/server"
import { noahFetch } from "@/lib/noah/http"
import { pickTxAmountAndCurrency } from "@/lib/noah/map-transactions"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireAuth, requireNoahEnv, resolveNoahContext } from "../_helpers"

type TxResp = { Items?: Array<Record<string, unknown>>; PageToken?: string }

export async function POST(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth
  const ctx = resolveNoahContext(user.id, request)
  const { noahCustomerId } = ctx
  const admin = createSupabaseAdmin()

  try {
    let synced = 0
    let token: string | undefined
    for (let i = 0; i < 10; i++) {
      const data = await noahFetch<TxResp>({
        method: "GET",
        path: "/transactions",
        query: { PageSize: 50, SortDirection: "DESC", ...(token ? { PageToken: token } : {}) },
      })
      const items = data.Items ?? []
      for (const tx of items) {
        if (String(tx.CustomerID ?? "") !== noahCustomerId) continue
        const id = String(tx.ID ?? "")
        const { amount, currency } = pickTxAmountAndCurrency(tx)
        const directionRaw = String(tx.Direction ?? "").toLowerCase()
        const direction = directionRaw === "in" ? "in" : directionRaw === "out" ? "out" : null
        const status = String(tx.Status ?? "").toLowerCase() || "unknown"
        const { error } = await admin.from("transactions").upsert(
          {
            user_id: user.id,
            provider: "noah",
            noah_transaction_id: id || null,
            status,
            amount,
            currency,
            direction,
            payload: tx,
            metadata: {
              source: "sync_transactions",
            },
          },
          { onConflict: "provider,noah_transaction_id" }
        )
        if (!error) synced++
      }
      token = data.PageToken
      if (!token || items.length === 0) break
    }
    return NextResponse.json({ ok: true, synced })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 400 })
  }
}
