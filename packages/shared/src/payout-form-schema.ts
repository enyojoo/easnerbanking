import {
  corridorMatchesCountryCurrency,
  type PayoutCorridorPublic,
  type PayoutFieldsSchemaHint,
  type PayoutProviderId,
  type PayoutRail,
} from "./payout-corridor"
import { unwrapNoahFieldsSchema } from "./yc-recipient-schema"
import { getCountryCodeForCurrency } from "./flags/currency-mapping"
import { parsePayoutMinAmount, resolveEffectivePayoutMin } from "./payout-business-limits"
import { formatMoneyDisplay } from "./format-money-display"
import type { YcPayInAmountValidation } from "./yc-pay-in-limits"

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

/** @deprecated Use Noah channel `ProcessingSeconds` via `resolvePayoutProcessingSeconds`. */
export const NG_BANK_ARRIVAL_PROCESSING_SECONDS = 50

/** Fast fiat tier copy when Noah reports ~50s (see `formatPayoutArrivalHint`). */
export const SEND_ARRIVAL_WITHIN_MINUTES = "Within minutes"

/** @deprecated Prefer `formatPayoutArrivalHint` from stored `processing_seconds`. */
export function isWithinMinutesBankPayoutCorridor(_input: {
  countryCode?: string | null
  currencyCode?: string | null
  rail?: PayoutRail
}): boolean {
  return false
}

/** Pass through Noah `ProcessingSeconds` – confirm copy comes from `formatPayoutArrivalHint`. */
export function resolvePayoutProcessingSeconds(input: {
  countryCode: string
  rail: PayoutRail
  fromNoah?: number
}): number | undefined {
  void input.countryCode
  void input.rail
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
  const schema = unwrapNoahFieldsSchema(row?.fields_schema)
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

function payoutProviderNeedsHolderAddress(
  payoutProvider: PayoutProviderId | null | undefined,
): boolean {
  const provider = payoutProvider ?? "noah"
  return provider !== "grid" && provider !== "yellowcard"
}

/** Bank recipient forms that collect holder postal address (Noah US/CAD / schema hints). */
export function recipientFormShowsAddress(input: {
  hints: PayoutFieldsSchemaHint | null | undefined
  currencyCode: string
  countryCode?: string | null
  payoutProvider?: PayoutProviderId | null
}): boolean {
  if (!payoutProviderNeedsHolderAddress(input.payoutProvider)) return false
  const country = String(input.countryCode ?? "").trim().toUpperCase()
  const currency = input.currencyCode.trim().toUpperCase()
  if (country === "US" || currency === "USD") return true
  return recipientFormNeedsAddress({ hints: input.hints, currencyCode: input.currencyCode })
}

export function recipientHolderAddressFieldsPresent(input: {
  addressLine1?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
}): boolean {
  return [input.addressLine1, input.city, input.state, input.postalCode].every(
    (value) => String(value ?? "").trim().length > 0,
  )
}

/** Amount-screen Continue: Noah needs holder address and the saved row is missing it. */
export function recipientNeedsHolderAddressBeforeSend(input: {
  rail?: PayoutRail | null
  isWallet?: boolean
  isEasetag?: boolean
  hints: PayoutFieldsSchemaHint | null | undefined
  currencyCode: string
  countryCode?: string | null
  payoutProvider?: PayoutProviderId | null
  addressLine1?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
}): boolean {
  if (input.isWallet || input.isEasetag) return false
  if (input.rail && input.rail !== "bank_transfer") return false
  if (
    !recipientFormShowsAddress({
      hints: input.hints,
      currencyCode: input.currencyCode,
      countryCode: input.countryCode,
      payoutProvider: input.payoutProvider,
    })
  ) {
    return false
  }
  return !recipientHolderAddressFieldsPresent(input)
}

export const RECIPIENT_HOLDER_ADDRESS_REQUIRED_TITLE = "Address required"
export const RECIPIENT_HOLDER_ADDRESS_REQUIRED_BODY_BEFORE =
  "This recipient needs an address. Kindly go to the recipient section "
export const RECIPIENT_HOLDER_ADDRESS_REQUIRED_LINK_LABEL = "here"
export const RECIPIENT_HOLDER_ADDRESS_REQUIRED_BODY_AFTER =
  " to edit and add it. Otherwise, go back and create this receiver as a new recipient."
export const RECIPIENT_HOLDER_ADDRESS_REQUIRED_BODY = `${RECIPIENT_HOLDER_ADDRESS_REQUIRED_BODY_BEFORE}${RECIPIENT_HOLDER_ADDRESS_REQUIRED_LINK_LABEL}${RECIPIENT_HOLDER_ADDRESS_REQUIRED_BODY_AFTER}`
export const RECIPIENT_HOLDER_ADDRESS_REQUIRED_EDIT_CTA = "Edit recipient"
export const RECIPIENT_HOLDER_ADDRESS_REQUIRED_BACK_CTA = "Go back"

/** Recipient form: ZA BankLocal and similar require phone on the saved row. */
export function recipientFormNeedsPhone(hints: PayoutFieldsSchemaHint | null | undefined): boolean {
  return Boolean(hints?.needs_phone)
}

/** Recipient form: ID BankLocal and similar require SWIFT/BIC (BankCode) on save. */
export function recipientFormNeedsBankCode(hints: PayoutFieldsSchemaHint | null | undefined): boolean {
  return Boolean(hints?.needs_bank_code)
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
  /** Easetag P2P is internal ledger – no Noah fiat payout minimums. */
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

/** Inverse of send-entry receive normalization: receive ÷ customerRate → send budget. */
export function deriveSendBudgetFromReceiveAmount(
  receiveAmount: number,
  customerRate: number,
): number {
  if (!Number.isFinite(receiveAmount) || receiveAmount <= 0) return 0
  if (!Number.isFinite(customerRate) || customerRate <= 0) return 0
  return Math.round((receiveAmount / customerRate) * 100) / 100
}

/**
 * Amount screen limit check – when entry mode is send, over-max copy uses send currency.
 */
export function validatePayoutAmountAgainstLimitsForEntry(input: {
  amountEntryMode?: "send" | "receive"
  receiveAmount: number
  customerRate?: number
  sendCurrency?: string
  hints: PayoutFieldsSchemaHint | null | undefined
  currencyCode?: string
  rail?: PayoutRail
  isEasetag?: boolean
}): SendAmountFieldValidation {
  const receiveCheck = validatePayoutAmountAgainstLimits({
    amount: input.receiveAmount,
    hints: input.hints,
    currencyCode: input.currencyCode,
    rail: input.rail,
    isEasetag: input.isEasetag,
  })
  if (receiveCheck.ok || input.amountEntryMode !== "send") return receiveCheck

  const cur = input.currencyCode?.trim().toUpperCase() || ""
  const sendCur = input.sendCurrency?.trim().toUpperCase() || ""
  const rate = input.customerRate ?? 0
  const maxRaw = input.hints?.limits?.max
  const max = maxRaw != null ? Number.parseFloat(String(maxRaw)) : NaN

  if (Number.isFinite(max) && input.receiveAmount > max && rate > 0 && sendCur) {
    const maxSend = deriveSendBudgetFromReceiveAmount(max, rate)
    const label = formatPayoutLimitLabel(maxSend)
    return { ok: false, message: `Maximum you can send is ~${label} ${sendCur}.` }
  }

  const effectiveMin =
    cur.length > 0
      ? resolveEffectivePayoutMin({
          hints: input.hints,
          currencyCode: cur,
          rail: input.rail,
        })
      : null
  if (effectiveMin != null && input.receiveAmount < effectiveMin && rate > 0 && sendCur) {
    const minSend = deriveSendBudgetFromReceiveAmount(effectiveMin, rate)
    const label = formatPayoutLimitLabel(minSend)
    return { ok: false, message: `Minimum you can send is ~${label} ${sendCur}.` }
  }

  return receiveCheck
}

/** Validate local-currency pay-in amount against Noah fields_schema + business policy mins. */
export function validateNoahPayInLocalAmount(input: {
  localPayIn: number
  currency: string
  hints?: PayoutFieldsSchemaHint | null
  rail?: PayoutRail
}): YcPayInAmountValidation {
  const currency = input.currency.trim().toUpperCase()
  const rail = input.rail ?? "bank_transfer"
  const amount = input.localPayIn
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: "Enter a valid amount." }
  }
  const effectiveMin = resolveEffectivePayoutMin({
    hints: input.hints,
    currencyCode: currency,
    rail,
  })
  if (effectiveMin != null && amount < effectiveMin) {
    return {
      ok: false,
      message: `Minimum deposit is ${formatMoneyDisplay(effectiveMin, currency)}.`,
    }
  }
  const maxRaw = input.hints?.limits?.max
  if (maxRaw != null && String(maxRaw).trim() !== "") {
    const max = Number.parseFloat(String(maxRaw).replace(/,/g, ""))
    if (Number.isFinite(max) && max > 0 && amount > max) {
      return {
        ok: false,
        message: `Maximum deposit is ${formatMoneyDisplay(max, currency)}.`,
      }
    }
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
  if (processingSeconds < 120) return SEND_ARRIVAL_WITHIN_MINUTES
  if (processingSeconds < 86400) return "Within a few hours"
  const days = Math.max(1, Math.round(processingSeconds / 86400))
  return days === 1 ? "1 business day" : `${days} business days`
}

/** Send confirm Arrival row – fiat uses Noah seconds; Easetag and wallet are instant ledger/on-chain. */
export function resolveSendConfirmArrivalHint(input: {
  isEasetag?: boolean
  isWalletSend?: boolean
  processingSeconds?: number | null
  countryCode?: string | null
  currencyCode?: string | null
  rail?: PayoutRail
}): string | null {
  if (input.isEasetag || input.isWalletSend) return SEND_ARRIVAL_WITHIN_SECONDS
  return formatPayoutArrivalHint(input.processingSeconds ?? undefined)
}
