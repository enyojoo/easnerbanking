"use client"

import { useState, useMemo, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { getDateRange, ledgerListRangeParams } from "@/lib/transactions"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  TrendingUp,
  TrendingDown,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  Search,
  Download,
  DollarSign,
} from "lucide-react"
import { DateRangeFilter, type TimePeriod } from "@/components/date-range-filter"
import { Button } from "@/components/ui/button"
import { formatCurrency, formatDate } from "@/lib/utils"
import { useTransactionsCached } from "@/hooks/use-transactions-cached"
import { useTransactionsSummary } from "@/hooks/queries/use-transactions"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { formatTransactionRowDateTime, transactionStatusRowPresentation } from "@/lib/transaction-row-present"
import { useTurnkeyLedgerRepair } from "@/hooks/use-turnkey-ledger-repair"
import { TransactionDetailPrefetchLink } from "@/components/transactions/transaction-detail-prefetch-link"
import { transactionWebDetailPath } from "@/lib/easner-transaction-id"
import {
  hasHistoricalBaseCurrencyMismatch,
  REPORTING_FX_BASE_CHANGE_NOTE,
} from "@/lib/fx/base-currency-display"
import { PlatformTransactionsPage } from "@/components/console/platform-transactions-page"
import { useAppSurface } from "@/lib/use-app-surface"

function exportToCsv(
  transactions: {
    description: string
    type: string
    source: string
    amount: number
    direction: string
    status: string
    reference?: string
    fee?: number
    date: string
    displayCurrency?: string
  }[],
) {
  const headers = ["Date", "Description", "Type", "Source", "Amount", "Currency", "Status", "Reference", "Fee"]
  const rows = transactions.map((t) => [
    formatDate(t.date),
    `"${(t.description ?? "").replace(/"/g, '""')}"`,
    t.type.toUpperCase(),
    t.source === "account" ? "Account" : "Card",
    t.direction === "credit" ? `+${Math.abs(t.amount).toFixed(2)}` : `-${Math.abs(t.amount).toFixed(2)}`,
    t.displayCurrency || "USD",
    t.status,
    t.reference ?? "",
    t.fee !== undefined && t.fee > 0 ? t.fee.toFixed(2) : "",
  ])
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function TransactionsPage() {
  const surface = useAppSurface()
  if (surface === "platform") return <PlatformTransactionsPage />
  return <BankingTransactionsPage />
}

function BankingTransactionsPage() {
  const [statusFilter, setStatusFilter] = useState("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("all")
  const [customDateRange, setCustomDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  })
  const listRange = ledgerListRangeParams({ timePeriod, customDateRange })
  const {
    data: rows,
    loading: listLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useTransactionsCached(listRange)
  const showListSkeleton = listLoading && rows.length === 0
  useTurnkeyLedgerRepair()
  const { baseCurrency: profileBaseCurrency } = useBusinessProfile()
  const baseCurrencyCode = (profileBaseCurrency || "USD").toUpperCase()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [displayCount, setDisplayCount] = useState(10)
  const moneyFlow = useTransactionsSummary({
    from: listRange.from,
    to: listRange.to,
    baseCurrency: baseCurrencyCode,
  })

  useEffect(() => {
    const status = searchParams.get("status")
    const period = searchParams.get("period")
    const search = searchParams.get("search")
    if (status && ["completed", "pending", "processing", "failed"].includes(status)) setStatusFilter(status)
    if (period && ["all", "7d", "30d", "90d", "1y", "custom"].includes(period)) setTimePeriod(period as TimePeriod)
    if (search) setSearchTerm(search)
  }, [searchParams])

  useEffect(() => {
    if (showListSkeleton) return
    const id = searchParams.get("txnId") || searchParams.get("transaction")
    if (!id) return
    const match = rows.find((t) => t.id === id)
    const next = new URLSearchParams(searchParams.toString())
    next.delete("txnId")
    next.delete("transaction")
    const qs = next.toString()
    router.replace(qs ? `/transactions?${qs}` : "/transactions", { scroll: false })
    if (match) {
      router.push(transactionWebDetailPath(match.id, { returnTo: "transactions" }))
    }
  }, [showListSkeleton, rows, searchParams, router])

  const { start, end } = getDateRange({ timePeriod, customDateRange })

  const filteredTransactions = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    let result = rows.filter((t) => {
      const d = new Date(t.date).getTime()
      if (d < start.getTime() || d > end.getTime()) return false
      if (statusFilter !== "all") {
        const bucket =
          t.status === "processing_payment" && statusFilter === "processing"
            ? "processing"
            : t.status
        if (bucket !== statusFilter) return false
      }
      if (q) {
        const hay = `${t.description} ${t.reference || ""} ${t.autopayoutConfigId || ""}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    result = [...result].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    return result
  }, [rows, start, end, statusFilter, searchTerm])

  const displayedTransactions = filteredTransactions.slice(0, displayCount)
  const hasMoreLocal = displayCount < filteredTransactions.length
  const hasMore = hasMoreLocal || Boolean(hasNextPage)

  const totalCredit = moneyFlow.data?.moneyIn ?? 0
  const totalDebit = moneyFlow.data?.moneyOut ?? 0
  const showMoneyFlowPending = moneyFlow.isPending && moneyFlow.data == null
  const summaryCurrency = baseCurrencyCode

  const showBaseChangeNote = useMemo(
    () => hasHistoricalBaseCurrencyMismatch(filteredTransactions, baseCurrencyCode),
    [filteredTransactions, baseCurrencyCode],
  )

  const handleFilterChange = (setter: (value: string) => void) => (value: string) => {
    setter(value)
    setDisplayCount(10)
  }

  const handleTimePeriodChange = (period: TimePeriod) => {
    setTimePeriod(period)
    setDisplayCount(10)
  }

  const handleExport = () => {
    exportToCsv(filteredTransactions)
  }

  const hasActiveFilters = statusFilter !== "all" || searchTerm.trim() !== ""
  const resultCount = hasActiveFilters
    ? filteredTransactions.length
    : (moneyFlow.data?.count ?? filteredTransactions.length)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Transactions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Incoming and outgoing account activity for your business.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 sm:flex-initial sm:min-w-[200px] sm:w-[200px] shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setDisplayCount(10)
              }}
              className="pl-9 h-8 text-xs bg-transparent"
            />
          </div>
          <DateRangeFilter
            timePeriod={timePeriod}
            customDateRange={customDateRange}
            onTimePeriodChange={handleTimePeriodChange}
            onCustomDateRangeChange={setCustomDateRange}
            triggerClassName="min-w-[140px]"
          />
          <Select value={statusFilter} onValueChange={handleFilterChange(setStatusFilter)}>
            <SelectTrigger className="min-w-[140px] w-[140px] h-8 min-h-8 max-h-8 text-xs px-3 py-1.5 bg-transparent shrink-0">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-2 shrink-0"
            onClick={handleExport}
            disabled={showListSkeleton}
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          {showListSkeleton || showMoneyFlowPending ? (
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
              <div className="space-y-2 text-center">
                <div className="mx-auto h-4 w-24 animate-pulse rounded bg-muted" />
                <div className="mx-auto h-9 w-40 max-w-full animate-pulse rounded bg-muted" />
              </div>
              <div className="space-y-2 text-center">
                <div className="mx-auto h-4 w-24 animate-pulse rounded bg-muted" />
                <div className="mx-auto h-9 w-40 max-w-full animate-pulse rounded bg-muted" />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
              <div className="text-center">
                <div className="mb-2 flex items-center justify-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  <p className="text-sm text-muted-foreground">Money in</p>
                </div>
                <p className="text-3xl font-semibold tracking-tight tabular-nums text-primary">
                  +{formatCurrency(totalCredit, summaryCurrency)}
                </p>
              </div>
              <div className="text-center">
                <div className="mb-2 flex items-center justify-center gap-2">
                  <TrendingDown className="h-5 w-5 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Money out</p>
                </div>
                <p className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                  -{formatCurrency(totalDebit, summaryCurrency)}
                </p>
              </div>
            </div>
          )}
          {!showListSkeleton && showBaseChangeNote ? (
            <p className="text-xs text-muted-foreground mt-6 border-t border-border pt-4">
              {REPORTING_FX_BASE_CHANGE_NOTE}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {showListSkeleton ? (
            <div className="space-y-3 p-4">
              <div className="h-16 animate-pulse rounded-md bg-muted" />
              <div className="h-16 animate-pulse rounded-md bg-muted" />
              <div className="h-16 animate-pulse rounded-md bg-muted" />
            </div>
          ) : filteredTransactions.length === 0 ?
            <div className="py-12 text-center">
              <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center mx-auto mb-4">
                <DollarSign className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No transactions found</h3>
              <p className="text-sm text-muted-foreground">
                {hasActiveFilters ? "Try adjusting your filters or search terms" : "No activity yet"}
              </p>
            </div>
          : <>
              <div className="divide-y">
                {displayedTransactions.map((txn) => {
                  const statusRow = transactionStatusRowPresentation(txn.status, txn.statusLabel)
                  return (
                    <TransactionDetailPrefetchLink
                      key={txn.id}
                      href={transactionWebDetailPath(txn.id, { returnTo: "transactions" })}
                      txId={txn.id}
                      className="flex min-w-0 items-center gap-3 p-4 transition-colors hover:bg-muted/50 cursor-pointer"
                    >
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background ${
                          txn.direction === "credit" ? "text-primary" : "text-muted-foreground"
                        }`}
                      >
                        {txn.direction === "credit" ?
                          <ArrowDownLeft className="h-4 w-4" />
                        : <ArrowUpRight className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {(txn.description ?? "").replace(/^Transfer to\s+/i, "")}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {txn.reference &&
                          txn.reference !== txn.id &&
                          !txn.reference.startsWith("ETID")
                            ? txn.reference
                            : formatTransactionRowDateTime(txn.displayWhenAt ?? txn.date)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                        <p
                          className={`text-sm font-semibold tabular-nums ${txn.direction === "credit" ? "text-primary" : "text-foreground"}`}
                        >
                          {txn.direction === "credit" ? "+" : "-"}
                          {formatCurrency(Math.abs(txn.amount), txn.displayCurrency || "USD")}
                        </p>
                        <p className={`text-xs font-medium ${statusRow.className}`}>{statusRow.label}</p>
                      </div>
                    </TransactionDetailPrefetchLink>
                  )
                })}
              </div>
              {hasMore && (
                <div className="p-6 border-t flex justify-center">
                  <Button
                    variant="ghost"
                    className="gap-2"
                    disabled={isFetchingNextPage}
                    onClick={() => {
                      if (hasMoreLocal) {
                        setDisplayCount((prev) => prev + 10)
                      } else if (hasNextPage) {
                        void fetchNextPage()
                      }
                    }}
                  >
                    {isFetchingNextPage ? "Loading…" : "Load More"}
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          }
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground">
        {showListSkeleton ? "–" : `${resultCount} result${resultCount !== 1 ? "s" : ""}`}
      </div>
    </div>
  )
}
