/**
 * Customer-facing verification products. No provider names. No Tier labels on hubs.
 */

export type VerificationLadderTier = 1 | 2 | 3

export type VerificationProductAvailability = "live" | "coming_later"

export type VerificationProductId =
  | "global_banking"
  | "eur"
  | "eur_gbp"
  | "cards"
  | "online_payments"

export type VerificationProduct = {
  id: VerificationProductId
  title: string
  description: string
  footnote?: string
  ladderTier?: VerificationLadderTier
  availability: VerificationProductAvailability
}

export const VERIFICATION_COMING_LATER_LABEL = "Coming later"

export const USD_VERIFICATION_REQUIRED_COPY = "Complete US banking verification first."

const USD_ACCOUNTS: VerificationProduct = {
  id: "global_banking",
  title: "Global banking",
  description: "Get a dollar account, and send to more countries.",
  availability: "live",
}

const EUR_ACCOUNTS: VerificationProduct = {
  id: "eur",
  title: "More accounts",
  description: "Add euro accounts, and more ways to receive money.",
  availability: "live",
}

const BANK_ACCOUNTS: VerificationProduct = {
  id: "global_banking",
  title: "Global banking",
  description: "Get USD and EUR accounts to receive money.",
  availability: "live",
}

const CARDS: VerificationProduct = {
  id: "cards",
  title: "Cards",
  description: "Spend from your balance, in store or online.",
  availability: "coming_later",
}

const ONLINE_PAYMENTS: VerificationProduct = {
  id: "online_payments",
  title: "Online payments",
  description: "Get paid online by card, mobile wallet, or ACH.",
  availability: "live",
}

export const BUSINESS_VERIFICATION_PRODUCTS: VerificationProduct[] = [
  USD_ACCOUNTS,
  EUR_ACCOUNTS,
  CARDS,
  ONLINE_PAYMENTS,
]

export const CONSUMER_VERIFICATION_PRODUCTS: VerificationProduct[] = [
  BANK_ACCOUNTS,
  CARDS,
]

/** Hubs no longer show numbered tiers. Kept as null so leftover callers stay blank. */
export function verificationTierLabel(_tier: VerificationLadderTier | undefined): string | null {
  return null
}
