import { impactInStatementCurrency } from "./activity"
import type { StatementCurrency } from "./types"

export type StatementFlowSummary = {
  opening: number
  moneyIn: number
  moneyOut: number
  closing: number
}

export type StatementPeriodRow = { row: Record<string, unknown>; at: Date }

const round2 = (n: number) => Math.round(n * 100) / 100

function rowInstant(row: Record<string, unknown>): Date | null {
  const at = new Date(String(row.occurred_at ?? row.created_at ?? ""))
  return Number.isNaN(at.getTime()) ? null : at
}

/**
 * Split a completed ledger into the period's activity and its balance summary.
 *
 * `opening` is measured — the net the ledger reached before the period starts —
 * and `closing` is the period's own arithmetic. Neither is derived from the live
 * wallet balance: that is a snapshot of the wallet now, so back-solving from it
 * pushes any ledger-versus-wallet drift into `opening`, where it can surface as
 * a negative balance the account never held.
 *
 * `ledger` must already be filtered to completed, feed-visible rows in the
 * statement currency, ordered oldest first.
 */
export function splitStatementLedger(input: {
  ledger: Record<string, unknown>[]
  currency: StatementCurrency
  periodStartMs: number
  periodEndMs: number
}): { summary: StatementFlowSummary; inPeriod: StatementPeriodRow[] } {
  let opening = 0
  let moneyIn = 0
  let moneyOut = 0
  const inPeriod: StatementPeriodRow[] = []

  for (const row of input.ledger) {
    const at = rowInstant(row)
    if (!at) continue
    const ms = at.getTime()
    const signed =
      (String(row.direction ?? "").toLowerCase() === "in" ? 1 : -1) *
      impactInStatementCurrency(row, input.currency)

    if (ms < input.periodStartMs) {
      opening += signed
      continue
    }
    if (ms > input.periodEndMs) continue

    if (signed > 0) moneyIn += signed
    else if (signed < 0) moneyOut += -signed
    inPeriod.push({ row, at })
  }

  opening = round2(opening)
  moneyIn = round2(moneyIn)
  moneyOut = round2(moneyOut)
  return {
    summary: { opening, moneyIn, moneyOut, closing: round2(opening + moneyIn - moneyOut) },
    inPeriod,
  }
}
