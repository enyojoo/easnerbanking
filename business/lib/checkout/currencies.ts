/**
 * Currencies Collections can settle: each needs a Grid virtual account of the same
 * fiat for Stripe payouts to land in (see resolveConnectReadyForCheckout).
 */
export const SUPPORTED_CHECKOUT_CURRENCIES = ["USD", "EUR", "GBP"] as const

export type CheckoutCurrency = (typeof SUPPORTED_CHECKOUT_CURRENCIES)[number]

/** Uppercase ISO code when supported, null otherwise. */
export function parseCheckoutCurrency(raw: unknown): CheckoutCurrency | null {
  const value = String(raw ?? "").trim().toUpperCase()
  return (SUPPORTED_CHECKOUT_CURRENCIES as readonly string[]).includes(value)
    ? (value as CheckoutCurrency)
    : null
}
