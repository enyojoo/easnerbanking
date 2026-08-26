import Stripe from "stripe"
import { getStripeSecretKey } from "./config"

const clients = new Map<string, Stripe>()

/** Lazy Stripe SDK client for the platform account. Pass `false` for test mode. */
export function getStripe(livemode: boolean = true): Stripe {
  const key = getStripeSecretKey(livemode)
  if (!key) {
    throw new Error(
      livemode ? "STRIPE_SECRET_KEY is not configured" : "STRIPE_TEST_SECRET_KEY is not configured",
    )
  }
  const existing = clients.get(key)
  if (existing) return existing
  const client = new Stripe(key, {
    apiVersion: "2026-07-29.dahlia",
    typescript: true,
  })
  clients.set(key, client)
  return client
}
