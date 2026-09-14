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

export const USD_VERIFICATION_REQUIRED_COPY = "Complete USD account verification first."

const USD_ACCOUNTS: VerificationProduct = {
  id: "global_banking",
  title: "USD accounts",
  description: "USD balances, US bank details, and USDC.",
  availability: "live",
}

const EUR_ACCOUNTS: VerificationProduct = {
  id: "eur",
  title: "EUR accounts",
  description: "Euro balances and SEPA bank details.",
  footnote: USD_VERIFICATION_REQUIRED_COPY,
  availability: "live",
}

const BANK_ACCOUNTS: VerificationProduct = {
  id: "global_banking",
  title: "Bank accounts",
  description: "USD and euro balances with local bank deposit details.",
  availability: "live",
}

const CARDS: VerificationProduct = {
  id: "cards",
  title: "Cards",
  description: "Spend from your balance online and in store.",
  availability: "coming_later",
}

const ONLINE_PAYMENTS: VerificationProduct = {
  id: "online_payments",
  title: "Online payments",
  description: "Accept card payments on checkout, links and invoices.",
  availability: "live",
}

export const BUSINESS_VERIFICATION_PRODUCTS: VerificationProduct[] = [
  USD_ACCOUNTS,
  EUR_ACCOUNTS,
  { ...CARDS, description: "Business cards for online and in-store payments." },
  ONLINE_PAYMENTS,
]

export const CONSUMER_VERIFICATION_PRODUCTS: VerificationProduct[] = [
  BANK_ACCOUNTS,
  {
    ...CARDS,
    description: "Personal cards for your online and physical payments.",
  },
]

/** Hubs no longer show numbered tiers. Kept as null so leftover callers stay blank. */
export function verificationTierLabel(_tier: VerificationLadderTier | undefined): string | null {
  return null
}
