/** Customer-facing Express deposits copy. Never name Stripe, Link, crypto, or onramp. */

export const EXPRESS_DEPOSITS_COPY = {
  title: "Express deposits",
  description: "Add money from a card, mobile wallet, or ACH.",
  setupCta: "Set up",
  continueCta: "Continue",
  tryAgainCta: "Try again",
  verifyCta: "Verify identity",
  openingCta: "Opening...",
  readyBadge: "Ready",
  readyTitle: "You're set up",
  readyBody: "You can add money with a card, mobile wallet, or ACH.",
  addMoneyCta: "Add money",
  changePaymentCta: "Change",
  payCta: "Pay",
  cardTitle: "Card",
  applePayTitle: "Apple Pay",
  googlePayTitle: "Google Pay",
  achTitle: "ACH Direct",
  cardHint: "Deposit USD from a debit or credit card",
  applePayHint: "Deposit USD with Apple Pay",
  googlePayHint: "Deposit USD with Google Pay",
  achHint: "Deposit USD from your US bank",
  setupRequiredHint: "Set up Express deposits to use this method.",
  geoUnavailable: "Express deposits is not available in your region.",
  ownerOnly: "Only the account owner can set up Express deposits.",
  estimatedTotalToPay: "Estimated total to pay",
  youPay: "You pay",
  youGet: "You get",
  reviewTitle: "Review & pay",
  completeTitle: "Deposit started",
  identityTitle: "Verify identity",
  identityHint: "We need a photo of your ID and a selfie to finish setup.",
  kycHint: "Confirm your details. We only need this once.",
  ssnLabel: "Social Security number",
  ssnHint: "Required once to finish verification for card and bank deposits.",
  reviewHint: "We're reviewing your details. This usually takes a moment.",
  finishSetupCta: "Finish setup",
  saveCardTitle: "Add your card",
  saveCardHint: "Enter your card details to finish this deposit.",
  saveAchTitle: "Link your bank",
  saveAchHint: "Connect your bank account to finish this deposit.",
  savePaymentFailed: "Could not save your payment method. Try again.",
  acceptTermsTitle: "Accept terms to continue",
  acceptTermsHint: "Review and accept the terms to finish setup.",
  nationalitiesLabel: "Nationalities",
  birthCityLabel: "City of birth",
  birthCountryLabel: "Country of birth",
  identifierHint: "Enter the ID number we requested.",
  travelRuleBlock: "Additional confirmation is required for this amount. Try a smaller amount or finish verification.",
  somethingWentWrong: "Something went wrong. Try again.",
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
    value === "done" ||
    value === "submitted" ||
    value === "pending"
  )
}

export function normalizeUsSsn(raw?: string | null): string {
  return String(raw || "").replace(/\D/g, "").slice(0, 9)
}

export function isUsSsnComplete(raw?: string | null): boolean {
  return normalizeUsSsn(raw).length === 9
}

/** Web Crypto Onramp `submitKycInfo` IdNumber. Native attachKycInfo uses the same shape. */
export const EXPRESS_US_SSN_ID_TYPE = "us_ssn" as const

export function buildExpressKycSubmitInfo(input: {
  form: Record<string, string>
  country: string
  includeUsSsn?: boolean
  eu?: boolean
}): Record<string, unknown> {
  const form = input.form
  const country = String(input.country || form.country || "").toUpperCase()
  const payload: Record<string, unknown> = {
    given_name: form.given_name,
    surname: form.surname,
    date_of_birth: {
      day: Number(form.dob_day) || undefined,
      month: Number(form.dob_month) || undefined,
      year: Number(form.dob_year) || undefined,
    },
    address: {
      line1: form.line1,
      city: form.city,
      state: form.state || undefined,
      postal_code: form.postal_code,
      country,
    },
  }
  if (input.includeUsSsn) {
    payload.id_number = {
      type: EXPRESS_US_SSN_ID_TYPE,
      value: normalizeUsSsn(form.ssn),
    }
  }
  if (input.eu) {
    payload.nationalities = String(form.nationalities || "")
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((code) => code.toUpperCase())
    payload.birth_city = form.birth_city
    payload.birth_country = form.birth_country
  }
  return payload
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
  if (/not authenticated|missing consumer secret|missing crypto customer/i.test(text)) {
    return EXPRESS_DEPOSITS_COPY.somethingWentWrong
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

export function expressDepositMethodSubtitle(
  kind: "express_card" | "express_apple_pay" | "express_google_pay" | "express_ach",
  opts?: { ready?: boolean | null },
): string {
  if (opts?.ready === false) return EXPRESS_DEPOSITS_COPY.setupRequiredHint
  if (kind === "express_apple_pay") return EXPRESS_DEPOSITS_COPY.applePayHint
  if (kind === "express_google_pay") return EXPRESS_DEPOSITS_COPY.googlePayHint
  if (kind === "express_ach") return EXPRESS_DEPOSITS_COPY.achHint
  return EXPRESS_DEPOSITS_COPY.cardHint
}

export function expressDepositSavePaymentTitle(
  kind: "express_card" | "express_apple_pay" | "express_google_pay" | "express_ach",
): string {
  if (kind === "express_ach") return EXPRESS_DEPOSITS_COPY.saveAchTitle
  return EXPRESS_DEPOSITS_COPY.saveCardTitle
}

export function expressDepositSavePaymentHint(
  kind: "express_card" | "express_apple_pay" | "express_google_pay" | "express_ach",
): string {
  if (kind === "express_ach") return EXPRESS_DEPOSITS_COPY.saveAchHint
  return EXPRESS_DEPOSITS_COPY.saveCardHint
}

/** Verification hub CTA. Verified matches US banking: badge only, no button. */
export function expressDepositsVerificationCta(
  status?: string | null,
): (typeof EXPRESS_DEPOSITS_COPY)["setupCta"] | (typeof EXPRESS_DEPOSITS_COPY)["continueCta"] | null {
  const s = String(status || "").toLowerCase()
  if (s === "approved" || s === "ready" || s === "verified") return null
  if (s === "in_progress" || s === "in_review") return EXPRESS_DEPOSITS_COPY.continueCta
  return EXPRESS_DEPOSITS_COPY.setupCta
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
