export function buildStripeOnrampCreditKey(sessionId: string): string {
  return `stripe_onramp:${String(sessionId || "").trim()}`
}
