/** Client-safe check: publishable key present implies Stripe Pay online can be attempted. */
export function isStripePublishableConfigured(): boolean {
  return Boolean(
    typeof process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY === "string" &&
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.trim(),
  )
}
