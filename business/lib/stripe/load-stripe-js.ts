import { loadStripe, type Stripe } from "@stripe/stripe-js"
import { browserStripeLocale } from "@/lib/stripe/elements-appearance"

let stripePromise: Promise<Stripe | null> | null = null

/** Client-only: preload Stripe.js once using the public publishable key. */
export function getStripeJs(): Promise<Stripe | null> | null {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim()
  if (!key) return null
  stripePromise ??= loadStripe(key, { locale: browserStripeLocale() })
  return stripePromise
}
