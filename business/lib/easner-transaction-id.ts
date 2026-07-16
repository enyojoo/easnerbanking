import { generateTransactionId } from "@/lib/transaction-id"

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

export function readEasnerTransactionId(metadata: unknown): string | null {
  if (!isObject(metadata)) return null
  const value = metadata.easner_transaction_id
  const id = typeof value === "string" ? value.trim() : ""
  if (!id || id.toLowerCase() === "null") return null
  return id
}

/** Whether `value` is a Postgres uuid text Supabase can compare to `transactions.id`. */
export function looksLikeUuidParam(value: string): boolean {
  const s = String(value || "").trim()
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
}

/**
 * Parses URL path segments like `etid55613389` or display `ETID55613389` into canonical **display**
 * form `ETID` + **8 decimal digits** (matches generators + SQL `transfer_easetag_p2p`).
 * Returns null if the string is not ETID-shaped (e.g. UUID provider ids stay unparsed).
 */
export function normalizeEasnerTransactionIdForLookup(raw: string): string | null {
  const t = String(raw || "").trim()
  const m = /^etid(\d{1,17})$/i.exec(t)
  if (!m) return null
  let digits = m[1]
  if (digits.length > 8) digits = digits.slice(-8)
  digits = digits.padStart(8, "0").slice(-8)
  return `ETID${digits}`
}

/**
 * Path segment for `/transactions/[etid]` only: lowercase `etid` + 8 digits.
 * Non-ETID ids (e.g. UUID) pass through unchanged for encodeURIComponent.
 */
export function easnerTransactionDisplayToUrlSegment(displayOrRawId: string): string {
  const norm = normalizeEasnerTransactionIdForLookup(displayOrRawId)
  if (norm) return `etid${norm.slice(4)}`
  return displayOrRawId
}

export type TransactionDetailReturnTo = "dashboard" | "transactions"

/** Next.js route `/transactions/...` — ETIDs use lowercase `etid` in the URL; UI copy stays uppercase `ETID`. */
export function transactionWebDetailPath(
  transactionId: string,
  opts?: { returnTo?: TransactionDetailReturnTo },
): string {
  const seg = easnerTransactionDisplayToUrlSegment(transactionId)
  const base = `/transactions/${encodeURIComponent(seg)}`
  if (opts?.returnTo) return `${base}?returnTo=${opts.returnTo}`
  return base
}

export function resolveTransactionDetailReturnPath(
  returnTo: string | null | undefined,
): "/dashboard" | "/transactions" | null {
  if (returnTo === "dashboard") return "/dashboard"
  if (returnTo === "transactions") return "/transactions"
  return null
}

export function ensureEasnerTransactionId(
  existingMetadata: Record<string, unknown> | null | undefined,
  incomingMetadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const merged = { ...(existingMetadata || {}), ...(incomingMetadata || {}) }
  const existingId = readEasnerTransactionId(merged)
  if (existingId) return merged
  return { ...merged, easner_transaction_id: generateTransactionId() }
}

/**
 * Display/reference id for a ledger row: prefer persisted ETID (column + metadata), then stable ids.
 * Does not invent synthetic `ETID…` values — those come from DB (`transfer_easetag_p2p`) or `ensureEasnerTransactionId` at write time.
 */
export function displayEasnerTransactionId(input: {
  easnerTransactionId?: string | null
  metadata?: Record<string, unknown> | null
  providerTransactionId?: string | null
  fallbackId?: string | null
}): string {
  const fromColumn = String(input.easnerTransactionId || "").trim()
  if (fromColumn && fromColumn.toLowerCase() !== "null") return fromColumn

  const fromMeta = readEasnerTransactionId(input.metadata)
  if (fromMeta) return fromMeta

  const providerTxId = String(input.providerTransactionId || "").trim()
  if (providerTxId.startsWith("ETID")) return providerTxId

  const fallback = String(input.fallbackId || "").trim()
  if (fallback) return fallback

  if (providerTxId) return providerTxId

  return ""
}
