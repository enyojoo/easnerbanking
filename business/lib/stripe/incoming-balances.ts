export type IncomingSettlementRow = {
  currency: string | null
  net_cents: number | null
  ledger_transaction_id?: string | null
}

/**
 * Sum unsettled Stripe invoice settlements per currency (major units).
 * Skips rows whose ledger transaction was removed (manual ops cleanup).
 */
export function sumIncomingBalances(
  rows: IncomingSettlementRow[],
  existingLedgerIds: ReadonlySet<string>,
): Record<string, number> {
  const byCurrency: Record<string, number> = {}

  for (const row of rows) {
    const ledgerId = String(row.ledger_transaction_id ?? "").trim()
    if (ledgerId && !existingLedgerIds.has(ledgerId)) continue

    const currency = String(row.currency ?? "").toUpperCase()
    if (!currency) continue

    const cents = Number(row.net_cents ?? 0)
    if (!Number.isFinite(cents) || cents <= 0) continue

    byCurrency[currency] = (byCurrency[currency] ?? 0) + cents
  }

  return Object.fromEntries(
    Object.entries(byCurrency).map(([currency, cents]) => [currency, cents / 100]),
  )
}
