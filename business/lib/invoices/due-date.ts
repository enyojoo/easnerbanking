/** Returns YYYY-MM-DD due date N days from today. */
export function dueDateFromPaymentTerms(days = 30): string {
  const n = Number.isFinite(days) && days > 0 ? Math.floor(days) : 30
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export function normalizePaymentTermsDays(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw)
  if (!Number.isFinite(n) || n < 1) return 30
  return Math.min(365, Math.floor(n))
}
