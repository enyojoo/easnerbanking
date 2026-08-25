import type { SupabaseClient } from "@supabase/supabase-js"
import type Stripe from "stripe"
import { dispatchMerchantWebhook } from "@/lib/checkout/merchant-webhooks"

/**
 * Disputes as first-class records: every charge.dispute.* event upserts
 * `checkout_disputes`, and the merchant hears about new disputes on their
 * webhook. Best-effort – a missing table (migration pending) only loses the
 * record, never the webhook processing.
 */
export async function recordCheckoutDispute(
  admin: SupabaseClient,
  input: {
    event: Stripe.Event
    dispute: Stripe.Dispute
    chargeId: string
    businessId: string | null
    settlement: { table: string; id: string } | null
  },
): Promise<void> {
  const { dispute, event } = input
  const evidenceDueBy =
    typeof dispute.evidence_details?.due_by === "number"
      ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
      : null
  const now = new Date().toISOString()

  try {
    const { data: existing } = await admin
      .from("checkout_disputes")
      .select("id, stripe_event_ids, business_id")
      .eq("id", dispute.id)
      .maybeSingle()

    const priorEvents = Array.isArray(existing?.stripe_event_ids)
      ? (existing.stripe_event_ids as string[])
      : []
    const businessId =
      input.businessId || (existing?.business_id ? String(existing.business_id) : null)
    if (!businessId) return

    await admin.from("checkout_disputes").upsert(
      {
        id: dispute.id,
        business_id: businessId,
        settlement_table: input.settlement?.table ?? null,
        settlement_id: input.settlement?.id ?? null,
        stripe_charge_id: input.chargeId,
        stripe_payment_intent_id:
          typeof dispute.payment_intent === "string"
            ? dispute.payment_intent
            : dispute.payment_intent?.id ?? null,
        amount_cents: Math.round(Number(dispute.amount ?? 0)),
        currency: String(dispute.currency ?? "usd").toUpperCase(),
        reason: dispute.reason ?? null,
        status: dispute.status,
        evidence_due_by: evidenceDueBy,
        stripe_event_ids: priorEvents.includes(event.id) ? priorEvents : [...priorEvents, event.id],
        ...(existing?.id ? {} : { created_at: now }),
        updated_at: now,
      },
      { onConflict: "id" },
    )

    if (event.type === "charge.dispute.created" && !existing?.id) {
      await dispatchMerchantWebhook(admin, {
        businessId,
        event: "payment.disputed",
        data: {
          dispute_id: dispute.id,
          amount_cents: Math.round(Number(dispute.amount ?? 0)),
          currency: String(dispute.currency ?? "usd").toUpperCase(),
          reason: dispute.reason ?? null,
          status: dispute.status,
          ...(evidenceDueBy ? { evidence_due_by: evidenceDueBy } : {}),
        },
      })
    }
  } catch (error) {
    console.warn("[stripe] dispute record failed", dispute.id, error)
  }
}
