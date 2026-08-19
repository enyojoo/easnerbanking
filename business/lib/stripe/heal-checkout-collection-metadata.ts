import type { SupabaseClient } from "@supabase/supabase-js"
import { getStripe } from "@/lib/stripe/client"
import { payerIdentityFromPaymentIntent } from "@/lib/stripe/resolve-charge-settlement"

function asMetadata(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) }
  }
  return {}
}

export function isCheckoutStripeMetadata(meta: Record<string, unknown> | null | undefined): boolean {
  return String(meta?.source ?? "").toLowerCase() === "checkout_stripe"
}

/**
 * Pull payer identity + Connect application fee from Stripe onto a checkout collection ledger row.
 * Also updates `checkout_stripe_settlements` net/fee when the application fee was missing.
 */
export async function healCheckoutCollectionMetadata(
  admin: SupabaseClient,
  input: { ledgerRowId: string; metadata: Record<string, unknown> },
): Promise<{ metadata: Record<string, unknown>; healed: boolean }> {
  const meta = asMetadata(input.metadata)
  if (!isCheckoutStripeMetadata(meta)) {
    return { metadata: meta, healed: false }
  }

  const piId =
    typeof meta.stripe_payment_intent_id === "string" && meta.stripe_payment_intent_id.trim()
      ? meta.stripe_payment_intent_id.trim()
      : null
  if (!piId) {
    return { metadata: meta, healed: false }
  }

  const stripe = getStripe()
  const pi = await stripe.paymentIntents.retrieve(piId, {
    expand: ["latest_charge", "payment_method"],
  })

  const identity = payerIdentityFromPaymentIntent(pi)
  let sessionEmail: string | null = null
  let sessionName: string | null = null
  try {
    const sessions = await stripe.checkout.sessions.list({ payment_intent: piId, limit: 1 })
    const session = sessions.data[0]
    const email = session?.customer_details?.email || session?.customer_email
    if (typeof email === "string" && email.trim()) sessionEmail = email.trim()
    const name = session?.customer_details?.name
    if (typeof name === "string" && name.trim()) sessionName = name.trim()
  } catch (e) {
    console.warn("[stripe] checkout session list for heal failed:", e)
  }

  const email =
    (typeof meta.customer_email === "string" && meta.customer_email.trim()) ||
    sessionEmail ||
    identity.payerEmail
  const name =
    (typeof meta.customer_name === "string" && meta.customer_name.trim()) ||
    sessionName ||
    identity.payerName

  const applicationFeeCents =
    typeof pi.application_fee_amount === "number" ? pi.application_fee_amount : null
  const grossCents =
    typeof meta.gross_cents === "number" && Number.isFinite(meta.gross_cents)
      ? meta.gross_cents
      : typeof pi.amount_received === "number"
        ? pi.amount_received
        : typeof pi.amount === "number"
          ? pi.amount
          : null

  let changed = false
  if (email && meta.customer_email !== email) {
    meta.customer_email = email
    changed = true
  }
  if (name && meta.customer_name !== name) {
    meta.customer_name = name
    changed = true
  }

  let netCents: number | null = null
  if (applicationFeeCents != null && grossCents != null) {
    netCents = Math.max(0, grossCents - applicationFeeCents)
    if (meta.fee_cents !== applicationFeeCents) {
      meta.fee_cents = applicationFeeCents
      changed = true
    }
    if (meta.net_cents !== netCents) {
      meta.net_cents = netCents
      changed = true
    }
  }

  if (!changed) {
    return { metadata: meta, healed: false }
  }

  const ledgerUpdate: Record<string, unknown> = { metadata: meta }
  if (netCents != null && applicationFeeCents != null) {
    ledgerUpdate.amount = netCents / 100
  }

  await admin.from("transactions").update(ledgerUpdate).eq("id", input.ledgerRowId)

  const settlementId =
    typeof meta.easner_settlement_id === "string" && meta.easner_settlement_id.trim()
      ? meta.easner_settlement_id.trim()
      : null
  if (settlementId && applicationFeeCents != null && netCents != null) {
    await admin
      .from("checkout_stripe_settlements")
      .update({
        fee_cents: applicationFeeCents,
        net_cents: netCents,
        updated_at: new Date().toISOString(),
      })
      .eq("id", settlementId)
  }

  const sessionRowId = typeof meta.checkout_session_id === "string" ? meta.checkout_session_id : null
  if (email) {
    await admin
      .from("online_checkout_sessions")
      .update({ customer_email: email, updated_at: new Date().toISOString() })
      .eq("stripe_payment_intent_id", piId)
    if (sessionRowId) {
      await admin
        .from("online_checkout_sessions")
        .update({ customer_email: email, updated_at: new Date().toISOString() })
        .eq("id", sessionRowId)
    }
  }

  return { metadata: meta, healed: true }
}
