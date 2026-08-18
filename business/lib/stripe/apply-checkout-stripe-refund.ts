import type { SupabaseClient } from "@supabase/supabase-js"

export type ApplyCheckoutStripeRefundResult = {
  applied: boolean
  skipped?: "not_found" | "already_applied" | "credited"
  settlementId?: string
  businessId?: string
}

/**
 * Refund side effects for Payment Link and website-embed collections: fail the
 * settlement and its ledger entry so the money stops showing as incoming. Refunds
 * after the balance is credited need an ops clawback, so those are left in place
 * and only tagged with the refund id.
 */
export async function applyCheckoutStripeRefund(
  admin: SupabaseClient,
  input: {
    settlementId?: string
    chargeId?: string
    refundId: string
    refundedAt?: string
    stripeEventId?: string | null
  },
): Promise<ApplyCheckoutStripeRefundResult> {
  if (!input.settlementId && !input.chargeId) return { applied: false, skipped: "not_found" }

  const query = admin
    .from("checkout_stripe_settlements")
    .select("id, business_id, phase, ledger_transaction_id, stripe_event_ids, stripe_refund_id")
  const { data: settlement } = await (input.settlementId
    ? query.eq("id", input.settlementId)
    : query.eq("stripe_charge_id", input.chargeId!)
  ).maybeSingle()

  if (!settlement?.id) return { applied: false, skipped: "not_found" }

  const settlementId = String(settlement.id)
  const businessId = String(settlement.business_id)
  const refundedAt = input.refundedAt?.trim() || new Date().toISOString()
  const priorEvents = Array.isArray(settlement.stripe_event_ids)
    ? settlement.stripe_event_ids.map(String)
    : []
  const eventIds = input.stripeEventId ? [...priorEvents, input.stripeEventId] : priorEvents

  if (settlement.stripe_refund_id) {
    await admin
      .from("checkout_stripe_settlements")
      .update({ stripe_event_ids: eventIds, updated_at: refundedAt })
      .eq("id", settlementId)
    return { applied: false, skipped: "already_applied", settlementId, businessId }
  }

  const credited = String(settlement.phase) === "credited"

  await admin
    .from("checkout_stripe_settlements")
    .update({
      ...(credited ? {} : { phase: "failed" }),
      stripe_refund_id: input.refundId,
      refunded_at: refundedAt,
      stripe_event_ids: eventIds,
      updated_at: refundedAt,
    })
    .eq("id", settlementId)

  if (credited) {
    console.warn("[stripe] checkout refund after credited — manual clawback required", settlementId)
    return { applied: false, skipped: "credited", settlementId, businessId }
  }

  if (settlement.ledger_transaction_id) {
    const ledgerTransactionId = String(settlement.ledger_transaction_id)
    const { data: ledgerRow } = await admin
      .from("transactions")
      .select("id, metadata")
      .eq("id", ledgerTransactionId)
      .maybeSingle()
    if (ledgerRow?.id) {
      const priorMeta =
        ledgerRow.metadata && typeof ledgerRow.metadata === "object"
          ? (ledgerRow.metadata as Record<string, unknown>)
          : {}
      await admin
        .from("transactions")
        .update({
          status: "failed",
          metadata: {
            ...priorMeta,
            settlement_phase: "failed",
            stripe_refund_id: input.refundId,
            failed_at: refundedAt,
          },
        })
        .eq("id", ledgerRow.id)
    }
  }

  return { applied: true, settlementId, businessId }
}
