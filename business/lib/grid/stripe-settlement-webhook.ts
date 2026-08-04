import type { SupabaseClient } from "@supabase/supabase-js"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { applyWalletBalanceDelta } from "@/lib/wallet/wallet-balances-db"
import type { GridWebhookEvent } from "./types"
import { gridWebhookQuoteId } from "./webhook-event-id"

const AMOUNT_TOLERANCE_CENTS = 1
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

function webhookData(event: GridWebhookEvent): Record<string, unknown> | undefined {
  return event.data && typeof event.data === "object"
    ? (event.data as Record<string, unknown>)
    : undefined
}

function extractInboundAmountCents(data: Record<string, unknown> | undefined): number | null {
  if (!data) return null
  const candidates = [
    data.amount,
    data.receivedAmount,
    data.receiveAmount,
    data.quotedReceive,
    (data.destination as Record<string, unknown> | undefined)?.amount,
  ]
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c)) {
      // Grid amounts are often major units; if value looks like cents (> 1000 and integer-ish with invoice nets),
      // treat values < 1e6 as major units dollars.
      if (Math.abs(c) >= 1000 && Number.isInteger(c)) return Math.round(c)
      return Math.round(c * 100)
    }
    if (typeof c === "string" && c.trim()) {
      const n = Number(c)
      if (Number.isFinite(n)) {
        if (Math.abs(n) >= 1000 && Number.isInteger(n)) return Math.round(n)
        return Math.round(n * 100)
      }
    }
  }
  return null
}

function extractBusinessIdHint(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null
  const customerId = String(data.customerId ?? data.customer_id ?? "").trim()
  return customerId || null
}

/**
 * Hop 3 fiat: Grid INCOMING without quoteId → match pending stripe_settlement expectation → credit wallet.
 */
export async function handleGridStripeSettlementWebhook(
  admin: SupabaseClient,
  input: { event: GridWebhookEvent },
): Promise<{ handled: boolean }> {
  const data = webhookData(input.event)
  const quoteId = gridWebhookQuoteId(data)
  if (quoteId) return { handled: false }

  const amountCents = extractInboundAmountCents(data)
  if (amountCents == null || !(amountCents > 0)) return { handled: false }

  const since = new Date(Date.now() - MAX_AGE_MS).toISOString()
  let q = admin
    .from("grid_transfers")
    .select("*")
    .eq("mode", "stripe_settlement")
    .eq("settlement_rail", "grid_va")
    .eq("status", "pending")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(50)

  const customerHint = extractBusinessIdHint(data)
  // Prefer matching by grid_customer_id when present on webhook
  if (customerHint) {
    q = q.eq("grid_customer_id", customerHint)
  }

  const { data: candidates } = await q
  if (!candidates?.length) {
    // Retry without customer filter
    const { data: open } = await admin
      .from("grid_transfers")
      .select("*")
      .eq("mode", "stripe_settlement")
      .eq("settlement_rail", "grid_va")
      .eq("status", "pending")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(50)
    if (!open?.length) return { handled: false }
    return finalizeMatch(admin, open, amountCents)
  }

  return finalizeMatch(admin, candidates, amountCents)
}

async function finalizeMatch(
  admin: SupabaseClient,
  candidates: Record<string, unknown>[],
  amountCents: number,
): Promise<{ handled: boolean }> {
  const match = candidates.find((row) => {
    const expected = Number(row.expected_amount_cents ?? 0)
    return Math.abs(expected - amountCents) <= AMOUNT_TOLERANCE_CENTS
  })
  if (!match?.id) return { handled: false }

  const transferId = String(match.id)
  const businessId = match.business_id ? String(match.business_id) : null
  const userId = String(match.user_id)
  const netMajor = Number(match.expected_amount_cents ?? amountCents) / 100
  const currency = String(match.receive_currency ?? "USD").toUpperCase()
  const settlementIds = Array.isArray(match.invoice_settlement_ids)
    ? (match.invoice_settlement_ids as string[])
    : []
  const now = new Date().toISOString()

  if (businessId) {
    await applyWalletBalanceDelta(admin, {
      businessId,
      userId: null,
      currency,
      delta: netMajor,
    })
  } else {
    await applyWalletBalanceDelta(admin, {
      businessId: null,
      userId,
      currency,
      delta: netMajor,
    })
  }

  for (const settlementId of settlementIds) {
    const { data: settlement } = await admin
      .from("invoice_stripe_settlements")
      .select("*")
      .eq("id", settlementId)
      .maybeSingle()
    if (!settlement?.id) continue
    if (settlement.phase === "credited") continue

    await admin
      .from("invoice_stripe_settlements")
      .update({
        phase: "credited",
        credited_at: now,
        updated_at: now,
      })
      .eq("id", settlement.id)

    if (settlement.ledger_transaction_id) {
      const { data: tx } = await admin
        .from("transactions")
        .select("id,user_id,business_id,metadata,amount,currency,provider_transaction_id")
        .eq("id", settlement.ledger_transaction_id)
        .maybeSingle()
      if (tx?.id) {
        const prior =
          tx.metadata && typeof tx.metadata === "object"
            ? (tx.metadata as Record<string, unknown>)
            : {}
        await upsertLedgerTransaction(admin, {
          userId: String(tx.user_id),
          businessId: tx.business_id ? String(tx.business_id) : businessId,
          provider: "stripe",
          providerTransactionId: String(tx.provider_transaction_id),
          status: "settled",
          amount: Number(tx.amount ?? settlement.net_cents / 100),
          currency: String(tx.currency ?? settlement.currency),
          direction: "in",
          settledAt: now,
          metadata: {
            ...prior,
            settlement_phase: "credited",
            credited_at: now,
            grid_transfer_id: transferId,
          },
        })
      }
    }

    // Sync invoice paymentInfo
    const { data: inv } = await admin
      .from("invoices")
      .select("metadata")
      .eq("id", settlement.invoice_id)
      .maybeSingle()
    if (inv?.metadata && typeof inv.metadata === "object") {
      const meta = { ...(inv.metadata as Record<string, unknown>) }
      const paymentInfo = (meta.paymentInfo ?? {}) as Record<string, unknown>
      const stripeInfo = (paymentInfo.stripe ?? {}) as Record<string, unknown>
      meta.paymentInfo = {
        ...paymentInfo,
        stripe: {
          ...stripeInfo,
          settlementPhase: "credited",
        },
      }
      await admin.from("invoices").update({ metadata: meta }).eq("id", settlement.invoice_id)
    }
  }

  await admin
    .from("grid_transfers")
    .update({ status: "settled", updated_at: now })
    .eq("id", transferId)

  return { handled: true }
}
