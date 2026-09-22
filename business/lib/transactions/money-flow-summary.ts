import {
  isSuccessfulTransactionStatus,
  resolveReportingAmountForFeed,
  type ReportingFxRate,
} from "@easner/shared"

export type MoneyFlowRow = {
  direction?: string | null
  status?: string | null
} & Record<string, unknown>

export type MoneyFlowSummary = {
  moneyIn: number
  moneyOut: number
  count: number
  successfulCount: number
}

function isInboundDirection(direction: string): boolean {
  return direction === "credit" || direction === "in" || direction === "receive"
}

function isOutboundDirection(direction: string): boolean {
  return direction === "debit" || direction === "out" || direction === "send"
}

/**
 * Period money in / out for a full ledger set — not a page slice.
 * Same success + reporting rules as the business dashboard / transactions KPIs.
 */
export function sumMoneyFlows(
  rows: readonly MoneyFlowRow[],
  baseCurrency: string,
  fxRates: ReportingFxRate[],
): MoneyFlowSummary {
  let moneyIn = 0
  let moneyOut = 0
  let successfulCount = 0

  for (const row of rows) {
    if (!isSuccessfulTransactionStatus(String(row.status ?? ""))) continue
    const reporting = resolveReportingAmountForFeed(row, baseCurrency, fxRates)
    const amount = Math.abs(reporting?.reportingAmount ?? 0)
    const direction = String(row.direction ?? row.transaction_type ?? "").trim().toLowerCase()
    if (isInboundDirection(direction)) {
      moneyIn += amount
      successfulCount += 1
    } else if (isOutboundDirection(direction)) {
      moneyOut += amount
      successfulCount += 1
    }
  }

  return {
    moneyIn,
    moneyOut,
    count: rows.length,
    successfulCount,
  }
}
