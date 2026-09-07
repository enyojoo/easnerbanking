import { impactInStatementCurrency } from "./activity"
import type { StatementCurrency } from "./types"

export type StatementFlowSummary = {
  moneyIn: number
  moneyOut: number
}

export type StatementPeriodRow = { row: Record<string, unknown>; at: Date }

const round2 = (n: number) => Math.round(n * 100) / 100

function rowInstant(row: Record<string, unknown>): Date | null {
  const at = new Date(String(row.occurred_at ?? row.created_at ?? ""))
  return Number.isNaN(at.getTime()) ? null : at
}

/**
 * Split a completed ledger into the period's activity and its money in/out.
 *
 * The statement reports measured flows and the live wallet balance, and no
 * period-boundary balance. An opening balance can only be as sound as the rows
 * behind it, and deriving one from the wallet snapshot puts every
 * ledger-versus-wallet difference into it — which read as a negative balance
 * the account never held.
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

    if (ms < input.periodStartMs) continue
    if (ms > input.periodEndMs) continue

    if (signed > 0) moneyIn += signed
    else if (signed < 0) moneyOut += -signed
    inPeriod.push({ row, at })
  }

  return {
    summary: { moneyIn: round2(moneyIn), moneyOut: round2(moneyOut) },
    inPeriod,
  }
}
