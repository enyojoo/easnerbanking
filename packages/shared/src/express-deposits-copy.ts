/** Customer-facing Express deposits copy. Never name Stripe, Link, crypto, or onramp. */

export const EXPRESS_DEPOSITS_COPY = {
  title: "Express deposits",
  description: "Add money from a card, Apple Pay, Google Pay, or a US bank account.",
  setupCta: "Set up",
  continueCta: "Continue",
  verifyCta: "Verify identity",
  readyBadge: "Ready",
  payCta: "Pay",
  cardTitle: "Card",
  applePayTitle: "Apple Pay",
  googlePayTitle: "Google Pay",
  achTitle: "Bank account (ACH)",
  setupRequiredHint: "Set up Express deposits to use this method.",
  geoUnavailable: "Express deposits is not available in your region.",
  ownerOnly: "Only the account owner can set up Express deposits.",
  tier1Required: "Complete Global banking verification first.",
  youPay: "You pay",
  youGet: "You get",
  reviewTitle: "Review & pay",
  completeTitle: "Deposit started",
  identityTitle: "Verify identity",
  identityHint: "We need a photo of your ID and a selfie to finish setup.",
  savePaymentTitle: "Save a payment method",
  savePaymentHint: "Add a card or bank account to finish this deposit. Details stay in this window.",
  acceptTermsTitle: "Accept terms to continue",
  acceptTermsHint: "Review and accept the terms to finish setup.",
  nationalitiesLabel: "Nationalities",
  birthCityLabel: "City of birth",
  birthCountryLabel: "Country of birth",
  identifierHint: "Enter the ID number we requested.",
  travelRuleBlock: "Additional confirmation is required for this amount. Try a smaller amount or finish verification.",
  somethingWentWrong: "Something went wrong. Try again.",
  paymentFailed: "Payment could not be completed. Try again.",
} as const

export function expressDepositActivityLabel(paymentMethod?: string | null): string {
  const m = String(paymentMethod || "").toLowerCase()
  if (m === "apple_pay" || m === "express_apple_pay") return "Apple Pay deposit"
  if (m === "google_pay" || m === "express_google_pay") return "Google Pay deposit"
  if (m === "ach" || m === "us_bank_account" || m === "express_ach") return "Bank deposit"
  return "Card deposit"
}

export function isExpressDepositsMetadata(meta: Record<string, unknown> | null | undefined): boolean {
  return String(meta?.flow ?? "").toLowerCase() === "express_deposits"
}

export function expressDepositMethodTitle(
  kind: "express_card" | "express_apple_pay" | "express_google_pay" | "express_ach",
): string {
  if (kind === "express_apple_pay") return EXPRESS_DEPOSITS_COPY.applePayTitle
  if (kind === "express_google_pay") return EXPRESS_DEPOSITS_COPY.googlePayTitle
  if (kind === "express_ach") return EXPRESS_DEPOSITS_COPY.achTitle
  return EXPRESS_DEPOSITS_COPY.cardTitle
}
