"use client"

import { useMemo, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { formatOfficeDate as formatDate, formatOfficeTimestamp as formatTimestamp } from "@/lib/format-office-date"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Search, Download, Filter, X, ArrowRight } from "lucide-react"
import {
  formatMoneyDisplay,
  ledgerTransactionStatusDisplay,
  type LedgerTransactionStatusTone,
} from "@easner/shared"
import { prefetchOfficeTransactionDetail, useOfficeTransactionsList, useQueryInitialLoading } from "@/hooks/queries"
import type { OfficeTransaction, OfficeTransactionsSummary } from "@/lib/types/office-transaction"
import { OFFICE_TRANSACTION_PROVIDERS } from "@/lib/types/office-transaction"
import { officeProviderLabel } from "@/lib/case/status"
import { officeTransactionDetailHref, officeTransactionDetailId } from "@/lib/office-transaction-path"
import { OfficeQueryError } from "@/components/data/office-data-status"

const STATUS_FILTER_LABELS: Record<string, string> = {
  completed: "Completed",
  pending: "Pending",
  processing: "Processing",
  failed: "Failed",
}

function statusToneBadgeVariant(
  tone: LedgerTransactionStatusTone,
): "emerald" | "amber" | "oxblood" | "slate" | "outline" {
  switch (tone) {
    case "completed":
      return "emerald"
    case "pending":
      return "amber"
    case "processing":
      return "outline"
    case "failed":
      return "oxblood"
    case "cancelled":
      return "slate"
    default:
      return "outline"
  }
}

function TransactionStatusBadge({ ledgerStatus }: { ledgerStatus: string }) {
  const { label, tone } = ledgerTransactionStatusDisplay(ledgerStatus)
  return (
    <Badge variant={statusToneBadgeVariant(tone)} className="inline-flex items-center">
      {label}
    </Badge>
  )
}

function formatDirectionLabel(direction: string | null | undefined): string {
  return String(direction || "out").toLowerCase() === "in" ? "In" : "Out"
}

function transactionIdDisplay(tx: OfficeTransaction): string {
  return tx.easner_transaction_id || tx.provider_transaction_id || tx.id
}

function WhoDisplay({ transaction }: { transaction: OfficeTransaction }) {
  const who = transaction.who || "–"
  const businessName = String(transaction.business?.name || "").trim()
  const email = String(transaction.user?.email || "").trim()
  return (
    <div>
      <div className="font-medium">{who}</div>
      {businessName && businessName !== who ? (
        <div className="text-xs text-gray-500">{businessName}</div>
      ) : null}
      {email ? <div className="text-sm text-gray-500">{email}</div> : null}
    </div>
  )
}

function transactionAmountFormatted(tx: OfficeTransaction): string {
  const formatted = String(tx.amountFormatted || "").trim()
  if (formatted) return formatted
  return formatMoneyDisplay(Number(tx.displayAmount ?? tx.amount ?? 0) || 0, tx.displayCurrency || tx.currency || "USD")
}

function transactionImpactFormatted(tx: OfficeTransaction): string {
  const impact = String(tx.impactFormatted || "").trim()
  if (impact) return impact
  const balance = String(tx.balanceFormatted || "").trim()
  if (balance) return balance
  return "–"
}

function formatVolumeBalanceSide(
  side: OfficeTransactionsSummary["volumeBalance"]["USD"] | undefined,
  currency: "USD" | "EUR",
): string {
  if (!side) return formatMoneyDisplay(0, currency)
  return formatMoneyDisplay(side.total, currency)
}

export default function AdminTransactionsPage() {
  const router = useRouter()
  const queryClient = useQueryClient()

  const [searchTerm, setSearchTerm] = useState("")
  const [openId, setOpenId] = useState("")
  const [directionFilter, setDirectionFilter] = useState<"all" | "in" | "out">("all")
  const [currencyFilter, setCurrencyFilter] = useState("all")
  const [providerFilter, setProviderFilter] = useState("all")
  const [ycModeFilter, setYcModeFilter] = useState("all")
  const [railFilter, setRailFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")

  const showYcFilters = providerFilter === "all" || providerFilter === "yellowcard"

  const serverFilters = useMemo(
    () => ({
      provider: providerFilter === "all" ? undefined : providerFilter,
      ycMode: showYcFilters && ycModeFilter !== "all" ? ycModeFilter : undefined,
      rail: showYcFilters && railFilter !== "all" ? railFilter : undefined,
      status: statusFilter === "all" ? undefined : statusFilter,
    }),
    [providerFilter, ycModeFilter, railFilter, statusFilter, showYcFilters],
  )

  const transactionsQuery = useOfficeTransactionsList(serverFilters)

  const transactions = useMemo(
    () => transactionsQuery.data?.pages.flatMap((page) => page.transactions) ?? [],
    [transactionsQuery.data],
  )
  const summary = transactionsQuery.data?.pages[0]?.summary
  const hasNextPage = transactionsQuery.hasNextPage
  const transactionsLoading = useQueryInitialLoading(transactionsQuery.isPending, transactionsQuery.data, transactions)
  const transactionsError =
    transactionsQuery.error instanceof Error
      ? transactionsQuery.error.message
      : transactionsQuery.error
        ? String(transactionsQuery.error)
        : null

  const deferredSearchTerm = useDebouncedValue(searchTerm, 250)
  const filteredTransactions = useMemo(() => {
    const needle = deferredSearchTerm.toLowerCase()
    return transactions.filter((transaction) => {
      const matchesSearch =
        needle === "" ||
        transaction.id.toLowerCase().includes(needle) ||
        String(transaction.label || "").toLowerCase().includes(needle) ||
        String(transaction.who || "").toLowerCase().includes(needle) ||
        String(transaction.productLabel || "").toLowerCase().includes(needle) ||
        String(transaction.provider_transaction_id || "").toLowerCase().includes(needle) ||
        String(transaction.easner_transaction_id || "").toLowerCase().includes(needle) ||
        String(transaction.user?.email || "").toLowerCase().includes(needle) ||
        String(transaction.business?.name || "").toLowerCase().includes(needle)

      const matchesDirection =
        directionFilter === "all" || (transaction.direction || "out") === directionFilter
      const matchesCurrency =
        currencyFilter === "all" ||
        String(transaction.displayCurrency || transaction.currency || "").toUpperCase() === currencyFilter

      return matchesSearch && matchesDirection && matchesCurrency
    })
  }, [transactions, deferredSearchTerm, directionFilter, currencyFilter])

  const currencyOptions = useMemo(
    () =>
      Array.from(
        new Set(
          transactions
            .map((t) => String(t.displayCurrency || t.currency || "").toUpperCase())
            .filter((code) => code.length > 0),
        ),
      ).sort(),
    [transactions],
  )

  const hasActiveFilters =
    searchTerm ||
    statusFilter !== "all" ||
    currencyFilter !== "all" ||
    directionFilter !== "all" ||
    providerFilter !== "all" ||
    ycModeFilter !== "all" ||
    railFilter !== "all"

  const handleExport = () => {
    const csvContent = [
      [
        "ID",
        "Label",
        "Product",
        "Easner ID",
        "Provider",
        "Provider Tx ID",
        "Direction",
        "Display amount",
        "Impact amount",
        "Status",
        "Ledger Status",
        "Date",
        "Who",
      ].join(","),
      ...filteredTransactions.map((t) => {
        const { label: statusLabel } = ledgerTransactionStatusDisplay(t.status)
        return [
          t.id,
          String(t.label || ""),
          t.productLabel || "",
          t.easner_transaction_id || "",
          officeProviderLabel(t.provider),
          t.provider_transaction_id || "",
          formatDirectionLabel(t.direction),
          transactionAmountFormatted(t),
          transactionImpactFormatted(t),
          statusLabel,
          t.status,
          formatTimestamp(t.occurred_at || t.created_at),
          t.who || "",
        ].join(",")
      }),
    ].join("\n")

    const blob = new Blob([csvContent], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "transactions.csv"
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const clearFilters = () => {
    setSearchTerm("")
    setStatusFilter("all")
    setCurrencyFilter("all")
    setDirectionFilter("all")
    setProviderFilter("all")
    setYcModeFilter("all")
    setRailFilter("all")
  }

  function handleProviderChange(next: string) {
    setProviderFilter(next)
    if (next !== "all" && next !== "yellowcard") {
      setYcModeFilter("all")
      setRailFilter("all")
    }
  }

  function handleOpenId(event: FormEvent) {
    event.preventDefault()
    const id = openId.trim()
    if (!id) return
    prefetchOfficeTransactionDetail(queryClient, id)
    router.push(`/transactions/${encodeURIComponent(id)}`)
  }

  function warmTransaction(tx: OfficeTransaction) {
    prefetchOfficeTransactionDetail(queryClient, officeTransactionDetailId(tx))
  }

  function openTransaction(tx: OfficeTransaction) {
    warmTransaction(tx)
    router.push(officeTransactionDetailHref(tx))
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transaction Management</h1>
        </div>
        <Button
          onClick={handleExport}
          variant="outline"
          title="Exports the currently loaded rows after active filters – load more pages to include older transactions"
        >
          <Download className="h-4 w-4 mr-2" />
          Export loaded
        </Button>
      </div>
      <OfficeQueryError
        message={transactionsError}
        hasData={transactions.length > 0}
        onRetry={() => void transactionsQuery.refetch()}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">USD balance volume</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {formatVolumeBalanceSide(summary?.volumeBalance.USD, "USD")}
            </p>
            {summary?.volumeBalance.USD ? (
              <p className="mt-1 text-xs text-gray-500">
                In {formatMoneyDisplay(summary.volumeBalance.USD.moneyIn, "USD")} · Out{" "}
                {formatMoneyDisplay(summary.volumeBalance.USD.moneyOut, "USD")}
              </p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">EUR balance volume</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {formatVolumeBalanceSide(summary?.volumeBalance.EUR, "EUR")}
            </p>
            {summary?.volumeBalance.EUR ? (
              <p className="mt-1 text-xs text-gray-500">
                In {formatMoneyDisplay(summary.volumeBalance.EUR.moneyIn, "EUR")} · Out{" "}
                {formatMoneyDisplay(summary.volumeBalance.EUR.moneyOut, "EUR")}
              </p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">User-visible transactions</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {(summary?.transactionCount ?? transactions.length).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={directionFilter} onValueChange={(v) => setDirectionFilter(v as "all" | "in" | "out")}>
            <TabsList className="bg-gray-100">
              <TabsTrigger value="all" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
                All Transactions
              </TabsTrigger>
              <TabsTrigger value="out" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
                Outgoing
              </TabsTrigger>
              <TabsTrigger value="in" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
                Incoming
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <Input
              placeholder="Filter loaded rows by label, ID or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 h-12 text-base"
            />
            {searchTerm ? (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            ) : null}
          </div>

          <form onSubmit={handleOpenId} className="flex min-w-[260px] items-center gap-2">
            <Input
              value={openId}
              onChange={(e) => setOpenId(e.target.value)}
              placeholder="Open ETID, provider ID, or UUID"
              className="h-12"
              aria-label="Open transaction by ID"
            />
            <Button type="submit" variant="outline" className="h-12 shrink-0">
              Open
            </Button>
          </form>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px] bg-white">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-gray-500" />
                <SelectValue placeholder="Status" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>

          <Select value={providerFilter} onValueChange={handleProviderChange}>
            <SelectTrigger className="w-[160px] bg-white">
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Providers</SelectItem>
              {OFFICE_TRANSACTION_PROVIDERS.map((provider) => (
                <SelectItem key={provider} value={provider}>
                  {officeProviderLabel(provider)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {showYcFilters ? (
            <>
              <Select value={ycModeFilter} onValueChange={setYcModeFilter}>
                <SelectTrigger className="w-[180px] bg-white">
                  <SelectValue placeholder="YC mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All YC modes</SelectItem>
                  <SelectItem value="fund_balance">Fund balance</SelectItem>
                  <SelectItem value="cross_border_send">Cross-border</SelectItem>
                  <SelectItem value="balance_payout">Balance payout</SelectItem>
                </SelectContent>
              </Select>

              <Select value={railFilter} onValueChange={setRailFilter}>
                <SelectTrigger className="w-[160px] bg-white">
                  <SelectValue placeholder="Rail" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All rails</SelectItem>
                  <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                  <SelectItem value="mobile_money">Mobile money</SelectItem>
                </SelectContent>
              </Select>
            </>
          ) : null}

          <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
            <SelectTrigger className="w-[160px] bg-white">
              <SelectValue placeholder="Currency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Currencies</SelectItem>
              {currencyOptions.map((code) => (
                <SelectItem key={code} value={code}>
                  {code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasActiveFilters ? (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-gray-600 hover:text-gray-900">
              <X className="h-4 w-4 mr-1" />
              Clear filters
            </Button>
          ) : null}
        </div>

        {hasActiveFilters ? (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-200">
            <span className="text-sm text-gray-500">Active filters:</span>
            {directionFilter !== "all" ? (
              <Badge variant="outline">
                Direction: {directionFilter === "out" ? "Outgoing" : "Incoming"}
                <button onClick={() => setDirectionFilter("all")} className="ml-2 rounded-full p-0.5 hover:bg-muted">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ) : null}
            {statusFilter !== "all" ? (
              <Badge variant="slate">
                Status: {STATUS_FILTER_LABELS[statusFilter] ?? statusFilter}
                <button onClick={() => setStatusFilter("all")} className="ml-2 rounded-full p-0.5 hover:bg-muted">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ) : null}
            {providerFilter !== "all" ? (
              <Badge variant="outline">
                Provider: {officeProviderLabel(providerFilter)}
                <button onClick={() => setProviderFilter("all")} className="ml-2 rounded-full p-0.5 hover:bg-muted">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ) : null}
            {showYcFilters && ycModeFilter !== "all" ? (
              <Badge variant="outline">
                YC mode: {ycModeFilter.replace(/_/g, " ")}
                <button onClick={() => setYcModeFilter("all")} className="ml-2 rounded-full p-0.5 hover:bg-muted">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ) : null}
            {showYcFilters && railFilter !== "all" ? (
              <Badge variant="outline">
                Rail: {railFilter.replace(/_/g, " ")}
                <button onClick={() => setRailFilter("all")} className="ml-2 rounded-full p-0.5 hover:bg-muted">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ) : null}
            {currencyFilter !== "all" ? (
              <Badge variant="emerald">
                Currency: {currencyFilter}
                <button onClick={() => setCurrencyFilter("all")} className="ml-2 rounded-full p-0.5 hover:bg-primary/20">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ) : null}
            {searchTerm ? (
              <Badge variant="secondary" className="bg-gray-50 text-gray-700 border-gray-200">
                Search: &quot;{searchTerm}&quot;
                <button onClick={() => setSearchTerm("")} className="ml-2 hover:bg-gray-100 rounded-full p-0.5">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ) : null}
            <span className="text-sm text-gray-500 ml-2">
              {filteredTransactions.length} {filteredTransactions.length === 1 ? "transaction" : "transactions"}
            </span>
          </div>
        ) : null}
      </div>

      <Card>
        <CardContent>
          {transactionsLoading ? (
            <div className="space-y-3 py-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Easner ID</TableHead>
                    <TableHead>When</TableHead>
                    <TableHead>Who</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Impact</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions.map((transaction) => (
                    <TableRow
                      key={transaction.id}
                      className="cursor-pointer"
                      onClick={() => openTransaction(transaction)}
                      onPointerEnter={() => warmTransaction(transaction)}
                      onFocus={() => warmTransaction(transaction)}
                    >
                      <TableCell>
                        <div
                          className="font-mono text-sm truncate max-w-[220px]"
                          title={transactionIdDisplay(transaction)}
                        >
                          {transactionIdDisplay(transaction)}
                        </div>
                        <div className="text-xs text-gray-500">{formatDirectionLabel(transaction.direction)}</div>
                      </TableCell>
                      <TableCell>{formatDate(transaction.occurred_at || transaction.created_at)}</TableCell>
                      <TableCell>
                        <WhoDisplay transaction={transaction} />
                      </TableCell>
                      <TableCell>
                        {transaction.productLabel ? (
                          <Badge variant="outline">{transaction.productLabel}</Badge>
                        ) : (
                          "–"
                        )}
                      </TableCell>
                      <TableCell>{officeProviderLabel(transaction.provider)}</TableCell>
                      <TableCell>
                        <div className="font-medium tabular-nums">{transactionAmountFormatted(transaction)}</div>
                      </TableCell>
                      <TableCell>
                        <div className="tabular-nums text-sm text-gray-700">
                          {transactionImpactFormatted(transaction)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-between gap-2">
                          <TransactionStatusBadge ledgerStatus={transaction.status} />
                          <ArrowRight className="h-4 w-4 text-gray-400" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {filteredTransactions.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No transactions found matching your criteria.</div>
              ) : null}

              {hasNextPage ? (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    onClick={() => void transactionsQuery.fetchNextPage()}
                    disabled={transactionsQuery.isFetchingNextPage}
                  >
                    {transactionsQuery.isFetchingNextPage ? "Loading..." : "Load more"}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
