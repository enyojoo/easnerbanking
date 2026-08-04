import type { SupabaseClient } from "@supabase/supabase-js"
import type Stripe from "stripe"
import { resolveOrgOwnerUserId } from "@/lib/business/org-owner"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { inferSettlementRail, matchPayoutToSettlements } from "./match-payout-to-settlements"

/**
 * Hop 2: payout.paid (Connect connected-account or legacy platform) →
 * link settlements + create stripe_settlement expectations.
 */
export async function handleStripePayoutPaid(
  admin: SupabaseClient,
  event: Stripe.Event,
): Promise<{ handled: boolean }> {
  if (event.type !== "payout.paid" && event.type !== "payout.failed") {
    return { handled: false }
  }

  const payout = event.data.object as Stripe.Payout
  const stripeAccountId =
    typeof event.account === "string" && event.account.trim() ? event.account.trim() : null
  const now = new Date().toISOString()

  if (event.type === "payout.failed") {
    const { settlements } = await matchPayoutToSettlements(admin, payout, { stripeAccountId })
    for (const s of settlements) {
      const { data: row } = await admin
        .from("invoice_stripe_settlements")
        .select("stripe_event_ids")
        .eq("id", s.settlementId)
        .maybeSingle()
      const prior = Array.isArray(row?.stripe_event_ids) ? row!.stripe_event_ids : []
      await admin
        .from("invoice_stripe_settlements")
        .update({
          phase: "failed",
          stripe_payout_id: payout.id,
          stripe_event_ids: [...prior, event.id],
          updated_at: now,
        })
        .eq("id", s.settlementId)
    }
    return { handled: settlements.length > 0 }
  }

  const { settlements, byBusiness } = await matchPayoutToSettlements(admin, payout, {
    stripeAccountId,
  })
  if (settlements.length === 0) {
    return { handled: false }
  }

  const arrival =
    typeof payout.arrival_date === "number"
      ? new Date(payout.arrival_date * 1000).toISOString()
      : null

  for (const [businessId, group] of byBusiness) {
    const { rail, destinationRef } = await inferSettlementRail(admin, businessId, payout)
    const expectedAmountCents = group.reduce((sum, s) => sum + s.netCents, 0)
    const settlementIds = group.map((s) => s.settlementId)
    const ownerUserId = await resolveOrgOwnerUserId(admin, businessId, "")
    if (!ownerUserId) {
      console.warn("[stripe] payout.paid: no owner for business", businessId)
      continue
    }

    const { data: bizRow } = await admin
      .from("businesses")
      .select("grid_customer_id")
      .eq("id", businessId)
      .maybeSingle()
    const gridCustomerId =
      typeof bizRow?.grid_customer_id === "string" ? bizRow.grid_customer_id.trim() : null

    // Idempotent expectation: one pending row per payout+business
    const { data: existingTransfer } = await admin
      .from("grid_transfers")
      .select("id")
      .eq("mode", "stripe_settlement")
      .eq("stripe_payout_id", payout.id)
      .eq("business_id", businessId)
      .maybeSingle()

    let transferId = existingTransfer?.id ? String(existingTransfer.id) : null
    if (!transferId) {
      const { data: created, error } = await admin
        .from("grid_transfers")
        .insert({
          user_id: ownerUserId,
          business_id: businessId,
          mode: "stripe_settlement",
          status: "pending",
          stripe_payout_id: payout.id,
          settlement_rail: rail,
          destination_ref: destinationRef,
          expected_amount_cents: expectedAmountCents,
          invoice_settlement_ids: settlementIds,
          grid_customer_id: gridCustomerId,
          receive_currency: group[0]?.currency ?? "USD",
          quoted_receive: expectedAmountCents / 100,
          metadata: {
            source: "invoice_stripe",
            stripe_event_id: event.id,
            stripe_connected_account_id: stripeAccountId,
          },
        })
        .select("id")
        .single()
      if (error) throw error
      transferId = String(created.id)
    }

    for (const s of group) {
      const { data: row } = await admin
        .from("invoice_stripe_settlements")
        .select("stripe_event_ids")
        .eq("id", s.settlementId)
        .maybeSingle()
      const prior = Array.isArray(row?.stripe_event_ids) ? row!.stripe_event_ids : []

      await admin
        .from("invoice_stripe_settlements")
        .update({
          phase: "payout_sent",
          stripe_payout_id: payout.id,
          stripe_balance_transaction_id: s.balanceTransactionId,
          settlement_rail: rail,
          grid_transfer_id: transferId,
          expected_arrival_at: arrival,
          stripe_event_ids: [...prior, event.id],
          updated_at: now,
        })
        .eq("id", s.settlementId)

      if (s.ledgerTransactionId) {
        const { data: tx } = await admin
          .from("transactions")
          .select("id,user_id,business_id,metadata,amount,currency,provider_transaction_id")
          .eq("id", s.ledgerTransactionId)
          .maybeSingle()
        if (tx?.id) {
          const priorMeta =
            tx.metadata && typeof tx.metadata === "object"
              ? (tx.metadata as Record<string, unknown>)
              : {}
          await upsertLedgerTransaction(admin, {
            userId: String(tx.user_id),
            businessId: tx.business_id ? String(tx.business_id) : businessId,
            provider: "stripe",
            providerTransactionId: String(tx.provider_transaction_id),
            status: "processing",
            amount: Number(tx.amount ?? s.netCents / 100),
            currency: String(tx.currency ?? s.currency),
            direction: "in",
            metadata: {
              ...priorMeta,
              settlement_phase: "payout_sent",
              settlement_rail: rail,
              stripe_payout_id: payout.id,
            },
          })
        }
      }

      // Keep invoice paymentInfo settlement phase in sync
      const { data: inv } = await admin
        .from("invoices")
        .select("metadata")
        .eq("id", s.invoiceId)
        .maybeSingle()
      if (inv?.metadata && typeof inv.metadata === "object") {
        const meta = { ...(inv.metadata as Record<string, unknown>) }
        const paymentInfo = (meta.paymentInfo ?? {}) as Record<string, unknown>
        const stripeInfo = (paymentInfo.stripe ?? {}) as Record<string, unknown>
        meta.paymentInfo = {
          ...paymentInfo,
          stripe: {
            ...stripeInfo,
            settlementPhase: "payout_sent",
            settlementRail: rail,
          },
        }
        await admin.from("invoices").update({ metadata: meta }).eq("id", s.invoiceId)
      }
    }
  }

  return { handled: true }
}
