/**
 * Pure helpers for matching Turnkey inbound to Stripe settlement expectations.
 */

export function isLegitimateStripeSettlementExpectation(row: Record<string, unknown>): boolean {
  const meta =
    row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {}
  if (String(meta.source ?? "").trim() === "va_turnkey_sweep_heal") return false

  const payoutId = String(row.stripe_payout_id ?? "").trim()
  if (payoutId) return true

  const invoiceIds = Array.isArray(row.invoice_settlement_ids) ? row.invoice_settlement_ids : []
  const checkoutIds = Array.isArray(row.checkout_settlement_ids) ? row.checkout_settlement_ids : []
  return invoiceIds.length > 0 || checkoutIds.length > 0
}
