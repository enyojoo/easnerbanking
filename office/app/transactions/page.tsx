"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { OfficeDashboardLayout } from "@/components/layout/office-dashboard-layout"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Search,
  Download,
  Filter,
  Eye,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  X,
} from "lucide-react"
import {
  formatMoneyDisplay,
  ledgerStatusMatchesUserFilter,
  ledgerTransactionStatusDisplay,
  type LedgerTransactionStatusTone,
} from "@easner/shared"
import { officeFetch } from "@/lib/api-client"
import { officeKeys } from "@/lib/query/keys"
import { useOfficeAdminEnabled } from "@/hooks/queries"

interface ProviderLedgerTx {
  id: string
  provider?: string | null
  provider_transaction_id?: string | null
  easner_transaction_id?: string | null
  business_id?: string | null
  status: string
  created_at: string
  occurred_at?: string | null
  updated_at?: string
  direction?: "in" | "out" | null
  amount?: number | null
  currency?: string | null
  displayAmount?: number
  displayCurrency?: string
  label?: string
  amountFormatted?: string
  tx_hash?: string | null
  user?: {
    first_name: string
    last_name: string
    email: string
  }
}

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

function statusToneIcon(tone: LedgerTransactionStatusTone) {
  switch (tone) {
    case "completed":
      return <CheckCircle className="h-3 w-3 mr-1" />
    case "pending":
      return <Clock className="h-3 w-3 mr-1" />
    case "processing":
      return <AlertCircle className="h-3 w-3 mr-1" />
    case "failed":
    case "cancelled":
      return <XCircle className="h-3 w-3 mr-1" />
    default:
      return <AlertCircle className="h-3 w-3 mr-1" />
  }
}

function TransactionStatusBadge({ ledgerStatus }: { ledgerStatus: string }) {
  const { label, tone } = ledgerTransactionStatusDisplay(ledgerStatus)
  return (
    <Badge variant={statusToneBadgeVariant(tone)} className="inline-flex items-center">
      {statusToneIcon(tone)}
      {label}
    </Badge>
  )
}

function formatDirectionLabel(direction: string | null | undefined): string {
  return String(direction || "out").toLowerCase() === "in" ? "In" : "Out"
}

function formatProviderLabel(provider: string | null | undefined): string {
  const raw = String(provider || "").trim()
  if (!raw) return "—"
  if (raw.toLowerCase() === "easner_internal") return "EASETAG"
  return raw
}

function transactionLabel(tx: ProviderLedgerTx): string {
  const label = String(tx.label || "").trim()
  if (label) return label
  return tx.easner_transaction_id || tx.provider_transaction_id || tx.id
}

function transactionAmountFormatted(tx: ProviderLedgerTx): string {
  const formatted = String(tx.amountFormatted || "").trim()
  if (formatted) return formatted
  return formatMoneyDisplay(Number(tx.displayAmount ?? tx.amount ?? 0) || 0, tx.displayCurrency || tx.currency || "USD")
}

export default function AdminTransactionsPage() {
  const { enabled: transactionsEnabled } = useOfficeAdminEnabled()
  const transactionsQuery = useQuery({
    queryKey: officeKeys.transactions(),
    enabled: transactionsEnabled,
    staleTime: 60_000,
    queryFn: async (): Promise<ProviderLedgerTx[]> => {
      const r = await officeFetch("/api/admin/office/transactions?limit=200")
      const body = (await r.json()) as { transactions?: ProviderLedgerTx[]; error?: string }
      if (!r.ok || body.error) {
        throw new Error(typeof body.error === "string" ? body.error : r.statusText || "Failed to load transactions")
      }
      return (body.transactions ?? []).map((t) => ({
        ...t,
        id: String(t.id || ""),
        provider: t.provider ?? null,
        provider_transaction_id: t.provider_transaction_id ?? null,
        easner_transaction_id: t.easner_transaction_id ?? null,
        status: String(t.status || "pending"),
        created_at: String(t.created_at || ""),
        occurred_at: t.occurred_at ?? null,
        updated_at: t.updated_at ?? undefined,
        direction: (t.direction as "in" | "out" | null) ?? null,
        amount: t.amount ?? null,
        currency: t.currency ?? null,
        displayAmount: t.displayAmount ?? undefined,
        displayCurrency: t.displayCurrency ?? undefined,
        label: t.label ?? undefined,
        amountFormatted: t.amountFormatted ?? undefined,
        tx_hash: t.tx_hash ?? null,
        user: t.user
          ? {
              first_name: t.user.first_name || "",
              last_name: t.user.last_name || "",
              email: t.user.email || "",
            }
          : undefined,
      }))
    },
  })

  const transactions = transactionsQuery.data ?? []
  const transactionsLoading = transactionsQuery.isPending && transactions.length === 0

  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [directionFilter, setDirectionFilter] = useState<"all" | "in" | "out">("all")
  const [currencyFilter, setCurrencyFilter] = useState("all")
  const [selectedTransaction, setSelectedTransaction] = useState<ProviderLedgerTx | null>(null)

  const filteredTransactions = transactions.filter((transaction) => {
    const matchesSearch =
      searchTerm === "" ||
      transaction.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(transaction.label || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(transaction.provider_transaction_id || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(transaction.easner_transaction_id || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(transaction.user?.email || "").toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus = ledgerStatusMatchesUserFilter(transaction.status, statusFilter)
    const matchesDirection =
      directionFilter === "all" || (transaction.direction || "out") === directionFilter
    const matchesCurrency =
      currencyFilter === "all" ||
      String(transaction.displayCurrency || transaction.currency || "").toUpperCase() === currencyFilter

    return matchesSearch && matchesStatus && matchesDirection && matchesCurrency
  })
  const currencyOptions = Array.from(
    new Set(
      transactions
        .map((t) => String(t.displayCurrency || t.currency || "").toUpperCase())
        .filter((code) => code.length > 0),
    ),
  ).sort()

  const formatTimestamp = (dateString: string) => {
    const date = new Date(dateString)
    const month = date.toLocaleString("en-US", { month: "short" })
    const day = date.getDate().toString().padStart(2, "0")
    const year = date.getFullYear()
    const hours = date.getHours()
    const minutes = date.getMinutes().toString().padStart(2, "0")
    const ampm = hours >= 12 ? "PM" : "AM"
    const displayHours = hours % 12 || 12
    // Format: "Nov 07, 2025 • 7:29 PM"
    return `${month} ${day}, ${year} • ${displayHours}:${minutes} ${ampm}`
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const month = date.toLocaleString("en-US", { month: "short" })
    const day = date.getDate().toString().padStart(2, "0")
    const year = date.getFullYear()
    // Format: "Nov 07, 2025"
    return `${month} ${day}, ${year}`
  }

  const handleExport = () => {
    const csvContent = [
      ["ID", "Label", "Easner ID", "Provider", "Provider Tx ID", "Direction", "Amount", "Status", "Ledger Status", "Date", "User"].join(","),
      ...filteredTransactions.map((t) => {
        const { label: statusLabel } = ledgerTransactionStatusDisplay(t.status)
        return [
          t.id,
          transactionLabel(t),
          t.easner_transaction_id || "",
          formatProviderLabel(t.provider),
          t.provider_transaction_id || "",
          formatDirectionLabel(t.direction),
          transactionAmountFormatted(t),
          statusLabel,
          t.status,
          formatTimestamp(t.occurred_at || t.created_at),
          `${t.user?.first_name} ${t.user?.last_name}`,
        ].join(",")
      }),
    ].join("\n")

    const blob = new Blob([csvContent], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "transactions.csv"
    a.click()
  }

  return (
    <OfficeDashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Transaction Management</h1>
            <p className="text-gray-600">Monitor platform transactions</p>
          </div>
          <Button onClick={handleExport} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export Data
          </Button>
        </div>

        {/* Search and Filters */}
        <div className="space-y-4">
          {/* Search and Filters Row */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Type Filter Tabs */}
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

            {/* Search Bar */}
            <div className="relative flex-1 min-w-[300px]">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
              <Input
                placeholder="Search by label, ID or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-12 h-12 text-base"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px] bg-white">
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

            {/* Currency Filter */}
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

            {/* Clear Filters Button */}
            {(searchTerm || statusFilter !== "all" || currencyFilter !== "all" || directionFilter !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchTerm("")
                  setStatusFilter("all")
                  setCurrencyFilter("all")
                  setDirectionFilter("all")
                }}
                className="text-gray-600 hover:text-gray-900"
              >
                <X className="h-4 w-4 mr-1" />
                Clear filters
              </Button>
            )}
          </div>

          {/* Active Filters Badges */}
          {(searchTerm || statusFilter !== "all" || currencyFilter !== "all" || directionFilter !== "all") && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-200">
              <span className="text-sm text-gray-500">Active filters:</span>
              {directionFilter !== "all" && (
                <Badge variant="outline">
                  Direction: {directionFilter === "out" ? "Outgoing" : "Incoming"}
                  <button
                    onClick={() => setDirectionFilter("all")}
                    className="ml-2 rounded-full p-0.5 hover:bg-muted"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {statusFilter !== "all" && (
                <Badge variant="slate">
                  Status: {STATUS_FILTER_LABELS[statusFilter] ?? statusFilter}
                  <button
                    onClick={() => setStatusFilter("all")}
                    className="ml-2 rounded-full p-0.5 hover:bg-muted"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {currencyFilter !== "all" && (
                <Badge variant="emerald">
                  Currency: {currencyFilter}
                  <button
                    onClick={() => setCurrencyFilter("all")}
                    className="ml-2 rounded-full p-0.5 hover:bg-primary/20"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {searchTerm && (
                <Badge variant="secondary" className="bg-gray-50 text-gray-700 border-gray-200">
                  Search: &quot;{searchTerm}&quot;
                  <button
                    onClick={() => setSearchTerm("")}
                    className="ml-2 hover:bg-gray-100 rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              <span className="text-sm text-gray-500 ml-2">
                {filteredTransactions.length} {filteredTransactions.length === 1 ? "transaction" : "transactions"}
              </span>
            </div>
          )}
        </div>

        {/* Transactions Table */}
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
                  <TableHead>Transaction</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[4.5rem]">View</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.map((transaction: ProviderLedgerTx) => (
                  <TableRow key={transaction.id}>
                    <TableCell>
                      <div className="min-w-0">
                        <div className="font-medium truncate max-w-[280px]" title={transactionLabel(transaction)}>
                          {transactionLabel(transaction)}
                        </div>
                        {(transaction.easner_transaction_id || transaction.provider_transaction_id) && (
                          <div className="font-mono text-xs text-gray-500 truncate max-w-[280px]">
                            {transaction.easner_transaction_id || transaction.provider_transaction_id}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{formatDate(transaction.occurred_at || transaction.created_at)}</TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {transaction.user?.first_name} {transaction.user?.last_name}
                        </div>
                        <div className="text-sm text-gray-500">{transaction.user?.email}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{formatDirectionLabel(transaction.direction)}</span>
                    </TableCell>
                    <TableCell className="font-medium tabular-nums">
                      {transactionAmountFormatted(transaction)}
                    </TableCell>
                    <TableCell>
                      <TransactionStatusBadge ledgerStatus={transaction.status} />
                    </TableCell>
                    <TableCell>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" onClick={() => setSelectedTransaction(transaction)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
                          <DialogHeader>
                            <DialogTitle>Transaction Details</DialogTitle>
                          </DialogHeader>
                          {selectedTransaction && (
                            <div className="overflow-y-auto flex-1 pr-2 -mr-2 space-y-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                  <label className="text-sm font-medium text-gray-600">Transaction</label>
                                  <p className="font-medium">{transactionLabel(selectedTransaction)}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-gray-600">ID</label>
                                  <p className="font-mono text-xs break-all">{selectedTransaction.id}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-gray-600">Status</label>
                                  <div className="mt-1">
                                    <TransactionStatusBadge ledgerStatus={selectedTransaction.status} />
                                  </div>
                                  <p className="mt-1 text-xs text-gray-500 font-mono">
                                    Ledger: {selectedTransaction.status}
                                  </p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-gray-600">User</label>
                                  <p>
                                    {selectedTransaction.user?.first_name} {selectedTransaction.user?.last_name}
                                  </p>
                                  <p className="text-sm text-gray-500">{selectedTransaction.user?.email}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-gray-600">Date</label>
                                  <p>{formatTimestamp(selectedTransaction.created_at)}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-gray-600">Provider</label>
                                  <p className="font-medium">{formatProviderLabel(selectedTransaction.provider)}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-gray-600">Easner Tx ID</label>
                                  <p className="font-mono text-xs break-all">{selectedTransaction.easner_transaction_id || "—"}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-gray-600">Provider Tx ID</label>
                                  <p className="font-mono text-xs break-all">{selectedTransaction.provider_transaction_id || "—"}</p>
                                </div>
                                {selectedTransaction.tx_hash ? (
                                  <div className="col-span-2">
                                    <label className="text-sm font-medium text-gray-600">Tx hash</label>
                                    <p className="font-mono text-xs break-all">{selectedTransaction.tx_hash}</p>
                                  </div>
                                ) : null}
                                <div>
                                  <label className="text-sm font-medium text-gray-600">Direction</label>
                                  <p className="font-medium">{formatDirectionLabel(selectedTransaction.direction)}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-gray-600">Amount</label>
                                  <p className="font-medium tabular-nums">
                                    {transactionAmountFormatted(selectedTransaction)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {filteredTransactions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No transactions found matching your criteria.</div>
            ) : null}
            </>
            )}
          </CardContent>
        </Card>
      </div>
    </OfficeDashboardLayout>
  )
}
