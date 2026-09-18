import type Stripe from "stripe"

/** Request options so Direct Charges and retrieves run on the connected account. */
export function connectedAccountRequest(
  stripeAccountId: string | null | undefined,
  extra?: Stripe.RequestOptions,
): Stripe.RequestOptions {
  const stripeAccount = String(stripeAccountId ?? "").trim()
  return stripeAccount ? { ...extra, stripeAccount } : { ...extra }
}

export function stripeEventConnectedAccount(
  event: { account?: string | null },
  fallback?: string | null,
): string | null {
  const fromEvent = typeof event.account === "string" ? event.account.trim() : ""
  if (fromEvent) return fromEvent
  const fromFallback = String(fallback ?? "").trim()
  return fromFallback || null
}
