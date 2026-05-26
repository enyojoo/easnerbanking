/**
 * Bank deposit payment scheme labels (ACH, Wire, SEPA, etc.) for lifecycle copy and UI.
 */

export type BankDepositSchemeContext = {
  metadata?: Record<string, unknown> | null
  payload?: Record<string, unknown> | null
}

function readMetaString(meta: Record<string, unknown>, key: string): string {
  const v = meta[key]
  if (v == null) return ""
  return String(v).trim()
}

function parseRailTokenFromPaymentMethodId(id: string): string | null {
  const lower = id.toLowerCase()
  if (lower.includes("/ach/")) return "ach"
  if (lower.includes("/wire/") || lower.includes("/fedwire/")) return "wire"
  if (lower.includes("/sepa/")) return "sepa"
  if (lower.includes("/swift/")) return "swift"
  if (lower.includes("/fps/") || lower.includes("/faster")) return "faster_payments"
  if (lower.includes("/bacs/")) return "bacs"
  return null
}

function parseRailFromPaymentMethodType(type: string): string | null {
  const t = type.toLowerCase()
  if (t === "bankach" || t.includes("ach")) return "ach"
  if (t.includes("wire") || t.includes("fedwire")) return "wire"
  if (t.includes("sepa")) return "sepa"
  if (t.includes("swift")) return "swift"
  if (t.includes("faster") || t === "fps") return "faster_payments"
  if (t.includes("bacs")) return "bacs"
  return null
}

/** Raw rail token for metadata (`source_payment_rail`). */
export function deriveBankDepositPaymentRail(ctx: BankDepositSchemeContext): string {
  const meta = (ctx.metadata ?? {}) as Record<string, unknown>
  const payload = (ctx.payload ?? {}) as Record<string, unknown>

  const cached = readMetaString(meta, "source_payment_rail")
  if (cached) return cached.toLowerCase().replace(/\s+/g, "_")

  const pmType = readMetaString(meta, "noah_payment_method_type")
  const fromType = parseRailFromPaymentMethodType(pmType)
  if (fromType) return fromType

  const fpm = payload.FiatPaymentMethod as Record<string, unknown> | undefined
  const pmId = String(
    fpm?.ID ?? fpm?.PaymentMethodID ?? payload.PaymentMethodID ?? "",
  ).trim()
  const fromId = pmId ? parseRailTokenFromPaymentMethodId(pmId) : null
  if (fromId) return fromId

  const fp = payload.FiatPayment as Record<string, unknown> | undefined
  const currency = String(
    meta.fiat_deposit_currency ?? fp?.FiatCurrency ?? meta.settled_currency ?? "USD",
  ).toUpperCase()
  if (currency === "EUR") return "sepa"
  if (currency === "GBP") return "faster_payments"
  return "ach"
}

/** User-facing scheme label (e.g. "Wire", "SEPA Instant", "ACH"). */
export function deriveBankDepositSchemeLabel(ctx: BankDepositSchemeContext): string {
  const meta = (ctx.metadata ?? {}) as Record<string, unknown>
  const cached = readMetaString(meta, "deposit_scheme_label")
  if (cached) return cached

  const rail = deriveBankDepositPaymentRail(ctx)
  const source = meta.source as Record<string, unknown> | undefined
  const achType = String(meta.ach_type ?? source?.ach_type ?? source?.type ?? "")
    .toLowerCase()
    .replace(/_/g, " ")
  const sepaHint = String(meta.sepa_type ?? source?.sepa_type ?? source?.type ?? paymentRailHint(meta))
    .toLowerCase()
    .replace(/_/g, " ")

  const r = rail.toLowerCase().replace(/_/g, " ")

  if (r === "ach" || r.includes("ach")) {
    if (achType.includes("pull")) return "ACH Pull"
    if (achType.includes("push")) return "ACH Push"
    return "ACH"
  }
  if (r === "wire" || r.includes("wire") || r.includes("fedwire")) return "Wire"
  if (r === "sepa" || r.includes("sepa")) {
    if (sepaHint.includes("instant")) return "SEPA Instant"
    return "SEPA"
  }
  if (r.includes("swift")) return "SWIFT"
  if (r.includes("faster") || r === "fps") return "Faster Payments"
  if (r.includes("bacs")) return "BACS"

  if (r && r !== "unknown") {
    return r
      .split(" ")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  }

  const currency = String(meta.fiat_deposit_currency ?? meta.settled_currency ?? "USD").toUpperCase()
  if (currency === "EUR") return "SEPA"
  if (currency === "GBP") return "Faster Payments"
  return "Bank"
}

function paymentRailHint(meta: Record<string, unknown>): string {
  return readMetaString(meta, "source_payment_rail") || readMetaString(meta, "payment_rail")
}

export function buildBankDepositProcessingDescription(schemeLabel: string): string {
  const scheme = String(schemeLabel || "").trim() || "Bank"
  return `We've received your ${scheme} deposit and confirming it.`
}
