/**
 * Consumer verification products. Customer-facing only; no provider names.
 */

export type VerificationProductId = "global_banking" | "cards"

export type VerificationProduct = {
  id: VerificationProductId
  title: string
  description: string
  footnote?: string
}

export const CONSUMER_VERIFICATION_PRODUCTS: VerificationProduct[] = [
  {
    id: "global_banking",
    title: "Global banking",
    description: "USD/EUR accounts, payments, and stablecoin flows.",
  },
  {
    id: "cards",
    title: "Cards",
    description: "Personal debit/credit cards for your online and physical payments.",
  },
]
