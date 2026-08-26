import { getStripe } from "./client"
import { isOnlineCheckoutEnabled } from "./config"
import type { PaymentLinkInterval } from "@/lib/payment-links/types"

export type CreateRecurringPriceResult =
  | { ok: true; priceId: string }
  | { ok: false; status: number; error: string }

/**
 * Recurring Payment Links bill from a Price on the platform account; the destination
 * transfer on each renewal is what routes money to the business.
 */
export async function createRecurringPrice(input: {
  label: string
  description: string | null
  amountCents: number
  currency: string
  interval: PaymentLinkInterval
  livemode?: boolean
}): Promise<CreateRecurringPriceResult> {
  if (!isOnlineCheckoutEnabled()) {
    return { ok: false, status: 503, error: "Online payments are not enabled" }
  }

  try {
    const price = await getStripe(input.livemode !== false).prices.create({
      currency: input.currency.toLowerCase(),
      unit_amount: input.amountCents,
      recurring: { interval: input.interval },
      product_data: { name: input.label },
      ...(input.description?.trim() ? { nickname: input.description.trim().slice(0, 250) } : {}),
    })
    return { ok: true, priceId: price.id }
  } catch (e) {
    return {
      ok: false,
      status: 502,
      error: e instanceof Error ? e.message : "Could not set up recurring billing",
    }
  }
}
