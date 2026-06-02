import {
  corridorMatchesCountryCurrency,
  type PayoutCorridorPublic,
  type PayoutFieldsSchemaHint,
  type PayoutRail,
} from "./payout-corridor"
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

/** Noah `ProcessingSeconds` tier for NG/GH/ZA bank (fast corridors; confirm copy is separate). */
export const NG_BANK_ARRIVAL_PROCESSING_SECONDS = 50

/** Send confirm + payout review for NG/GH/ZA bank transfers. */
export const SEND_ARRIVAL_WITHIN_MINUTES = "Within minutes"

const WITHIN_MINUTES_BANK_COUNTRIES = new Set(["NG", "GH", "ZA"])
const WITHIN_MINUTES_BANK_CURRENCIES = new Set(["NGN", "GHS", "ZAR"])

export function isWithinMinutesBankPayoutCorridor(input: {
  countryCode?: string | null
  currencyCode?: string | null
  rail?: PayoutRail
}): boolean {
  if (input.rail !== "bank_transfer") return false
  const cc = String(input.countryCode || "").trim().toUpperCase()
  if (WITHIN_MINUTES_BANK_COUNTRIES.has(cc)) return true
  const cur = String(input.currencyCode || "").trim().toUpperCase()
  return WITHIN_MINUTES_BANK_CURRENCIES.has(cur)
}

/**
 * Product arrival SLA for bank corridors where Noah reports 86400 but settlement is fast (GH, ZA).
 * Keeps confirm copy aligned with NG-style corridors.
 */
export function resolvePayoutProcessingSeconds(input: {
  countryCode: string
  rail: PayoutRail
  fromNoah?: number
}): number | undefined {
  const cc = String(input.countryCode || "").trim().toUpperCase()
  if (input.rail === "bank_transfer" && (cc === "GH" || cc === "ZA")) {
    return NG_BANK_ARRIVAL_PROCESSING_SECONDS
  }
  return input.fromNoah
}

/** Find corridor row + fields_schema for country/currency/rail. */
export function findPayoutFieldsSchema(
  corridors: PayoutCorridorPublic[] | null | undefined,
  input: { countryCode: string; currencyCode: string; rail: PayoutRail },
): PayoutFieldsSchemaHint | null {
  if (!corridors?.length) return null
  const row = corridors.find((c) =>
    corridorMatchesCountryCurrency(c, {
      countryCode: input.countryCode,
      currencyCode: input.currencyCode,
      rail: input.rail,
    }),
  )
  const schema = row?.fields_schema ?? null
  if (!schema) return null
  const processing_seconds = resolvePayoutProcessingSeconds({
    countryCode: input.countryCode,
    rail: input.rail,
    fromNoah: schema.processing_seconds,
  })
  if (processing_seconds === schema.processing_seconds) return schema
  return { ...schema, processing_seconds }
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

/** Recipient form: ZA BankLocal and similar require phone on the saved row. */
export function recipientFormNeedsPhone(hints: PayoutFieldsSchemaHint | null | undefined): boolean {
  return Boolean(hints?.needs_phone)
}

/** Persist ISO2 country on recipient rows (picker value or currency default). */
export function countryCodeForRecipientSave(input: {
  countryCode?: string | null
  currencyCode: string
}): string {
  return resolvePayoutCountryCode({
    countryCode: input.countryCode,
    currencyCode: input.currencyCode,
  })
}

/** Amount screen: validate receive amount against Noah max and effective min (Noah ∪ business policy). */
export function validatePayoutAmountAgainstLimits(input: {
  amount: number
  hints: PayoutFieldsSchemaHint | null | undefined
  currencyCode?: string
  rail?: PayoutRail
  /** Easetag P2P is internal ledger — no Noah fiat payout minimums. */
  isEasetag?: boolean
}): SendAmountFieldValidation {
  if (input.isEasetag) return { ok: true }
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

/** Confirm / review: Easetag P2P and on-chain wallet sends. */
export const SEND_ARRIVAL_WITHIN_SECONDS = "Within seconds"

/**
 * Confirm screen: human-readable arrival hint from Noah `ProcessingSeconds`.
 * Buckets are product copy (not literal second-for-second estimates).
 */
export function formatPayoutArrivalHint(processingSeconds?: number): string | null {
  if (processingSeconds == null || processingSeconds <= 0) return null
  if (processingSeconds < 120) return "Within a minute"
  if (processingSeconds < 86400) return "Within a few hours"
  const days = Math.max(1, Math.round(processingSeconds / 86400))
  return days === 1 ? "1 business day" : `${days} business days`
}

/** Send confirm Arrival row — fiat uses Noah seconds; Easetag and wallet are instant ledger/on-chain. */
export function resolveSendConfirmArrivalHint(input: {
  isEasetag?: boolean
  isWalletSend?: boolean
  processingSeconds?: number | null
  countryCode?: string | null
  currencyCode?: string | null
  rail?: PayoutRail
}): string | null {
  if (input.isEasetag || input.isWalletSend) return SEND_ARRIVAL_WITHIN_SECONDS
  const countryCode = resolvePayoutCountryCode({
    countryCode: input.countryCode,
    currencyCode: input.currencyCode ?? "",
  })
  if (
    isWithinMinutesBankPayoutCorridor({
      countryCode,
      currencyCode: input.currencyCode,
      rail: input.rail,
    })
  ) {
    return SEND_ARRIVAL_WITHIN_MINUTES
  }
  return formatPayoutArrivalHint(input.processingSeconds ?? undefined)
}
