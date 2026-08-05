import type { SupabaseClient } from "@supabase/supabase-js"
import type Stripe from "stripe"
import { getStripe } from "@/lib/stripe/client"
import {
  parsePaymentMethodDisplayFromCharge,
  parsePaymentMethodDisplayFromPaymentMethod,
  paymentMethodDisplayFromMetadata,
  type StripePaymentMethodDisplay,
} from "@/lib/stripe/parse-payment-method-display"

export function needsPaymentMethodHeal(meta: Record<string, unknown>): boolean {
  const pm = paymentMethodDisplayFromMetadata(meta)
  if (!pm?.type) return true
  if (pm.type === "card" && !pm.brand && !pm.last4) return true
  if (
    (pm.type === "us_bank_account" || pm.type === "ach_debit" || pm.type === "ach") &&
    !pm.last4 &&
    !pm.bankName
  ) {
    return true
  }
  return false
}

export function needsCustomerHeal(meta: Record<string, unknown>): boolean {
  const email = typeof meta.customer_email === "string" && meta.customer_email.trim()
  const name = typeof meta.customer_name === "string" && meta.customer_name.trim()
  return !email || !name
}

/** True when ledger metadata is missing PM brand/last4 and/or customer identity. */
export function stripeInvoiceMetadataNeedsHeal(meta: Record<string, unknown>): boolean {
  if (String(meta.source ?? "") !== "invoice_stripe") return false
  return needsPaymentMethodHeal(meta) || needsCustomerHeal(meta)
}

async function retrieveCharge(
  stripe: Stripe,
  meta: Record<string, unknown>,
): Promise<Stripe.Charge | null> {
  const chargeId =
    typeof meta.stripe_charge_id === "string" && meta.stripe_charge_id.trim()
      ? meta.stripe_charge_id.trim()
      : null
  if (chargeId) {
    try {
      return await stripe.charges.retrieve(chargeId)
    } catch (e) {
      console.warn("[stripe] heal charge retrieve failed:", e)
    }
  }
  const piId =
    typeof meta.stripe_payment_intent_id === "string" && meta.stripe_payment_intent_id.trim()
      ? meta.stripe_payment_intent_id.trim()
      : null
  if (!piId) return null
  try {
    const pi = await stripe.paymentIntents.retrieve(piId, { expand: ["latest_charge"] })
    if (typeof pi.latest_charge === "object" && pi.latest_charge) {
      return pi.latest_charge
    }
  } catch (e) {
    console.warn("[stripe] heal PI retrieve failed:", e)
  }
  return null
}

async function retrievePaymentMethodFromIntent(
  stripe: Stripe,
  meta: Record<string, unknown>,
): Promise<StripePaymentMethodDisplay | null> {
  const piId =
    typeof meta.stripe_payment_intent_id === "string" && meta.stripe_payment_intent_id.trim()
      ? meta.stripe_payment_intent_id.trim()
      : null
  if (!piId) return null
  try {
    const pi = await stripe.paymentIntents.retrieve(piId, { expand: ["payment_method"] })
    const pmObj =
      typeof pi.payment_method === "object" && pi.payment_method ? pi.payment_method : null
    return parsePaymentMethodDisplayFromPaymentMethod(pmObj)
  } catch (e) {
    console.warn("[stripe] heal PI payment_method retrieve failed:", e)
  }
  return null
}

/**
 * Lazy-heal incomplete Stripe invoice ledger metadata (PM brand/last4, customer) on detail load.
 * Returns patched metadata (and whether anything changed).
 */
export async function healStripeInvoicePaymentMetadata(
  admin: SupabaseClient,
  input: {
    ledgerRowId: string
    metadata: Record<string, unknown>
    invoiceId?: string | null
  },
): Promise<{ metadata: Record<string, unknown>; healed: boolean }> {
  const meta = { ...input.metadata }
  const source = String(meta.source ?? "")
  if (source !== "invoice_stripe") {
    return { metadata: meta, healed: false }
  }

  if (!stripeInvoiceMetadataNeedsHeal(meta)) {
    return { metadata: meta, healed: false }
  }
  const needPm = needsPaymentMethodHeal(meta)
  const needCustomer = needsCustomerHeal(meta)

  const stripe = getStripe()
  let paymentMethod: StripePaymentMethodDisplay | null = null
  let chargeEmail: string | null = null
  let chargeName: string | null = null

  if (needPm || needCustomer) {
    const charge = await retrieveCharge(stripe, meta)
    if (charge) {
      paymentMethod = parsePaymentMethodDisplayFromCharge(charge)
      if (!meta.stripe_charge_id && charge.id) {
        meta.stripe_charge_id = charge.id
      }
      const bd = charge.billing_details
      if (typeof bd?.email === "string" && bd.email.trim()) chargeEmail = bd.email.trim()
      if (typeof bd?.name === "string" && bd.name.trim()) chargeName = bd.name.trim()
    }
    if (!paymentMethod) {
      paymentMethod = await retrievePaymentMethodFromIntent(stripe, meta)
    }
  }

  let invoiceName: string | null = null
  let invoiceEmail: string | null = null
  const invoiceId =
    (typeof input.invoiceId === "string" && input.invoiceId.trim()
      ? input.invoiceId.trim()
      : null) ||
    (typeof meta.invoice_id === "string" && meta.invoice_id.trim() ? meta.invoice_id.trim() : null)

  if (needCustomer && invoiceId) {
    const { data: inv } = await admin
      .from("invoices")
      .select("customer_name, customer_email, metadata")
      .eq("id", invoiceId)
      .maybeSingle()
    if (typeof inv?.customer_name === "string" && inv.customer_name.trim()) {
      invoiceName = inv.customer_name.trim()
    }
    if (typeof inv?.customer_email === "string" && inv.customer_email.trim()) {
      invoiceEmail = inv.customer_email.trim()
    }
  }

  let changed = false

  if (paymentMethod) {
    const prev = paymentMethodDisplayFromMetadata(meta)
    const merged: StripePaymentMethodDisplay = {
      type: paymentMethod.type || prev?.type || "",
      brand: paymentMethod.brand ?? prev?.brand,
      last4: paymentMethod.last4 ?? prev?.last4,
      wallet: paymentMethod.wallet ?? prev?.wallet ?? null,
      bankName: paymentMethod.bankName ?? prev?.bankName,
    }
    meta.payment_method = merged
    meta.payment_method_type = merged.type
    changed = true
  }

  const resolvedEmail =
    (typeof meta.customer_email === "string" && meta.customer_email.trim()) ||
    chargeEmail ||
    invoiceEmail ||
    null
  const resolvedName =
    (typeof meta.customer_name === "string" && meta.customer_name.trim()) ||
    chargeName ||
    invoiceName ||
    null

  if (resolvedEmail && meta.customer_email !== resolvedEmail) {
    meta.customer_email = resolvedEmail
    changed = true
  }
  if (resolvedName && meta.customer_name !== resolvedName) {
    meta.customer_name = resolvedName
    changed = true
  }

  if (!changed) {
    return { metadata: meta, healed: false }
  }

  await admin.from("transactions").update({ metadata: meta }).eq("id", input.ledgerRowId)

  // Best-effort: patch invoice paymentInfo.stripe
  if (invoiceId && (paymentMethod || resolvedEmail || resolvedName)) {
    const { data: inv } = await admin
      .from("invoices")
      .select("metadata")
      .eq("id", invoiceId)
      .maybeSingle()
    if (inv?.metadata && typeof inv.metadata === "object") {
      const invMeta = { ...(inv.metadata as Record<string, unknown>) }
      const paymentInfo = (invMeta.paymentInfo ?? {}) as Record<string, unknown>
      const stripeInfo = (paymentInfo.stripe ?? {}) as Record<string, unknown>
      invMeta.paymentInfo = {
        ...paymentInfo,
        stripe: {
          ...stripeInfo,
          ...(paymentMethod
            ? {
                paymentMethodType: paymentMethod.type,
                brand: paymentMethod.brand,
                last4: paymentMethod.last4,
                wallet: paymentMethod.wallet,
                bankName: paymentMethod.bankName,
              }
            : {}),
          ...(resolvedEmail ? { customerEmail: resolvedEmail } : {}),
          ...(resolvedName ? { customerName: resolvedName } : {}),
        },
      }
      await admin.from("invoices").update({ metadata: invMeta }).eq("id", invoiceId)
    }
  }

  return { metadata: meta, healed: true }
}
