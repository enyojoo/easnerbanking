"use client"

import { useState, useMemo, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { getDateRange } from "@/lib/transactions"
import type { TransactionWithSource } from "@/lib/transactions"
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
import { TransactionDetailsDialog } from "@/components/transaction-details-dialog"
import { DateRangeFilter, type TimePeriod } from "@/components/date-range-filter"
import { Button } from "@/components/ui/button"
import { formatCurrency, formatDate } from "@/lib/utils"
import { useTransactionsCached } from "@/hooks/use-transactions-cached"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { useFxRates } from "@/hooks/queries"
import { formatTransactionRowDateTime, transactionStatusRowPresentation } from "@/lib/transaction-row-present"
import { useTurnkeyLedgerRepair } from "@/hooks/use-turnkey-ledger-repair"

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
    `"${t.description.replace(/"/g, '""')}"`,
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
  const { data: rows, loading: listLoading } = useTransactionsCached()
  useTurnkeyLedgerRepair()
  const { baseCurrency: profileBaseCurrency } = useBusinessProfile()
  const baseCurrencyCode = (profileBaseCurrency || "USD").toUpperCase()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionWithSource | null>(null)
  const [transactionDetailsOpen, setTransactionDetailsOpen] = useState(false)
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("all")
  const [customDateRange, setCustomDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  })
  const [displayCount, setDisplayCount] = useState(10)
  const { data: fxRates = [] } = useFxRates()

  useEffect(() => {
    const status = searchParams.get("status")
    const period = searchParams.get("period")
    if (status && ["completed", "pending", "processing", "failed"].includes(status)) setStatusFilter(status)
    if (period && ["7d", "30d", "90d", "1y", "custom"].includes(period)) setTimePeriod(period as TimePeriod)
  }, [searchParams])

  useEffect(() => {
    if (listLoading) return
    const id = searchParams.get("txnId") || searchParams.get("transaction")
    if (!id) return
    const match = rows.find((t) => t.id === id)
    const next = new URLSearchParams(searchParams.toString())
    next.delete("txnId")
    next.delete("transaction")
    const qs = next.toString()
    router.replace(qs ? `/transactions?${qs}` : "/transactions", { scroll: false })
    if (match) {
      setSelectedTransaction(match)
      setTransactionDetailsOpen(true)
    }
  }, [listLoading, rows, searchParams, router])

  const { start, end } = getDateRange({ timePeriod, customDateRange })

  const filteredTransactions = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    let result = rows.filter((t) => {
      const d = new Date(t.date).getTime()
      if (d < start.getTime() || d > end.getTime()) return false
      if (statusFilter !== "all" && t.status !== statusFilter) return false
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
  const hasMore = displayCount < filteredTransactions.length

  const getFxRate = (from: string, to: string): number | null => {
    const f = from.toUpperCase()
    const t = to.toUpperCase()
    if (f === t) return 1
    const direct = fxRates.find((r) => r.from_currency === f && r.to_currency === t)?.rate
    if (direct && Number.isFinite(direct) && direct > 0) return direct
    const inverse = fxRates.find((r) => r.from_currency === t && r.to_currency === f)?.rate
    if (inverse && Number.isFinite(inverse) && inverse > 0) return 1 / inverse
    return null
  }

  const amountInBase = (t: TransactionWithSource): number => {
    if (
      typeof t.baseAmount === "number" &&
      Number.isFinite(t.baseAmount) &&
      String(t.baseCurrency || "").toUpperCase() === baseCurrencyCode
    ) {
      return Math.abs(t.baseAmount)
    }
    const fromCurrency = String(t.displayCurrency || "USD").toUpperCase()
    if (fromCurrency === baseCurrencyCode) return Math.abs(t.amount)
    const rate = getFxRate(fromCurrency, baseCurrencyCode)
    if (!rate) return Math.abs(t.amount)
    return Math.abs(t.amount) * rate
  }

  const totalCredit = filteredTransactions
    .filter((t) => t.direction === "credit")
    .reduce((sum, t) => sum + amountInBase(t), 0)
  const totalDebit = filteredTransactions
    .filter((t) => t.direction === "debit")
    .reduce((sum, t) => sum + amountInBase(t), 0)

  const summaryCurrency = baseCurrencyCode

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
          <Button variant="outline" size="sm" className="h-8 gap-2 shrink-0" onClick={handleExport}>
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                <p className="text-sm text-muted-foreground">Money in</p>
              </div>
              <p className="text-3xl font-semibold tracking-tight tabular-nums text-primary">
                +{formatCurrency(totalCredit, summaryCurrency)}
              </p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <TrendingDown className="h-5 w-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Money out</p>
              </div>
              <p className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                -{formatCurrency(totalDebit, summaryCurrency)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {filteredTransactions.length === 0 ?
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
                  const cur = txn.displayCurrency || "USD"
                  const statusRow = transactionStatusRowPresentation(txn.status)
                  return (
                    <div
                      key={txn.id}
                      onClick={() => {
                        setSelectedTransaction(txn)
                        setTransactionDetailsOpen(true)
                      }}
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
                        <p className="truncate text-sm font-medium text-foreground">{txn.description}</p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {formatTransactionRowDateTime(txn.date)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                        <p
                          className={`text-sm font-semibold tabular-nums ${txn.direction === "credit" ? "text-primary" : "text-foreground"}`}
                        >
                          {txn.direction === "credit" ? "+" : "-"}
                          {formatCurrency(Math.abs(txn.amount), cur)}
                        </p>
                        <p className={`text-xs font-medium ${statusRow.className}`}>{statusRow.label}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
              {hasMore && (
                <div className="p-6 border-t flex justify-center">
                  <Button variant="ghost" className="gap-2" onClick={() => setDisplayCount((prev) => prev + 10)}>
                    Load More
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          }
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground">
        {filteredTransactions.length} result{filteredTransactions.length !== 1 ? "s" : ""}
      </div>

      <TransactionDetailsDialog
        open={transactionDetailsOpen}
        onOpenChange={setTransactionDetailsOpen}
        transaction={selectedTransaction}
      />
    </div>
  )
}
