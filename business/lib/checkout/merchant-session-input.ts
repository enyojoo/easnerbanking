/** Validation for merchant-supplied input on `POST /v1/checkout/sessions`. */

export type MerchantSessionInputError = { ok: false; code: string; message: string }

const METADATA_MAX_KEYS = 20
const METADATA_MAX_KEY_LENGTH = 40
const METADATA_MAX_VALUE_LENGTH = 500

/**
 * Merchant metadata is echoed back on webhooks and receipts. `easner_*` keys are
 * the platform namespace – webhook routing depends on them – so they are refused
 * outright rather than silently dropped.
 */
export function validateMerchantMetadata(
  raw: unknown,
): { ok: true; metadata: Record<string, string> } | MerchantSessionInputError {
  if (raw === undefined || raw === null) return { ok: true, metadata: {} }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      code: "metadata_invalid",
      message: "metadata must be an object of string values",
    }
  }
  const entries = Object.entries(raw as Record<string, unknown>)
  if (entries.length > METADATA_MAX_KEYS) {
    return {
      ok: false,
      code: "metadata_too_many_keys",
      message: `metadata supports up to ${METADATA_MAX_KEYS} keys`,
    }
  }
  const metadata: Record<string, string> = {}
  for (const [key, value] of entries) {
    if (!key || key.length > METADATA_MAX_KEY_LENGTH) {
      return {
        ok: false,
        code: "metadata_key_invalid",
        message: `metadata keys must be 1–${METADATA_MAX_KEY_LENGTH} characters`,
      }
    }
    if (key.toLowerCase().startsWith("easner_")) {
      return {
        ok: false,
        code: "metadata_key_reserved",
        message: `metadata key "${key}" is reserved – the easner_ prefix is used by Easner`,
      }
    }
    const stringValue = typeof value === "string" ? value : String(value ?? "")
    if (stringValue.length > METADATA_MAX_VALUE_LENGTH) {
      return {
        ok: false,
        code: "metadata_value_too_long",
        message: `metadata values must be at most ${METADATA_MAX_VALUE_LENGTH} characters`,
      }
    }
    metadata[key] = stringValue
  }
  return { ok: true, metadata }
}

export type MerchantLineItem = {
  name: string
  amountCents: number
  quantity: number
  description: string | null
}

const LINE_ITEMS_MAX = 20
const LINE_ITEM_NAME_MAX_LENGTH = 250
const LINE_ITEM_MAX_QUANTITY = 999

/**
 * Every line item is honored (name, unit amount in cents, quantity). The session
 * total is the sum – `amount`, when also sent, must agree with it.
 */
export function parseMerchantLineItems(
  raw: unknown,
): { ok: true; items: MerchantLineItem[]; totalCents: number } | MerchantSessionInputError {
  if (raw === undefined || raw === null) return { ok: true, items: [], totalCents: 0 }
  if (!Array.isArray(raw)) {
    return { ok: false, code: "line_items_invalid", message: "line_items must be an array" }
  }
  if (raw.length > LINE_ITEMS_MAX) {
    return {
      ok: false,
      code: "line_items_too_many",
      message: `line_items supports up to ${LINE_ITEMS_MAX} items`,
    }
  }
  const items: MerchantLineItem[] = []
  let totalCents = 0
  for (const [index, entry] of raw.entries()) {
    const item = (entry ?? {}) as {
      name?: unknown
      amount?: unknown
      quantity?: unknown
      description?: unknown
    }
    const name = String(item.name ?? "").trim()
    if (!name || name.length > LINE_ITEM_NAME_MAX_LENGTH) {
      return {
        ok: false,
        code: "line_item_name_invalid",
        message: `line_items[${index}].name is required (1–${LINE_ITEM_NAME_MAX_LENGTH} characters)`,
      }
    }
    const amountCents = Math.round(Number(item.amount))
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return {
        ok: false,
        code: "line_item_amount_invalid",
        message: `line_items[${index}].amount must be a positive integer in cents`,
      }
    }
    const quantity = item.quantity === undefined ? 1 : Math.round(Number(item.quantity))
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > LINE_ITEM_MAX_QUANTITY) {
      return {
        ok: false,
        code: "line_item_quantity_invalid",
        message: `line_items[${index}].quantity must be between 1 and ${LINE_ITEM_MAX_QUANTITY}`,
      }
    }
    const description = String(item.description ?? "").trim() || null
    items.push({ name, amountCents, quantity, description })
    totalCents += amountCents * quantity
  }
  return { ok: true, items, totalCents }
}

const IDEMPOTENCY_KEY_MAX_LENGTH = 255

/** Trimmed `Idempotency-Key` header value, or null when absent/invalid-empty. */
export function parseIdempotencyKeyHeader(
  raw: string | null,
): { ok: true; key: string | null } | MerchantSessionInputError {
  const value = String(raw ?? "").trim()
  if (!value) return { ok: true, key: null }
  if (value.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    return {
      ok: false,
      code: "idempotency_key_too_long",
      message: `Idempotency-Key must be at most ${IDEMPOTENCY_KEY_MAX_LENGTH} characters`,
    }
  }
  return { ok: true, key: value }
}
