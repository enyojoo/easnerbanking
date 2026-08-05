import type Stripe from "stripe"

/** Normalized Stripe payment method display fields for invoices / ledger. */
export type StripePaymentMethodDisplay = {
  type: string
  brand?: string
  last4?: string
  wallet?: string | null
  bankName?: string
}

function str(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined
  const t = v.trim()
  return t || undefined
}

/**
 * Parse Stripe Charge.payment_method_details into a compact display object.
 */
export function parsePaymentMethodDisplayFromCharge(
  charge: Stripe.Charge | null | undefined,
): StripePaymentMethodDisplay | null {
  const details = charge?.payment_method_details
  if (!details || typeof details.type !== "string" || !details.type.trim()) {
    return null
  }

  const type = details.type.trim().toLowerCase()
  const out: StripePaymentMethodDisplay = { type }

  if (type === "card" && details.card) {
    out.brand = str(details.card.brand)?.toLowerCase()
    out.last4 = str(details.card.last4)
    const walletType = details.card.wallet?.type
    out.wallet = walletType ? String(walletType).toLowerCase() : null
  } else if (type === "us_bank_account" && details.us_bank_account) {
    out.last4 = str(details.us_bank_account.last4)
    out.bankName = str(details.us_bank_account.bank_name)
  } else if (type === "link" && details.link) {
    // Link may not expose last4 on charge details
  } else if (type === "sepa_debit" && details.sepa_debit) {
    out.last4 = str(details.sepa_debit.last4)
  } else if (type === "ach_debit" && (details as { ach_debit?: { last4?: string | null } }).ach_debit) {
    out.last4 = str((details as { ach_debit?: { last4?: string | null } }).ach_debit?.last4)
  }

  return out
}

/**
 * Parse Stripe PaymentMethod object (from expanded PaymentIntent.payment_method).
 */
export function parsePaymentMethodDisplayFromPaymentMethod(
  pm: Stripe.PaymentMethod | null | undefined,
): StripePaymentMethodDisplay | null {
  if (!pm?.type || typeof pm.type !== "string" || !pm.type.trim()) return null

  const type = pm.type.trim().toLowerCase()
  const out: StripePaymentMethodDisplay = { type }

  if (type === "card" && pm.card) {
    out.brand = str(pm.card.brand)?.toLowerCase()
    out.last4 = str(pm.card.last4)
    const walletType = pm.card.wallet?.type
    out.wallet = walletType ? String(walletType).toLowerCase() : null
  } else if (type === "us_bank_account" && pm.us_bank_account) {
    out.last4 = str(pm.us_bank_account.last4)
    out.bankName = str(pm.us_bank_account.bank_name)
  } else if (type === "sepa_debit" && pm.sepa_debit) {
    out.last4 = str(pm.sepa_debit.last4)
  } else if (type === "link" && pm.link) {
    // Link may not expose last4 on PaymentMethod
  }

  return out
}

/** Merge payment_method object from metadata with legacy payment_method_type. */
export function paymentMethodDisplayFromMetadata(
  meta: Record<string, unknown>,
): StripePaymentMethodDisplay | null {
  const raw = meta.payment_method
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>
    const type = str(o.type)?.toLowerCase()
    if (type) {
      return {
        type,
        brand: str(o.brand)?.toLowerCase(),
        last4: str(o.last4),
        wallet: o.wallet == null ? null : str(o.wallet)?.toLowerCase() ?? null,
        bankName: str(o.bankName) ?? str(o.bank_name),
      }
    }
  }
  const legacy = str(meta.payment_method_type)?.toLowerCase()
  if (legacy) return { type: legacy }
  return null
}
