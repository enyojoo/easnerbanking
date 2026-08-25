import { parseCheckoutFeeMode, type CheckoutFeeMode } from "./checkout-fee-mode"

export type OnlineCheckoutSource = "invoice" | "payment_link" | "embed"

/**
 * The `easner_*` metadata written on every Collections session and payment intent.
 * Webhooks route on this alone, so creation and settlement must agree on the shape.
 */
export type CheckoutSessionMetadata = {
  source: OnlineCheckoutSource
  settlementId: string
  businessId: string
  invoiceId: string | null
  invoiceNumber: string | null
  paymentLinkId: string | null
  connectedAccountId: string | null
  feeMode: CheckoutFeeMode | null
  listedAmountCents: number | null
}

function trimmed(raw: unknown): string {
  return String(raw ?? "").trim()
}

function parseSource(raw: unknown): OnlineCheckoutSource {
  const value = trimmed(raw)
  return value === "payment_link" || value === "embed" ? value : "invoice"
}

/**
 * Keys webhook routing and settlement depend on. Merchant-supplied metadata can
 * never set or overwrite these – `buildCheckoutSessionMetadata` writes them last.
 */
export const RESERVED_CHECKOUT_METADATA_KEYS = [
  "easner_settlement_id",
  "easner_business_id",
  "easner_checkout_source",
  "easner_stripe_connected_account_id",
  "easner_fee_mode",
  "easner_listed_amount_cents",
  "easner_invoice_id",
  "easner_invoice_number",
  "easner_payment_link_id",
  "easner_livemode",
] as const

export function buildCheckoutSessionMetadata(input: {
  source: OnlineCheckoutSource
  settlementId: string
  businessId: string
  connectedAccountId: string
  feeMode: CheckoutFeeMode
  listedAmountCents: number
  invoiceId?: string | null
  invoiceNumber?: string | null
  paymentLinkId?: string | null
  extra?: Record<string, string>
}): Record<string, string> {
  const extra: Record<string, string> = { ...(input.extra ?? {}) }
  for (const key of RESERVED_CHECKOUT_METADATA_KEYS) {
    if (key === "easner_livemode") continue // set via extra by the session creator itself
    delete extra[key]
  }
  return {
    ...extra,
    easner_settlement_id: input.settlementId,
    easner_business_id: input.businessId,
    easner_checkout_source: input.source,
    easner_stripe_connected_account_id: input.connectedAccountId,
    easner_fee_mode: input.feeMode,
    easner_listed_amount_cents: String(input.listedAmountCents),
    ...(input.invoiceId ? { easner_invoice_id: input.invoiceId } : {}),
    ...(input.invoiceNumber ? { easner_invoice_number: input.invoiceNumber } : {}),
    ...(input.paymentLinkId ? { easner_payment_link_id: input.paymentLinkId } : {}),
  }
}

export function parseCheckoutSessionMetadata(
  raw: Record<string, string> | null | undefined,
): CheckoutSessionMetadata {
  const meta = raw ?? {}
  const listed = Number(trimmed(meta.easner_listed_amount_cents))
  return {
    source: parseSource(meta.easner_checkout_source),
    settlementId: trimmed(meta.easner_settlement_id),
    businessId: trimmed(meta.easner_business_id),
    invoiceId: trimmed(meta.easner_invoice_id) || null,
    invoiceNumber: trimmed(meta.easner_invoice_number) || null,
    paymentLinkId: trimmed(meta.easner_payment_link_id) || null,
    connectedAccountId: trimmed(meta.easner_stripe_connected_account_id) || null,
    feeMode: parseCheckoutFeeMode(meta.easner_fee_mode),
    listedAmountCents: Number.isFinite(listed) && listed > 0 ? Math.round(listed) : null,
  }
}

/** Payment Links and website embeds settle through the shared collection handler. */
export function settlesAsCollection(
  source: OnlineCheckoutSource,
): source is Exclude<OnlineCheckoutSource, "invoice"> {
  return source === "payment_link" || source === "embed"
}
