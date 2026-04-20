import { NextResponse } from "next/server"
import { noahFetch } from "@/lib/noah/http"
import { pickTxAmountAndCurrency } from "@/lib/noah/map-transactions"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireAuth, requireNoahEnv, resolveNoahContextAsync } from "../_helpers"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"

type TxResp = { Items?: Array<Record<string, unknown>>; PageToken?: string }

export async function POST(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth
  const ctx = await resolveNoahContextAsync(user.id, request)
  if (!ctx.ok) return ctx.response
  const { noahCustomerId } = ctx
  const admin = createSupabaseAdmin()

  let txUserId = user.id
  const businessId = ctx.businessId
  if (ctx.scope === "business" && ctx.businessId) {
    const owner = await resolveBusinessOrgOwnerUserId(admin, ctx.businessId)
    if (owner) txUserId = owner
  }

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
        if (!id) continue
        const { amount, currency } = pickTxAmountAndCurrency(tx)
        const directionRaw = String(tx.Direction ?? "").toLowerCase()
        const direction = directionRaw === "in" ? "in" : directionRaw === "out" ? "out" : null
        const status = String(tx.Status ?? "").toLowerCase() || "unknown"
        await upsertLedgerTransaction(admin, {
          userId: txUserId,
          businessId,
          provider: "noah",
          providerTransactionId: id,
          status,
          amount,
          currency,
          direction,
          payload: tx,
          metadata: { source: "sync_transactions" },
          occurredAt: String(tx.Created ?? tx.Updated ?? new Date().toISOString()),
          settledAt: status === "settled" ? String(tx.Updated ?? tx.Created ?? new Date().toISOString()) : null,
          txHash: String(tx.TxHash ?? tx.TransactionHash ?? "").trim() || null,
          baseCurrency: currency,
        })
        synced++
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
