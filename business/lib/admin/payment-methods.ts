import { randomUUID } from "crypto"

/** Columns clients must not send as null on insert (breaks NOT NULL / defaults). */
const INSERT_STRIP_KEYS = new Set(["id", "created_at", "updated_at"])

const PATCH_STRIP_KEYS = new Set(["id", "created_at"])

/**
 * Build a safe row for `payment_methods` insert.
 * Legacy tables may lack `DEFAULT gen_random_uuid()` on `id`.
 */
export function buildPaymentMethodInsertPayload(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const row: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(body)) {
    if (INSERT_STRIP_KEYS.has(key)) continue
    if (value === undefined) continue
    row[key] = value
  }

  const currency = String(row.currency ?? "").trim().toUpperCase()
  const type = String(row.type ?? "").trim()
  const name = String(row.name ?? "").trim()

  if (!currency || !type || !name) {
    throw new Error("currency, type, and name are required")
  }

  const now = new Date().toISOString()
  row.currency = currency
  row.type = type
  row.name = name
  row.status = row.status ?? "active"
  row.is_default = row.is_default === true
  row.created_at = now
  row.updated_at = now
  row.id = randomUUID()

  return row
}

export function buildPaymentMethodPatchPayload(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }

  for (const [key, value] of Object.entries(body)) {
    if (PATCH_STRIP_KEYS.has(key)) continue
    if (value === undefined) continue
    row[key] = value
  }

  if (typeof row.currency === "string") {
    row.currency = row.currency.trim().toUpperCase()
  }

  return row
}
