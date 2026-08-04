import { getStripe } from "../client"

/** Platform MoR: record Stripe Connect ToS acceptance on the connected account. */
export async function acceptStripeConnectTermsOfService(
  stripeAccountId: string,
  clientIp: string,
): Promise<void> {
  const stripe = getStripe()
  const ip = clientIp.trim() || "127.0.0.1"
  await stripe.accounts.update(stripeAccountId, {
    tos_acceptance: {
      date: Math.floor(Date.now() / 1000),
      ip,
    },
  })
}

export function stripeConnectClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first
  }
  const realIp = request.headers.get("x-real-ip")?.trim()
  if (realIp) return realIp
  return "127.0.0.1"
}
