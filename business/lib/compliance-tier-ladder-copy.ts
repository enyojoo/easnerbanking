/**
 * Business verification products. Customer-facing only; no provider names.
 */

export type VerificationProductId = "global_banking" | "cards" | "online_payments"

export type VerificationProduct = {
  id: VerificationProductId
  title: string
  description: string
  footnote?: string
}

export const BUSINESS_VERIFICATION_PRODUCTS: VerificationProduct[] = [
  {
    id: "global_banking",
    title: "Global banking",
    description: "USD/EUR accounts, payments, and stablecoin flows.",
  },
  {
    id: "cards",
    title: "Cards",
    description: "Business cards for online and in-store payments.",
  },
  {
    id: "online_payments",
    title: "Online payments",
    description: "Accept card payments on checkout, links and invoices.",
  },
]
