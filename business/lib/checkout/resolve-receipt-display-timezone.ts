import type Stripe from "stripe"
import { getStripe } from "@/lib/stripe/client"

let cachedDashboardTimeZone: string | null = null

/**
 * IANA zone for checkout/link receipt “When” rows.
 * Prefer `EASNER_RECEIPT_TIMEZONE`, else the platform Stripe Dashboard timezone
 * (same clock Stripe uses when the customer has no stored zone).
 */
export async function resolveReceiptDisplayTimeZone(stripe?: Stripe): Promise<string> {
  const fromEnv = process.env.EASNER_RECEIPT_TIMEZONE?.trim()
  if (fromEnv) return fromEnv
  if (cachedDashboardTimeZone) return cachedDashboardTimeZone
  try {
    const account = await (stripe ?? getStripe()).accounts.retrieve()
    const tz = account.settings?.dashboard?.timezone?.trim()
    if (tz) {
      cachedDashboardTimeZone = tz
      return tz
    }
  } catch (err) {
    console.warn("[checkout] receipt timezone lookup failed:", err)
  }
  return "UTC"
}

export function resetReceiptDisplayTimeZoneCacheForTests() {
  cachedDashboardTimeZone = null
}
