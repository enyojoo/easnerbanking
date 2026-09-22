const ISO_BOUND = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/

/** Normalize a `from` / `to` query value to a UTC ISO instant, or null if invalid. */
export function parseLedgerListIsoBound(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim()
  if (!value) return null
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) return null
  const iso = new Date(ms).toISOString()
  return ISO_BOUND.test(iso) ? iso : null
}

export function applyLedgerListCreatedAtRange<
  T extends {
    gte: (column: string, value: string) => T
    lte: (column: string, value: string) => T
  },
>(query: T, from: string | null, to: string | null): T {
  let next = query
  if (from) next = next.gte("created_at", from)
  if (to) next = next.lte("created_at", to)
  return next
}
