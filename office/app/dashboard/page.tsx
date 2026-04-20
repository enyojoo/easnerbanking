"use client"

import { useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import { OfficeDashboardLayout } from "@/components/layout/office-dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { officeFetch } from "@/lib/api-client"
import type { OfficeOverviewResponse } from "@/lib/types/office-overview"
import { useAuth } from "@/lib/auth-context"
import { officeKeys } from "@/lib/query/keys"

const OFFICE_OVERVIEW_TTL_MS = 5 * 60 * 1000
const OVERVIEW_PRESET = "7d" as const

export default function AdminDashboardPage() {
  const { user, isAdmin } = useAuth()
  const enabled = Boolean(user && isAdmin)

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

  const loading = isPending
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
        return <CheckCircle className="h-4 w-4 text-primary" />
      case "transaction_failed":
        return <XCircle className="h-4 w-4 text-destructive" />
      case "transaction_cancelled":
        return <XCircle className="h-4 w-4 text-muted-foreground" />
      case "transaction_processing":
        return <AlertCircle className="h-4 w-4 text-foreground" />
      case "transaction_pending":
        return <Clock className="h-4 w-4 text-[hsl(var(--warning))]" />
      case "user_registered":
        return <Users className="h-4 w-4 text-foreground" />
      default:
        return <Activity className="h-4 w-4 text-muted-foreground" />
    }
  }

  const fmtUsd = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const kpis = overview?.kpis

  return (
    <OfficeDashboardLayout>
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

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
                  <CardTitle className="text-sm font-medium text-gray-600">Transactions</CardTitle>
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
                  <CardTitle className="text-sm font-medium text-gray-600">USD volume</CardTitle>
                  <TrendingUp className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-gray-900">{fmtUsd(kpis?.transactionVolumeUsd ?? 0)}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Users</CardTitle>
                  <Users className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-gray-900">{(kpis?.totalUsers ?? 0).toLocaleString()}</div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Compact B2B + orgs */}
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
                    <Building2 className="h-4 w-4" /> Businesses
                  </span>
                  <span className="text-xl font-semibold mt-1">{(kpis?.totalBusinesses ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex min-w-[140px] flex-1 flex-col rounded-lg border bg-muted/30 px-4 py-3">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <UserPlus className="h-4 w-4" /> B2B customers
                  </span>
                  <span className="text-xl font-semibold mt-1">{(kpis?.b2bCustomerCount ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex min-w-[140px] flex-1 flex-col rounded-lg border bg-muted/30 px-4 py-3">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <FileText className="h-4 w-4" /> Invoices
                  </span>
                  <span className="text-xl font-semibold mt-1">{(kpis?.invoiceCount ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex min-w-[140px] flex-1 flex-col rounded-lg border bg-muted/30 px-4 py-3">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <SmartphoneNfc className="h-4 w-4" /> Terminal
                  </span>
                  <span className="text-xl font-semibold mt-1">
                    {(kpis?.terminalSessionCount ?? 0).toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Two deep-dive widgets */}
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
            </CardHeader>
            <CardContent className="max-h-80 overflow-y-auto">
              {loading && !overview ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Currency</TableHead>
                      <TableHead>Transactions</TableHead>
                      <TableHead>Sum of amounts</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(overview?.topCurrencies ?? []).map((row) => (
                      <TableRow key={row.code}>
                        <TableCell className="font-medium">{row.code}</TableCell>
                        <TableCell>{row.count}</TableCell>
                        <TableCell>
                          {row.totalAmount.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!overview?.topCurrencies || overview.topCurrencies.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-sm text-muted-foreground">
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
