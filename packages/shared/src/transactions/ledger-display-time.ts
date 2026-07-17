function pickIso(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (c == null) continue
    const s = String(c).trim()
    if (s) return s
  }
  return null
}

/**
 * User-facing transaction "when" — always the ledger row insert time (`created_at`).
 * Do not use `occurred_at` here; it may carry provider/webhook/settlement times after updates.
 */
export function resolveLedgerUserFacingCreatedAt(input: {
  createdAt?: string | null
}): string {
  return pickIso(input.createdAt) ?? new Date().toISOString()
}
