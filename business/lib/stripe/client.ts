import Stripe from "stripe"
import { getStripeSecretKey } from "./config"

let stripeSingleton: Stripe | null = null

/** Lazy Stripe SDK singleton (platform account). */
export function getStripe(): Stripe {
  const key = getStripeSecretKey()
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured")
  }
  if (!stripeSingleton) {
    stripeSingleton = new Stripe(key, {
      apiVersion: "2026-07-29.dahlia",
      typescript: true,
    })
  }
  return stripeSingleton
}
