import type { PayoutCorridorPublic, PayoutFieldsSchemaHint, PayoutRail } from "./payout-corridor"
import { getCountryCodeForCurrency } from "./flags/currency-mapping"
import { parsePayoutMinAmount, resolveEffectivePayoutMin } from "./payout-business-limits"

export type { PayoutFieldsSchemaHint }

/** When a currency has no 1:1 ISO country (e.g. EUR), default corridor country for Noah hints/prepare. */
const PAYOUT_CURRENCY_DEFAULT_COUNTRY: Record<string, string> = {
  EUR: "DE",
}

/** Resolve ISO2 country for payout corridors when recipient rows omit country_code. */
export function resolvePayoutCountryCode(input: {
  countryCode?: string | null
  currencyCode: string
}): string {
  const fromRow = String(input.countryCode || "").trim().toUpperCase()
  if (fromRow) return fromRow
  const cur = String(input.currencyCode || "").trim().toUpperCase()
  if (!cur) return ""
  const mapped = getCountryCodeForCurrency(cur)
  if (mapped) return mapped.toUpperCase()
  return PAYOUT_CURRENCY_DEFAULT_COUNTRY[cur] ?? ""
}

export { parsePayoutMinAmount } from "./payout-business-limits"

/** Find corridor row + fields_schema for country/currency/rail. */
export function findPayoutFieldsSchema(
  corridors: PayoutCorridorPublic[],
  input: { countryCode: string; currencyCode: string; rail: PayoutRail },
): PayoutFieldsSchemaHint | null {
  const cc = input.countryCode.trim().toUpperCase()
  const cur = input.currencyCode.trim().toUpperCase()
  const row = corridors.find(
    (c) =>
      c.country_code.toUpperCase() === cc &&
      c.currency_code.toUpperCase() === cur &&
      c.rail === input.rail,
  )
  return row?.fields_schema ?? null
}

export type SendAmountFieldValidation = { ok: true } | { ok: false; message: string }

export type SendAmountNoteFieldUi = {
  mode: "note" | "payment_purpose" | "note_optional_only"
  label: string
  placeholder: string
}

function isUsOptionalReferenceCorridor(input: {
  hints: PayoutFieldsSchemaHint | null | undefined
  receiveCurrency?: string
}): boolean {
  const cur = String(input.receiveCurrency || "").trim().toUpperCase()
  const pmt = String(input.hints?.payment_method_type || "").toLowerCase()
  return cur === "USD" && (pmt.includes("ach") || pmt.includes("fedwire"))
}

/** Amount-screen note / reference copy from corridor hints (Easetag is always optional "Note"). */
export function getSendAmountNoteFieldUi(input: {
  hints: PayoutFieldsSchemaHint | null | undefined
  isEasetag?: boolean
  receiveCurrency?: string
}): SendAmountNoteFieldUi {
  if (input.isEasetag) {
    return { mode: "note_optional_only", label: "Note", placeholder: "Note" }
  }
  if (isUsOptionalReferenceCorridor(input)) {
    return { mode: "note_optional_only", label: "Note", placeholder: "Note" }
  }
  const mode = input.hints?.amount_field_mode ?? "note_optional_only"
  if (input.hints?.reference_optional) {
    return { mode: "note_optional_only", label: "Note", placeholder: "Note" }
  }
  if (mode === "payment_purpose") {
    return { mode, label: "Payment purpose", placeholder: "Select purpose" }
  }
  if (mode === "note") {
    return { mode, label: "Reference", placeholder: "Reference (required)" }
  }
  return { mode, label: "Note", placeholder: "Note" }
}

/** Validate note / payment purpose on send CTA per corridor hints. */
export function validateSendAmountFields(input: {
  hints: PayoutFieldsSchemaHint | null
  note: string
  paymentPurpose: string
  isEasetag?: boolean
  receiveCurrency?: string
}): SendAmountFieldValidation {
  if (input.isEasetag) return { ok: true }
  if (isUsOptionalReferenceCorridor(input)) return { ok: true }
  const mode = input.hints?.amount_field_mode ?? "note_optional_only"
  const note = input.note.trim()
  const purpose = input.paymentPurpose.trim()
  if (mode === "payment_purpose") {
    if (!purpose) {
      return { ok: false, message: "Select a payment purpose to continue." }
    }
    return { ok: true }
  }
  if (mode === "note" && !note && !input.hints?.reference_optional) {
    return { ok: false, message: "Enter a payment reference to continue." }
  }
  return { ok: true }
}

/** Recipient form: ZA and similar corridors require Email on the saved row. */
export function recipientFormNeedsEmail(hints: PayoutFieldsSchemaHint | null | undefined): boolean {
  return Boolean(hints?.needs_email)
}

/** Recipient form: ZA / CA BankLocal and similar require holder address on save. */
export function recipientFormNeedsAddress(input: {
  hints: PayoutFieldsSchemaHint | null | undefined
  currencyCode: string
}): boolean {
  if (input.hints?.needs_address) return true
  return input.currencyCode.trim().toUpperCase() === "CAD"
}

/** Amount screen: validate receive amount against Noah max and effective min (Noah ∪ business policy). */
export function validatePayoutAmountAgainstLimits(input: {
  amount: number
  hints: PayoutFieldsSchemaHint | null | undefined
  currencyCode?: string
  rail?: PayoutRail
}): SendAmountFieldValidation {
  const cur = input.currencyCode?.trim().toUpperCase() || ""
  const effectiveMin =
    cur.length > 0
      ? resolveEffectivePayoutMin({
          hints: input.hints,
          currencyCode: cur,
          rail: input.rail,
        })
      : null
  const maxRaw = input.hints?.limits?.max
  const max = maxRaw != null ? Number.parseFloat(String(maxRaw)) : NaN

  if (effectiveMin != null && input.amount < effectiveMin) {
    const suffix = cur ? ` ${cur}` : ""
    const label = formatPayoutLimitLabel(effectiveMin)
    return { ok: false, message: `Minimum send amount is ${label}${suffix}.` }
  }
  if (Number.isFinite(max) && input.amount > max) {
    const suffix = cur ? ` ${cur}` : ""
    return { ok: false, message: `Maximum payout amount is ${maxRaw}${suffix}.` }
  }
  return { ok: true }
}

function formatPayoutLimitLabel(amount: number): string {
  if (Number.isInteger(amount) || Math.abs(amount - Math.round(amount)) < 1e-9) {
    return Math.round(amount).toLocaleString("en-US")
  }
  return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Confirm screen: human-readable arrival hint from ProcessingSeconds. */
export function formatPayoutArrivalHint(processingSeconds?: number): string | null {
  if (processingSeconds == null || processingSeconds <= 0) return null
  if (processingSeconds < 120) return "Arrives in about 1–2 minutes"
  if (processingSeconds < 3600) {
    const mins = Math.max(1, Math.round(processingSeconds / 60))
    return `Arrives in about ${mins} minute${mins === 1 ? "" : "s"}`
  }
  if (processingSeconds < 86400) {
    const hours = Math.max(1, Math.round(processingSeconds / 3600))
    return `Arrives in about ${hours} hour${hours === 1 ? "" : "s"}`
  }
  const days = Math.max(1, Math.round(processingSeconds / 86400))
  return days === 1 ? "Arrives in about 1 business day" : `Arrives in about ${days} business days`
}
