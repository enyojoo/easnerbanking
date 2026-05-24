import type { PayoutCorridorPublic, PayoutFieldsSchemaHint, PayoutRail } from "./payout-corridor"

export type { PayoutFieldsSchemaHint }

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

/** Validate note / payment purpose on send CTA per corridor hints. */
export function validateSendAmountFields(input: {
  hints: PayoutFieldsSchemaHint | null
  note: string
  paymentPurpose: string
  isEasetag?: boolean
}): SendAmountFieldValidation {
  if (input.isEasetag) return { ok: true }
  const mode = input.hints?.amount_field_mode ?? "note_optional_only"
  const note = input.note.trim()
  const purpose = input.paymentPurpose.trim()
  if (mode === "payment_purpose") {
    if (!purpose) {
      return { ok: false, message: "Select a payment purpose to continue." }
    }
    return { ok: true }
  }
  if (mode === "note" && !note) {
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

/** Amount screen: validate receive amount against Noah channel limits from fields_schema. */
export function validatePayoutAmountAgainstLimits(input: {
  amount: number
  hints: PayoutFieldsSchemaHint | null | undefined
  currencyCode?: string
}): SendAmountFieldValidation {
  const limits = input.hints?.limits
  if (!limits) return { ok: true }
  const cur = input.currencyCode?.trim().toUpperCase() || ""
  const min = limits.min != null ? Number.parseFloat(String(limits.min)) : NaN
  const max = limits.max != null ? Number.parseFloat(String(limits.max)) : NaN
  if (Number.isFinite(min) && input.amount < min) {
    const suffix = cur ? ` ${cur}` : ""
    return { ok: false, message: `Minimum payout amount is ${limits.min}${suffix}.` }
  }
  if (Number.isFinite(max) && input.amount > max) {
    const suffix = cur ? ` ${cur}` : ""
    return { ok: false, message: `Maximum payout amount is ${limits.max}${suffix}.` }
  }
  return { ok: true }
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
