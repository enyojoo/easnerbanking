import { loadStripe, type Stripe } from "@stripe/stripe-js"
import { browserStripeLocale } from "@/lib/stripe/elements-appearance"

let stripePromise: Promise<Stripe | null> | null = null

/** Hide Stripe’s test-mode sandbox assistant on every Easner Elements surface. */
export const STRIPE_DEVELOPER_TOOLS = { assistant: { enabled: false } } as const

/** Client-only: preload Stripe.js once using the public publishable key. */
export function getStripeJs(): Promise<Stripe | null> | null {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim()
  if (!key) return null
  stripePromise ??= loadStripe(key, {
    locale: browserStripeLocale(),
    developerTools: STRIPE_DEVELOPER_TOOLS,
  } as Parameters<typeof loadStripe>[1])
  return stripePromise
}
