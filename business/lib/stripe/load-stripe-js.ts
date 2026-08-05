import { loadStripe, type Stripe } from "@stripe/stripe-js"
import { browserStripeLocale } from "@/lib/stripe/elements-appearance"

const stripePromises = new Map<string, Promise<Stripe | null>>()

/** Client-only: preload Stripe.js once per publishable key. */
export function getStripeJs(publishableKey?: string | null): Promise<Stripe | null> | null {
  const key =
    publishableKey?.trim() || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim()
  if (!key) return null

  let promise = stripePromises.get(key)
  if (!promise) {
    promise = loadStripe(key, { locale: browserStripeLocale() })
    stripePromises.set(key, promise)
  }
  return promise
}
