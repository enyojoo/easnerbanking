import { loadStripe, type Stripe } from "@stripe/stripe-js"
import { browserStripeLocale } from "@/lib/stripe/elements-appearance"

const stripePromiseByAccount = new Map<string, Promise<Stripe | null>>()

export function __resetStripeJsCacheForTests(): void {
  stripePromiseByAccount.clear()
}

/** Hide Stripe’s test-mode sandbox assistant on every Easner Elements surface. */
const STRIPE_DEVELOPER_TOOLS = { assistant: { enabled: false } } as const

/**
 * Client-only Stripe.js. Direct Charges require `stripeAccount` so Elements
 * talks to the connected account that owns the Checkout Session.
 */
export function getStripeJs(connectedAccountId?: string | null): Promise<Stripe | null> | null {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim()
  if (!key) return null
  const account = String(connectedAccountId ?? "").trim()
  const cacheKey = `${key}:${account}`
  const existing = stripePromiseByAccount.get(cacheKey)
  if (existing) return existing
  const promise = loadStripe(key, {
    locale: browserStripeLocale(),
    developerTools: STRIPE_DEVELOPER_TOOLS,
    ...(account ? { stripeAccount: account } : {}),
  } as Parameters<typeof loadStripe>[1])
  stripePromiseByAccount.set(cacheKey, promise)
  return promise
}
