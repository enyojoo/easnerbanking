import type { Transaction } from "@/lib/finance-types"
import type { TimePeriod } from "@/components/date-range-filter"

export type TransactionSource = "account" | "card"

export interface TransactionWithSource extends Transaction {
  source: TransactionSource
}

export type TransactionSortBy = "date" | "amount"

export interface GetTransactionsFilteredOptions {
  start: Date
  end: Date
  source?: "all" | TransactionSource
  type?: string
  status?: string
  search?: string
  cardId?: string
  sortBy?: TransactionSortBy
  sortOrder?: "asc" | "desc"
}

export interface DateRangeOptions {
  timePeriod: TimePeriod
  customDateRange: { from: Date | undefined; to: Date | undefined }
}

function startOfLocalDay(value: Date): Date {
  const next = new Date(value)
  next.setHours(0, 0, 0, 0)
  return next
}

function endOfLocalDay(value: Date): Date {
  const next = new Date(value)
  next.setHours(23, 59, 59, 999)
  return next
}

/**
 * Compute date range from time period and custom range.
 * Shared across dashboard, cards, and transactions pages.
 */
export function getDateRange(options: DateRangeOptions): { start: Date; end: Date } {
  const { timePeriod, customDateRange } = options
  const now = new Date()
  const startDate = new Date()

  if (timePeriod === "all") {
    return { start: new Date(0), end: endOfLocalDay(now) }
  }

  if (timePeriod === "custom") {
    if (customDateRange.from && customDateRange.to) {
      const start = startOfLocalDay(customDateRange.from)
      const end = endOfLocalDay(customDateRange.to)
      return start.getTime() <= end.getTime()
        ? { start, end }
        : { start: end, end: start }
    }
    return { start: new Date(0), end: endOfLocalDay(now) }
  }

  switch (timePeriod) {
    case "7d":
      startDate.setDate(now.getDate() - 7)
      break
    case "30d":
      startDate.setDate(now.getDate() - 30)
      break
    case "90d":
      startDate.setDate(now.getDate() - 90)
      break
    case "1y":
      startDate.setFullYear(now.getFullYear() - 1)
      break
  }

  return { start: startDate, end: now }
}

/**
 * Query params for the ledger list / money-flow summary.
 * All time omits bounds so pagination and totals cover the full feed.
 */
export function ledgerListRangeParams(options: DateRangeOptions): { from?: string; to?: string } {
  if (options.timePeriod === "all") return {}
  if (options.timePeriod === "custom" && (!options.customDateRange.from || !options.customDateRange.to)) {
    return {}
  }
  const { start, end } = getDateRange(options)
  return { from: start.toISOString(), to: end.toISOString() }
}

/**
 * Filter transactions by date range, source, type, status, search, and cardId.
 */
export function filterTransactions(
  transactions: TransactionWithSource[],
  options: GetTransactionsFilteredOptions
): TransactionWithSource[] {
  let result = [...transactions]

  const {
    start,
    end,
    source,
    type,
    status,
    search,
    cardId,
    sortBy = "date",
    sortOrder = "desc",
  } = options

  result = result.filter((txn) => {
    const txnDate = new Date(txn.date)
    if (txnDate < start || txnDate > end) return false
    if (source && source !== "all" && txn.source !== source) return false
    if (type && type !== "all" && txn.type !== type) return false
    if (status && status !== "all" && txn.status !== status) return false
    if (cardId && txn.cardId !== cardId) return false
    if (search) {
      const term = search.toLowerCase()
      const matches =
        txn.description.toLowerCase().includes(term) ||
        (txn.reference?.toLowerCase().includes(term) ?? false) ||
        txn.id.toLowerCase().includes(term)
      if (!matches) return false
    }
    return true
  })

  result = result.sort((a, b) => {
    if (sortBy === "date") {
      const diff = new Date(a.date).getTime() - new Date(b.date).getTime()
      return sortOrder === "desc" ? -diff : diff
    }
    const diff = Math.abs(a.amount) - Math.abs(b.amount)
    return sortOrder === "desc" ? -diff : diff
  })

  return result
}
