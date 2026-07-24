/**
 * Parse Expo push `data` into a minimal mobile transaction row for instant detail first paint.
 * Full enriched detail still comes from GET /api/transactions/[id].
 */

export type PushTransactionSnapshotRow = {
  id?: string
  transaction_id?: string
  ledger_row_id?: string
  amount?: number
  currency?: string
  status?: string
  transaction_type?: "send" | "receive" | string
  created_at?: string
  name?: string
  display_description?: string
  display_hero_title?: string
  transaction_product?: string
  [key: string]: unknown
}

function readString(data: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = data[key]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return ""
}

function readNumber(data: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const v = data[key]
    const n = typeof v === "number" ? v : Number(v)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

/** Map ledger direction to mobile transaction_type. */
function directionToTransactionType(direction: string): "send" | "receive" | undefined {
  const d = direction.toLowerCase()
  if (d === "in" || d === "credit") return "receive"
  if (d === "out" || d === "debit") return "send"
  return undefined
}

/** Map settled ledger status to mobile feed status. */
function mapPushStatus(raw: string): string {
  const s = raw.toLowerCase()
  if (s === "settled") return "completed"
  if (s === "pending" || s === "processing") return s
  if (s === "failed" || s === "cancelled") return "failed"
  return s || "completed"
}

/**
 * Returns a partial row suitable for TransactionDetails `initialTransaction`, or null.
 */
export function parsePushTransactionSnapshot(
  data: Record<string, unknown> | undefined | null,
): PushTransactionSnapshotRow | null {
  if (!data || typeof data !== "object") return null

  const ledgerId = readString(data, "transactionId", "transaction_id")
  if (!ledgerId) return null

  const easnerId = readString(data, "easnerTransactionId", "easner_transaction_id")
  const direction = readString(data, "direction")
  const transactionType = directionToTransactionType(direction)
  const amount = readNumber(data, "amount")
  const currency = readString(data, "currency").toUpperCase() || "USD"
  const displayTitle = readString(data, "displayTitle", "display_title")
  const category = readString(data, "category")
  const statusRaw = readString(data, "status") || "settled"
  const createdAt = readString(data, "createdAt", "created_at") || new Date().toISOString()

  const displayId = easnerId || ledgerId

  return {
    id: displayId,
    transaction_id: displayId,
    ledger_row_id: ledgerId,
    amount: amount ?? 0,
    currency,
    status: mapPushStatus(statusRaw),
    transaction_type: transactionType,
    created_at: createdAt,
    noah_created_at: createdAt,
    name: displayTitle || category || undefined,
    display_description: displayTitle || category || undefined,
    display_hero_title: displayTitle || undefined,
    transaction_product: category || undefined,
  }
}

/** Collect cache lookup ids (ledger UUID + ETID when both present). */
export function pushTransactionDetailAliasIds(
  data: Record<string, unknown> | undefined | null,
): string[] {
  if (!data || typeof data !== "object") return []
  const ledgerId = readString(data, "transactionId", "transaction_id")
  const easnerId = readString(data, "easnerTransactionId", "easner_transaction_id")
  const ids = new Set<string>()
  if (ledgerId) ids.add(ledgerId)
  if (easnerId && easnerId !== ledgerId) ids.add(easnerId)
  return [...ids]
}
