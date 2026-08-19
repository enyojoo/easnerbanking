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
  | "apple_pay"
  | "google_pay"
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
  "apple_pay",
  "google_pay",
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
  const wallet = (pm.wallet ?? "").toLowerCase()
  if (wallet === "apple_pay") return "apple_pay"
  if (wallet === "google_pay") return "google_pay"

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

function paymentMethodLast4Mask(
  pm: StripePaymentMethodDisplay | null | undefined,
): string | null {
  const last4 = pm?.last4?.replace(/\D/g, "").slice(-4)
  return last4 ? `•••• ${last4}` : null
}

function paymentMethodWalletLabel(
  pm: StripePaymentMethodDisplay | null | undefined,
): string | null {
  if (pm?.wallet === "apple_pay") return "Apple Pay"
  if (pm?.wallet === "google_pay") return "Google Pay"
  if (pm?.wallet === "samsung_pay") return "Samsung Pay"
  return null
}

/** True when we have a brand-specific chip (not the generic card fallback). */
export function hasPaymentBrandIcon(
  pm: StripePaymentMethodDisplay | null | undefined,
): boolean {
  return paymentMethodIconKey(pm) !== "card"
}

/** Human label for lists / plain text, e.g. "Visa •••• 4242". */
export function formatPaymentMethodText(
  pm: StripePaymentMethodDisplay | null | undefined,
): string {
  if (!pm?.type) return "Card"
  const type = pm.type.toLowerCase()
  const mask = paymentMethodLast4Mask(pm)

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
    const wallet = paymentMethodWalletLabel(pm)
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

/**
 * Text beside a brand SVG/PNG chip. Always the same layout as card/bank:
 * chip on the left, identifier on the right.
 * Card/bank → last4; wallets → name (Cash App, Apple Pay, Klarna, …).
 */
export function formatPaymentMethodTextBesideIcon(
  pm: StripePaymentMethodDisplay | null | undefined,
): string {
  if (!pm?.type) return "Card"
  if (!hasPaymentBrandIcon(pm)) {
    return formatPaymentMethodText(pm)
  }

  const type = pm.type.toLowerCase()
  const mask = paymentMethodLast4Mask(pm)
  const wallet = paymentMethodWalletLabel(pm)

  if (type === "card") {
    if (wallet) return wallet
    return mask ?? ""
  }

  if (type === "us_bank_account" || type === "ach_debit" || type === "ach") {
    return mask ?? pm.bankName?.trim() ?? ""
  }

  if (type === "sepa_debit") return mask ?? "SEPA"
  if (type === "link") return mask ?? "Link"
  if (type === "klarna") return "Klarna"
  if (type === "cashapp" || type === "cash_app") return "Cash App"
  if (type === "amazon_pay") return "Amazon Pay"
  if (type === "alipay") return "Alipay"
  return mask ?? formatPaymentMethodListLabel(pm)
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

/** True when we have enough to render a Stripe PM row (icon and/or label). */
export function shouldShowStripePaymentMethod(
  pm: StripePaymentMethodDisplay | null | undefined,
): boolean {
  if (!pm?.type) return false
  const type = pm.type.toLowerCase()
  if (type === "card") return Boolean(pm.brand || pm.last4)
  if (type === "us_bank_account" || type === "ach_debit" || type === "ach" || type === "sepa_debit") {
    return Boolean(pm.bankName || pm.last4 || type)
  }
  return true
}

export function paymentBrandSvgSrc(key: PaymentBrandIconKey): string {
  return `/payment-brands/${key}.svg`
}

/** Absolute PNG URL for email clients (most block `data:` image URIs). */
export function paymentBrandPngEmailUrl(key: PaymentBrandIconKey): string {
  const base = (
    process.env.NEXT_PUBLIC_BUSINESS_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://business.easner.com"
  ).replace(/\/$/, "")
  return `${base}/payment-brands/${key}.png`
}
