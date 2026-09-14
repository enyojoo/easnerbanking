/**
 * Customer-facing verification products. No provider names.
 *
 * Ladder (identity / banking):
 *   1 USD accounts — live (base KYC/KYB)
 *   2 EUR & GBP accounts — next (Bridge), not live yet
 *   3 Cards — coming soon
 *
 * Additional (own provider KYB, after USD):
 *   online payments, express deposits (business + mobile)
 *
 * Local / African rails stay a separate additional check, not this ladder’s Tier 2.
 */

export type VerificationLadderTier = 1 | 2 | 3

export type VerificationProductAvailability = "live" | "coming_later"

export type VerificationProductId =
  | "global_banking"
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
  ladderTier: 1,
  availability: "live",
}

const EUR_GBP_ACCOUNTS: VerificationProduct = {
  id: "eur_gbp",
  title: "EUR and GBP accounts",
  description: "SEPA and Faster Payments accounts for euro and pounds.",
  footnote: "Unlocks after USD verification.",
  ladderTier: 2,
  availability: "coming_later",
}

const CARDS: VerificationProduct = {
  id: "cards",
  title: "Cards",
  description: "Spend from your balance online and in store.",
  ladderTier: 3,
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
  EUR_GBP_ACCOUNTS,
  { ...CARDS, description: "Business cards for online and in-store payments." },
  ONLINE_PAYMENTS,
]

export const CONSUMER_VERIFICATION_PRODUCTS: VerificationProduct[] = [
  USD_ACCOUNTS,
  EUR_GBP_ACCOUNTS,
  {
    ...CARDS,
    description: "Personal cards for your online and physical payments.",
  },
]

export function verificationTierLabel(tier: VerificationLadderTier | undefined): string | null {
  if (tier == null) return null
  return `Tier ${tier}`
}
