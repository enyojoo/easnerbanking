import { NoahHttpError } from "@/lib/noah/http"

export type NoahPayoutErrorStage = "prepare" | "sell" | "quote"

export type NoahChannelLimitHints = {
  min?: string
  max?: string
  currency?: string
}

function readLimitString(value: unknown): string | undefined {
  if (value == null) return undefined
  const s = String(value).trim()
  return s || undefined
}

function pickLimitFields(obj: Record<string, unknown>): Partial<NoahChannelLimitHints> {
  const min =
    readLimitString(obj.MinLimit) ??
    readLimitString(obj.minLimit) ??
    readLimitString(obj.Min) ??
    readLimitString(obj.min)
  const max =
    readLimitString(obj.MaxLimit) ??
    readLimitString(obj.maxLimit) ??
    readLimitString(obj.Max) ??
    readLimitString(obj.max)
  const currency =
    readLimitString(obj.FiatCurrency) ??
    readLimitString(obj.Currency) ??
    readLimitString(obj.currency)
  return { ...(min ? { min } : {}), ...(max ? { max } : {}), ...(currency ? { currency } : {}) }
}

function mergeLimitHints(
  base: NoahChannelLimitHints,
  next: Partial<NoahChannelLimitHints>,
): NoahChannelLimitHints {
  return {
    min: next.min ?? base.min,
    max: next.max ?? base.max,
    currency: next.currency ?? base.currency,
  }
}

function walkForLimitHints(node: unknown, depth = 0): NoahChannelLimitHints {
  if (node == null || depth > 6) return {}
  if (typeof node !== "object") return {}

  let hints: NoahChannelLimitHints = {}
  if (Array.isArray(node)) {
    for (const item of node) {
      hints = mergeLimitHints(hints, walkForLimitHints(item, depth + 1))
    }
    return hints
  }

  const obj = node as Record<string, unknown>
  hints = mergeLimitHints(hints, pickLimitFields(obj))

  for (const key of ["Limits", "Request", "FiatAmount", "Extensions", "RequestExtension"]) {
    const child = obj[key]
    if (child != null) {
      hints = mergeLimitHints(hints, walkForLimitHints(child, depth + 1))
    }
  }

  for (const value of Object.values(obj)) {
    if (value != null && typeof value === "object") {
      const nested = walkForLimitHints(value, depth + 1)
      if (nested.min || nested.max || nested.currency) {
        hints = mergeLimitHints(hints, nested)
      }
    }
  }

  return hints
}

/** Parse min/max fiat hints from Noah prepare channel-limit error bodies. */
export function parseNoahChannelLimitHints(body: unknown): NoahChannelLimitHints {
  return walkForLimitHints(body)
}

function isChannelLimitMessage(msg: string): boolean {
  const m = msg.toLowerCase()
  return m.includes("channel limit") || m.includes("outside of channel limits")
}

function formatChannelLimitUserError(hints: NoahChannelLimitHints): string {
  const cur = hints.currency?.trim().toUpperCase()
  const suffix = cur ? ` ${cur}` : ""
  if (hints.min && hints.max) {
    return `This amount is outside the allowed range for this transfer. Try between ${hints.min} and ${hints.max}${suffix}.`
  }
  if (hints.max) {
    return `This amount exceeds the maximum for this transfer (${hints.max}${suffix}). Try a smaller amount.`
  }
  if (hints.min) {
    return `This amount is below the minimum for this transfer (${hints.min}${suffix}). Try a larger amount.`
  }
  return "This amount is outside the allowed range for this transfer. Try a smaller or larger amount."
}

function noahValidationDescriptions(body: unknown): string[] {
  if (!body || typeof body !== "object") return []
  const ext = (body as Record<string, unknown>).RequestExtension
  if (!ext || typeof ext !== "object") return []
  const items = (ext as Record<string, unknown>).Body
  if (!Array.isArray(items)) return []
  return items
    .map((item) => {
      if (!item || typeof item !== "object") return ""
      return String((item as Record<string, unknown>).Description || "").trim()
    })
    .filter(Boolean)
}

/** Map Noah prepare/sell API errors to user-facing copy. */
export function mapNoahPayoutUserError(
  e: unknown,
  stage: NoahPayoutErrorStage = "prepare",
): string {
  if (e instanceof NoahHttpError) {
    const validations = noahValidationDescriptions(e.body)
    const validationBlob = validations.join(" ").toLowerCase()
    if (
      validationBlob.includes("phone") &&
      (validationBlob.includes("+") || validationBlob.includes("international"))
    ) {
      return "Phone number must use international format with a + and country code (e.g. +27821234567 for South Africa). Edit the recipient and update the phone number."
    }

    const msg = (e.detail || e.message).toLowerCase()
    if (isChannelLimitMessage(msg) || validations.some((v) => isChannelLimitMessage(v))) {
      const hints = parseNoahChannelLimitHints(e.body)
      return formatChannelLimitUserError(hints)
    }
    if (msg.includes("reference")) {
      return "Payment reference is required or invalid for this corridor."
    }
    if (msg.includes("bank") && (msg.includes("enum") || msg.includes("invalid"))) {
      return "Selected bank is not valid for this corridor. Re-save the recipient and pick a bank from the list."
    }
    if (msg.includes("formsession") || (msg.includes("session") && msg.includes("expired"))) {
      return "This quote expired. Go back and tap Continue for a fresh quote."
    }
    if (
      e.status === 404 ||
      msg.includes("not found") ||
      msg.includes("resourcenotfound")
    ) {
      if (stage === "sell") {
        return "This quote expired. Go back and tap Continue for a fresh quote."
      }
      return "Payout channel is unavailable right now. Try again in a moment."
    }
    if (msg.includes("missing step") && msg.includes("cob")) {
      return "We couldn't verify this recipient with our payment partner. Check the bank name and account number, then try again."
    }
    if (msg.includes("form session") && msg.includes("not completed")) {
      return "Payout setup didn't finish. Go back and try again."
    }
    if (msg.includes("phone")) {
      return "A valid phone number is required for this payout."
    }
    if (
      msg.includes("street, city, state") ||
      (msg.includes("address") && msg.includes("postal"))
    ) {
      return "This US bank recipient needs a full address. Edit the recipient and add street, city, state, and ZIP."
    }
    if (msg.includes("paymentpurpose") || msg.includes("payment purpose")) {
      return "Payment purpose is required or not allowed for this corridor."
    }
    if (
      msg.includes("insufficient") ||
      msg.includes("balance") ||
      msg.includes("not enough")
    ) {
      return "Your balance is too low to complete this transfer."
    }
    if (msg.includes("cryptoauthorized") || msg.includes("authorized amount")) {
      return "The payout amount changed. Go back, tap Continue for a new quote, then confirm again."
    }
    if (
      e.status === 403 &&
      (msg.includes("channel policy") || msg.includes("implicitdeny"))
    ) {
      return "This payout country isn't available for your verification profile. You can send to corridors that match where you completed identity verification (for example, US verification supports US payouts). Contact support if you need access to additional countries."
    }
    if (e.status === 401 || e.status === 403) {
      return "Transfer authorization failed. Check your account verification status."
    }
    if (msg.includes("invalid request") || msg === "bad request") {
      if (stage === "sell") {
        return "We couldn't send this transfer, please try again."
      }
      return "We couldn't price this payout. Check the recipient details, then go back and tap Continue again."
    }
    const detail = (e.detail || e.message).trim()
    if (detail && detail.length <= 200 && !detail.toLowerCase().includes("noah api")) {
      return detail
    }
    return "Something went wrong with this payout. Please try again in a moment."
  }
  if (e instanceof Error) return e.message
  return String(e)
}

/** @deprecated Use `mapNoahPayoutUserError`. */
export function mapNoahPrepareError(e: unknown): string {
  return mapNoahPayoutUserError(e, "prepare")
}
