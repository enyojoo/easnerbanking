/** Customer-facing Express deposits copy. Never name Stripe, Link, crypto, or onramp. */

export const EXPRESS_DEPOSITS_COPY = {
  title: "Express deposits",
  description: "Add money from a card, Apple Pay, Google Pay, or an ACH Direct.",
  setupCta: "Set up",
  continueCta: "Continue",
  verifyCta: "Verify identity",
  openingCta: "Opening...",
  readyBadge: "Ready",
  payCta: "Pay",
  cardTitle: "Card",
  applePayTitle: "Apple Pay",
  googlePayTitle: "Google Pay",
  achTitle: "ACH Direct",
  setupRequiredHint: "Set up Express deposits to use this method.",
  geoUnavailable: "Express deposits is not available in your region.",
  ownerOnly: "Only the account owner can set up Express deposits.",
  globalBankingRequired: "Complete Global banking verification first.",
  estimatedTotalToPay: "Estimated total to pay",
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
  /** Shown on the verification hub Express card while setup is still required. */
  verificationFootnote:
    "Separate from Global banking. Required before card and wallet deposits.",
  nativeTrustedInstallIos:
    "This install can’t verify this device. Install the latest TestFlight or App Store build and try again.",
  nativeTrustedInstallAndroid:
    "This install can’t verify this device. Install the latest Play Store or official Android build and try again.",
  /** @deprecated Use platform-specific strings via expressNativeTrustedInstallMessage. */
  nativeTrustedInstall:
    "This install can’t verify this device. Install the latest official app build and try again.",
  paymentFailed: "Payment could not be completed. Try again.",
  setupDismissed: "Setup wasn’t finished. You can continue whenever you’re ready.",
} as const

export function isExpressSetupDismissed(result?: string | null): boolean {
  const value = String(result || "").toLowerCase()
  return (
    value === "abandoned" ||
    value === "declined" ||
    value === "canceled" ||
    value === "cancelled" ||
    value === "dismissed" ||
    value === "closed" ||
    value === "close" ||
    value === "exit"
  )
}

export function expressIdentityOutcome(raw: unknown): string {
  if (raw == null) return ""
  if (typeof raw === "string") return raw
  if (typeof raw === "object") {
    const row = raw as { result?: unknown; status?: unknown; outcome?: unknown }
    return String(row.result ?? row.status ?? row.outcome ?? "")
  }
  return String(raw)
}

export function isExpressIdentitySuccess(result?: string | null): boolean {
  const value = String(result || "").toLowerCase()
  return (
    value === "success" ||
    value === "verified" ||
    value === "completed" ||
    value === "complete" ||
    value === "accepted" ||
    value === "done"
  )
}

/** Drop vendor/scope strings so setup never shows crypto / OAuth errors. */
export function expressSetupUserMessage(raw?: string | null): string {
  const text = String(raw || "").trim()
  if (!text) return EXPRESS_DEPOSITS_COPY.somethingWentWrong
  if (isExpressSetupDismissed(text) || /abandon|cancel|declin|dismiss/i.test(text)) {
    return EXPRESS_DEPOSITS_COPY.setupDismissed
  }
  if (/already been verified|cannot be updated/i.test(text)) {
    return EXPRESS_DEPOSITS_COPY.identityHint
  }
  if (/attestation|native link|devicecheck|app attest|play integrity/i.test(text)) {
    return EXPRESS_DEPOSITS_COPY.nativeTrustedInstall
  }
  if (/crypto|onramp|oauth|scope|stripe|link\.com|link\b|authintent/i.test(text)) {
    return EXPRESS_DEPOSITS_COPY.somethingWentWrong
  }
  return text
}

export function expressNativeTrustedInstallMessage(
  platform?: "ios" | "android" | "web" | (string & {}),
): string {
  if (platform === "android") return EXPRESS_DEPOSITS_COPY.nativeTrustedInstallAndroid
  if (platform === "ios") return EXPRESS_DEPOSITS_COPY.nativeTrustedInstallIos
  return EXPRESS_DEPOSITS_COPY.nativeTrustedInstall
}

export function isExpressKycAlreadyVerified(raw?: string | null): boolean {
  return /already been verified|cannot be updated/i.test(String(raw || ""))
}

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

/** Link registerLinkUser wants E.164, e.g. +12025551234. */
export function toExpressLinkE164Phone(phone: string, country?: string | null): string {
  const raw = String(phone || "").trim()
  const digits = raw.replace(/\D/g, "")
  if (!digits) return raw
  if (raw.startsWith("+")) return `+${digits}`
  const iso = String(country || "").toUpperCase()
  if ((iso === "US" || iso === "CA") && digits.length === 10) return `+1${digits}`
  if ((iso === "US" || iso === "CA") && digits.length === 11 && digits.startsWith("1")) return `+${digits}`
  return `+${digits}`
}
