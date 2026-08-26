import { getStripe } from "./client"

export async function createStripeDestinationRefund(input: {
  paymentIntentId: string
  businessId: string
  settlementId: string
  hasDestinationTransfer: boolean
  idempotencyKey: string
  extraMetadata?: Record<string, string>
}): Promise<{ ok: true; refundId: string; status: string } | { ok: false; error: string }> {
  try {
    const refund = await getStripe().refunds.create(
      {
        payment_intent: input.paymentIntentId,
        reason: "requested_by_customer",
        ...(input.hasDestinationTransfer ? { reverse_transfer: true } : {}),
        metadata: {
          business_id: input.businessId,
          easner_settlement_id: input.settlementId,
          ...(input.extraMetadata ?? {}),
        },
      },
      { idempotencyKey: input.idempotencyKey },
    )
    return { ok: true, refundId: refund.id, status: refund.status ?? "succeeded" }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Refund failed" }
  }
}
