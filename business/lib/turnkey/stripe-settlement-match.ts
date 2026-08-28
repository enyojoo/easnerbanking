import type { SupabaseClient } from "@supabase/supabase-js"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { applyWalletBalanceDelta } from "@/lib/wallet/wallet-balances-db"
import { isLegitimateStripeSettlementExpectation } from "./stripe-settlement-expectation"

const AMOUNT_TOLERANCE = 0.01
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

export type StripeSettlementMatchResult =
  | { matched: false }
  | { matched: true; transferId: string; settlementIds: string[] }

/**
 * Hop 3 stablecoin: match pending stripe_settlement expectation for Turnkey inbound.
 * When matched, credits wallet via the Stripe ledger row (caller should suppress duplicate Turnkey row).
 */
export async function tryMatchTurnkeyStripeSettlement(
  admin: SupabaseClient,
  input: {
    businessId: string | null
    userId: string
    amount: number
    currency: string
    walletAddress: string
  },
): Promise<StripeSettlementMatchResult> {
  if (!input.businessId) return { matched: false }

  const since = new Date(Date.now() - MAX_AGE_MS).toISOString()
  const currency = String(input.currency || "USD").toUpperCase()
  const address = String(input.walletAddress || "").trim().toLowerCase()

  const { data: candidates } = await admin
    .from("grid_transfers")
    .select("*")
    .eq("mode", "stripe_settlement")
    .eq("settlement_rail", "turnkey_stablecoin")
    .eq("status", "pending")
    .eq("business_id", input.businessId)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(50)

  if (!candidates?.length) return { matched: false }

  const match = candidates.find((row) => {
    if (!isLegitimateStripeSettlementExpectation(row)) return false
    const expectedMajor = Number(row.expected_amount_cents ?? 0) / 100
    const amountOk = Math.abs(expectedMajor - input.amount) <= AMOUNT_TOLERANCE
    const dest = String(row.destination_ref ?? "").trim().toLowerCase()
    const destOk = !dest || !address || dest === address || dest === "turnkey"
    const cur = String(row.receive_currency ?? "USD").toUpperCase()
    return amountOk && destOk && cur === currency
  })

  if (!match?.id) return { matched: false }

  const transferId = String(match.id)
  const settlementIds = Array.isArray(match.invoice_settlement_ids)
    ? (match.invoice_settlement_ids as string[])
    : []
  const now = new Date().toISOString()
  const netMajor = Number(match.expected_amount_cents ?? 0) / 100

  // Only credit if settlements aren't already credited (idempotent)
  const { data: already } = await admin
    .from("invoice_stripe_settlements")
    .select("id,phase")
    .in("id", settlementIds.length ? settlementIds : ["00000000-0000-0000-0000-000000000000"])

  const needsCredit = (already ?? []).some((s) => s.phase !== "credited")
  if (needsCredit) {
    await applyWalletBalanceDelta(admin, {
      businessId: input.businessId,
      userId: null,
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
    if (!settlement?.id || settlement.phase === "credited") continue

    await admin
      .from("invoice_stripe_settlements")
      .update({ phase: "credited", credited_at: now, updated_at: now })
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
          businessId: tx.business_id ? String(tx.business_id) : input.businessId,
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
            settlement_rail: "turnkey_stablecoin",
            credited_at: now,
            grid_transfer_id: transferId,
            turnkey_inbound_matched: true,
          },
        })
      }
    }

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
        stripe: { ...stripeInfo, settlementPhase: "credited", settlementRail: "turnkey_stablecoin" },
      }
      await admin.from("invoices").update({ metadata: meta }).eq("id", settlement.invoice_id)
    }
  }

  await admin
    .from("grid_transfers")
    .update({ status: "settled", updated_at: now })
    .eq("id", transferId)

  return { matched: true, transferId, settlementIds }
}
