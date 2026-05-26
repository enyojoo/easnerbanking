"use client"

import { useCallback } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { OfficeDashboardLayout } from "@/components/layout/office-dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Users,
  CreditCard,
  TrendingUp,
  AlertCircle,
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  Building2,
  FileText,
  UserPlus,
  SmartphoneNfc,
} from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { formatMoneyDisplay } from "@easner/shared"
import { officeFetch } from "@/lib/api-client"
import type { OfficeOverviewResponse, OfficeVolumeBalance } from "@/lib/types/office-overview"
import { officeKeys } from "@/lib/query/keys"
import { useOfficeAdminEnabled } from "@/hooks/queries"

const OFFICE_OVERVIEW_TTL_MS = 5 * 60 * 1000
const OVERVIEW_PRESET = "7d" as const

export default function AdminDashboardPage() {
  const { enabled } = useOfficeAdminEnabled()

  const fetchOverview = useCallback(async (): Promise<OfficeOverviewResponse> => {
    const r = await officeFetch(`/api/admin/office/overview?preset=${encodeURIComponent(OVERVIEW_PRESET)}`)
    const d = (await r.json()) as OfficeOverviewResponse & { error?: string }
    if (!r.ok || d.error) {
      throw new Error(typeof d.error === "string" ? d.error : r.statusText || "Overview request failed")
    }
    return d
  }, [])

  const {
    data: overview,
    isPending,
    error: overviewError,
  } = useQuery({
    queryKey: officeKeys.overview(OVERVIEW_PRESET),
    enabled,
    queryFn: fetchOverview,
    staleTime: OFFICE_OVERVIEW_TTL_MS,
    gcTime: OFFICE_OVERVIEW_TTL_MS * 2,
  })

  const loading = isPending && !overview
  const loadError =
    overviewError instanceof Error ? overviewError.message : overviewError ? String(overviewError) : null

  const getActivityIcon = (type: string) => {
    if (type.includes("card_funding")) {
      if (type.includes("completed")) {
        return <CheckCircle className="h-4 w-4 text-primary" />
      }
      if (type.includes("failed")) {
        return <XCircle className="h-4 w-4 text-destructive" />
      }
      if (type.includes("cancelled")) {
        return <XCircle className="h-4 w-4 text-muted-foreground" />
      }
      if (type.includes("processing")) {
        return <AlertCircle className="h-4 w-4 text-foreground" />
      }
      return <Clock className="h-4 w-4 text-[hsl(var(--warning))]" />
    }

    switch (type) {
      case "transaction_completed":
      case "transaction_settled":
      case "transaction_deposited":
        return <CheckCircle className="h-4 w-4 text-primary" />
      case "transaction_failed":
        return <XCircle className="h-4 w-4 text-destructive" />
      case "transaction_cancelled":
      case "transaction_canceled":
        return <XCircle className="h-4 w-4 text-muted-foreground" />
      case "transaction_processing":
      case "transaction_converting":
      case "transaction_converted":
      case "transaction_confirmed":
        return <AlertCircle className="h-4 w-4 text-foreground" />
      case "transaction_pending":
      case "transaction_unknown":
        return <Clock className="h-4 w-4 text-[hsl(var(--warning))]" />
      case "user_registered":
        return <Users className="h-4 w-4 text-foreground" />
      default:
        return <Activity className="h-4 w-4 text-muted-foreground" />
    }
  }

  const formatVolumeBalance = (vb: OfficeVolumeBalance | undefined) => {
    if (!vb) return "—"
    const parts: string[] = []
    if (vb.USD.total > 0) parts.push(formatMoneyDisplay(vb.USD.total, "USD"))
    if (vb.EUR.total > 0) parts.push(formatMoneyDisplay(vb.EUR.total, "EUR"))
    return parts.length > 0 ? parts.join(" · ") : formatMoneyDisplay(0, "USD")
  }

  const kpis = overview?.kpis
  const windowLabel = overview?.window?.preset === "7d" ? "last 7 days" : `window (${overview?.window?.preset ?? ""})`

  const txStatusVariant = (status: string): "emerald" | "amber" | "oxblood" | "slate" => {
    const s = status.toLowerCase()
    if (s === "completed" || s === "settled" || s === "deposited") return "emerald"
    if (s === "failed") return "oxblood"
    if (s === "pending" || s === "processing" || s === "converting") return "amber"
    return "slate"
  }

  return (
    <OfficeDashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-600 mt-1">Ledger and merchant metrics for the {windowLabel}</p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/transactions">All transactions</Link>
          </Button>
        </div>

        {loadError && <p className="text-sm text-destructive">{loadError}</p>}

        {/* KPI strip */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading && !kpis ? (
            <>
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </>
          ) : (
            <>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Total Transactions</CardTitle>
                  <CreditCard className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-gray-900">
                    {(kpis?.transactionCount ?? 0).toLocaleString()}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Total Volume</CardTitle>
                  <TrendingUp className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-gray-900">{formatVolumeBalance(kpis?.volumeBalance)}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    USD/EUR balance legs (pay-in + payout debits)
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Total Users</CardTitle>
                  <Users className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-gray-900">{(kpis?.totalUsers ?? 0).toLocaleString()}</div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Merchant */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Merchant</CardTitle>
          </CardHeader>
          <CardContent>
            {loading && !kpis ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <div className="flex flex-wrap items-stretch gap-4 text-sm">
                <div className="flex min-w-[140px] flex-1 flex-col rounded-lg border bg-muted/30 px-4 py-3">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Building2 className="h-4 w-4" /> Total Businesses
                  </span>
                  <span className="text-xl font-semibold mt-1">{(kpis?.totalBusinesses ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex min-w-[140px] flex-1 flex-col rounded-lg border bg-muted/30 px-4 py-3">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <UserPlus className="h-4 w-4" /> Total Customers
                  </span>
                  <span className="text-xl font-semibold mt-1">{(kpis?.b2bCustomerCount ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex min-w-[140px] flex-1 flex-col rounded-lg border bg-muted/30 px-4 py-3">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <FileText className="h-4 w-4" /> Total B2B Invoices
                  </span>
                  <span className="text-xl font-semibold mt-1">{(kpis?.invoiceCount ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex min-w-[140px] flex-1 flex-col rounded-lg border bg-muted/30 px-4 py-3">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <SmartphoneNfc className="h-4 w-4" /> Total Terminal
                  </span>
                  <span className="text-xl font-semibold mt-1">
                    {(kpis?.terminalSessionCount ?? 0).toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent transactions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent transactions</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/transactions">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {loading && !overview ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead>
                    <TableHead>Flow</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Balance leg</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Provider</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(overview?.recentTransactions ?? []).map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-sm font-medium max-w-[200px] truncate" title={tx.label}>
                        {tx.label}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{tx.flowLabel}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600 max-w-[160px] truncate">{tx.user}</TableCell>
                      <TableCell className="text-sm font-medium whitespace-nowrap">
                        {tx.amountFormatted}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {tx.balanceFormatted ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={txStatusVariant(tx.status)}>{tx.statusLabel}</Badge>
                      </TableCell>
                      <TableCell className="text-xs uppercase text-muted-foreground">{tx.provider}</TableCell>
                    </TableRow>
                  ))}
                  {(!overview?.recentTransactions || overview.recentTransactions.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-sm text-muted-foreground text-center py-6">
                        No transactions in this window.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Activity + currencies */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
            </CardHeader>
            <CardContent className="max-h-80 overflow-y-auto">
              {loading && !overview ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                <div className="space-y-4">
                  {(overview?.recentActivity ?? []).map((activity) => (
                    <div key={activity.id} className="flex items-start space-x-3 p-3 bg-muted/40 rounded-lg">
                      <div className="flex-shrink-0 mt-0.5">{getActivityIcon(activity.type)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-gray-900">{activity.message}</p>
                          <span className="text-xs text-gray-500 shrink-0">{activity.time}</span>
                        </div>
                        {activity.user && (
                          <div className="flex items-center justify-between mt-1">
                            <p className="text-xs text-gray-600">User: {activity.user}</p>
                            {activity.amount && (
                              <span className="text-xs font-medium text-gray-900">{activity.amount}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {(!overview?.recentActivity || overview.recentActivity.length === 0) && (
                    <p className="text-sm text-muted-foreground py-6 text-center">No activity in this window.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top currencies</CardTitle>
              <p className="text-xs text-muted-foreground font-normal mt-1">
                Pay-in currencies, USD/EUR balance on payout, and local payout totals (receive currency).
              </p>
            </CardHeader>
            <CardContent className="max-h-80 overflow-y-auto">
              {loading && !overview ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Flow</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead>Transactions</TableHead>
                      <TableHead>Sum of amounts</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(overview?.topCurrencies ?? []).map((row) => (
                      <TableRow key={`${row.flow}:${row.code}`}>
                        <TableCell>
                          <Badge
                            variant={
                              row.flow === "pay_in"
                                ? "emerald"
                                : row.flow === "payout_local"
                                  ? "secondary"
                                  : "outline"
                            }
                          >
                            {row.flowLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{row.code}</TableCell>
                        <TableCell>{row.count}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatMoneyDisplay(row.totalAmount, row.code)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!overview?.topCurrencies || overview.topCurrencies.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-sm text-muted-foreground">
                          No currency data in the current window.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </OfficeDashboardLayout>
  )
}
