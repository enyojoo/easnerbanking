import type { StripePaymentMethodDisplay } from "@/lib/stripe/parse-payment-method-display"

export type PaymentBrandIconKey =
  | "visa"
  | "mastercard"
  | "amex"
  | "discover"
  | "link"
  | "klarna"
  | "cashapp"
  | "amazon_pay"
  | "alipay"
  | "bank"
  | "card"

const BRAND_KEYS = new Set<string>([
  "visa",
  "mastercard",
  "amex",
  "american_express",
  "discover",
  "link",
  "klarna",
  "cashapp",
  "cash_app",
  "amazon_pay",
  "alipay",
  "bank",
  "card",
])

function titleCaseType(type: string): string {
  return type
    .split("_")
    .filter(Boolean)
    .map((part, i) => (i === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ")
}

export function paymentMethodIconKey(
  pm: StripePaymentMethodDisplay | null | undefined,
): PaymentBrandIconKey {
  if (!pm?.type) return "card"
  const type = pm.type.toLowerCase()
  const brand = (pm.brand ?? "").toLowerCase()

  if (type === "card" || type === "link") {
    if (brand === "visa") return "visa"
    if (brand === "mastercard" || brand === "master_card") return "mastercard"
    if (brand === "amex" || brand === "american_express") return "amex"
    if (brand === "discover") return "discover"
    if (type === "link" || brand === "link") return "link"
    return "card"
  }
  if (type === "us_bank_account" || type === "ach_debit" || type === "sepa_debit" || type === "ach") {
    return "bank"
  }
  if (type === "klarna") return "klarna"
  if (type === "cashapp" || type === "cash_app") return "cashapp"
  if (type === "amazon_pay") return "amazon_pay"
  if (type === "alipay") return "alipay"
  if (BRAND_KEYS.has(brand)) {
    if (brand === "american_express") return "amex"
    if (brand === "cash_app") return "cashapp"
    return brand as PaymentBrandIconKey
  }
  return "card"
}

/** Human label for lists / PDF text, e.g. "Visa •••• 4242". */
export function formatPaymentMethodText(
  pm: StripePaymentMethodDisplay | null | undefined,
): string {
  if (!pm?.type) return "Card"
  const type = pm.type.toLowerCase()
  const last4 = pm.last4?.replace(/\D/g, "").slice(-4)
  const mask = last4 ? `•••• ${last4}` : null

  if (type === "card") {
    const brand = (pm.brand ?? "card").toLowerCase()
    const brandLabel =
      brand === "amex" || brand === "american_express"
        ? "Amex"
        : brand === "mastercard" || brand === "master_card"
          ? "Mastercard"
          : brand === "visa"
            ? "Visa"
            : brand === "discover"
              ? "Discover"
              : titleCaseType(brand === "card" ? "card" : brand)
    const wallet =
      pm.wallet === "apple_pay"
        ? "Apple Pay"
        : pm.wallet === "google_pay"
          ? "Google Pay"
          : null
    const base = wallet ? `${wallet} · ${brandLabel}` : brandLabel
    return mask ? `${base} ${mask}` : base
  }

  if (type === "us_bank_account" || type === "ach_debit" || type === "ach") {
    const bank = pm.bankName?.trim() || "Bank"
    return mask ? `${bank} ${mask}` : bank
  }
  if (type === "sepa_debit") {
    return mask ? `SEPA ${mask}` : "SEPA"
  }
  if (type === "link") return mask ? `Link ${mask}` : "Link"
  if (type === "klarna") return "Klarna"
  if (type === "cashapp" || type === "cash_app") return "Cash App"
  if (type === "amazon_pay") return "Amazon Pay"
  if (type === "alipay") return "Alipay"

  const label = titleCaseType(type)
  return mask ? `${label} ${mask}` : label
}

/** Short list label (e.g. "Visa" / "Card") when full mask is not needed. */
export function formatPaymentMethodListLabel(
  pm: StripePaymentMethodDisplay | null | undefined,
): string {
  if (!pm?.type) return "Card"
  const type = pm.type.toLowerCase()
  if (type === "card") {
    const brand = (pm.brand ?? "").toLowerCase()
    if (brand === "visa") return "Visa"
    if (brand === "mastercard" || brand === "master_card") return "Mastercard"
    if (brand === "amex" || brand === "american_express") return "Amex"
    if (brand === "discover") return "Discover"
    return "Card"
  }
  if (type === "us_bank_account" || type === "ach_debit" || type === "ach") return "Bank"
  if (type === "sepa_debit") return "SEPA"
  if (type === "link") return "Link"
  if (type === "klarna") return "Klarna"
  if (type === "cashapp" || type === "cash_app") return "Cash App"
  if (type === "amazon_pay") return "Amazon Pay"
  if (type === "alipay") return "Alipay"
  return titleCaseType(type)
}

export function paymentBrandSvgSrc(key: PaymentBrandIconKey): string {
  return `/payment-brands/${key}.svg`
}
