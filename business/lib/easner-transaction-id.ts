import { generateTransactionId } from "@/lib/transaction-id"

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

export function readEasnerTransactionId(metadata: unknown): string | null {
  if (!isObject(metadata)) return null
  const value = metadata.easner_transaction_id
  const id = typeof value === "string" ? value.trim() : ""
  return id || null
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

export function displayEasnerTransactionId(input: {
  easnerTransactionId?: string | null
  metadata?: Record<string, unknown> | null
  providerTransactionId?: string | null
  occurredAt?: string | null
  createdAt?: string | null
  fallbackId?: string | null
}): string {
  const fromColumn = String(input.easnerTransactionId || "").trim()
  if (fromColumn) return fromColumn

  const fromMeta = readEasnerTransactionId(input.metadata)
  if (fromMeta) return fromMeta

  const providerTxId = String(input.providerTransactionId || "").trim()
  if (providerTxId.startsWith("ETID")) return providerTxId

  const tsRaw = String(input.occurredAt || input.createdAt || "").trim()
  if (tsRaw) {
    const ms = new Date(tsRaw).getTime()
    if (Number.isFinite(ms) && ms > 0) {
      const last8Digits = String(ms).slice(-8)
      return `ETID${last8Digits}`
    }
  }

  const fallback = String(input.fallbackId || "").trim()
  return fallback || generateTransactionId()
}
