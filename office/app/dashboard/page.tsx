"use client"

import { useEffect, useState } from "react"
import { OfficeDashboardLayout } from "@/components/layout/office-dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Users,
  CreditCard,
  TrendingUp,
  AlertCircle,
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  Smartphone,
  Building2,
  Server,
} from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useOfficeData } from "@/hooks/use-office-data"
import { officeFetch } from "@/lib/api-client"

export default function AdminDashboardPage() {
  const { data } = useOfficeData()
  const [b2bSummary, setB2bSummary] = useState<{
    organizationCount: number
    b2bCustomerCount: number
    invoiceCount: number
  } | null>(null)

  useEffect(() => {
    officeFetch("/api/admin/business/summary")
      .then((r) => r.json())
      .then((d) => {
        if (!d.error && typeof d.organizationCount === "number") {
          setB2bSummary({
            organizationCount: d.organizationCount,
            b2bCustomerCount: d.b2bCustomerCount,
            invoiceCount: d.invoiceCount,
          })
        }
      })
      .catch(() => {})
  }, [])

  const getActivityIcon = (type: string) => {
    // Handle card funding types
    if (type.includes("card_funding")) {
      if (type.includes("completed")) {
        return <CheckCircle className="h-4 w-4 text-green-600" />
      } else if (type.includes("failed")) {
        return <XCircle className="h-4 w-4 text-red-600" />
      } else if (type.includes("cancelled")) {
        return <XCircle className="h-4 w-4 text-gray-600" />
      } else if (type.includes("processing")) {
        return <AlertCircle className="h-4 w-4 text-blue-600" />
      } else {
        return <Clock className="h-4 w-4 text-yellow-600" />
      }
    }
    
    switch (type) {
      case "transaction_completed":
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case "transaction_failed":
        return <XCircle className="h-4 w-4 text-red-600" />
      case "transaction_cancelled":
        return <XCircle className="h-4 w-4 text-gray-600" />
      case "transaction_processing":
        return <AlertCircle className="h-4 w-4 text-blue-600" />
      case "transaction_pending":
        return <Clock className="h-4 w-4 text-yellow-600" />
      case "user_registered":
        return <Users className="h-4 w-4 text-blue-600" />
      default:
        return <Activity className="h-4 w-4 text-gray-600" />
    }
  }

  const formatCurrency = (amount: number, currency?: string) => {
    const baseCurrency = data?.baseCurrency || currency || "NGN"
    const symbols: { [key: string]: string } = {
      NGN: "₦",
      RUB: "₽",
      USD: "$",
      EUR: "€",
      GBP: "£",
    }
    return `${symbols[baseCurrency] || ""}${amount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }

  return (
    <OfficeDashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard Overview</h1>
            <p className="text-gray-600">Mobile consumer, Business (B2B), and Platform metrics</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Smartphone className="h-4 w-4" />
          Mobile (consumer)
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Transactions</CardTitle>
              <CreditCard className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {data?.stats.totalTransactions.toLocaleString() || 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Volume</CardTitle>
              <TrendingUp className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {formatCurrency(data?.stats.totalVolume || 0, data?.baseCurrency)}
              </div>
              <p className="text-xs text-gray-500 mt-1">From all currencies.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Users</CardTitle>
              <Users className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{data?.stats.totalUsers || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Transactions Pending</CardTitle>
              <AlertCircle className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{data?.stats.pendingTransactions || 0}</div>
              <p className="text-xs text-orange-600">Awaiting processing</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 pt-2">
          <Building2 className="h-4 w-4" />
          Business (B2B)
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Organizations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {b2bSummary ? b2bSummary.organizationCount : "—"}
              </div>
              <p className="text-xs text-gray-500 mt-1">Organizations in Supabase</p>
              <Button variant="outline" size="sm" className="mt-3" asChild>
                <Link href="/business">Open Business</Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">B2B customers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {b2bSummary ? b2bSummary.b2bCustomerCount : "—"}
              </div>
              <p className="text-xs text-gray-500 mt-1">Per-merchant customers</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Invoices</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {b2bSummary ? b2bSummary.invoiceCount : "—"}
              </div>
              <p className="text-xs text-gray-500 mt-1">All invoice rows</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Server className="h-4 w-4" />
            Platform
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" asChild>
              <Link href="/rates">Rates</Link>
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <Link href="/settings">Settings</Link>
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <Link href="/platform/health">Integrations & health</Link>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Activity Feed */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <div>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Latest platform activities and events</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="max-h-80 overflow-y-auto">
              <div className="space-y-4">
                {data?.recentActivity?.map((activity: any) => (
                  <div key={activity.id} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                    <div className="flex-shrink-0 mt-0.5">{getActivityIcon(activity.type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900">{activity.message}</p>
                        <span className="text-xs text-gray-500">{activity.time}</span>
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
                )) || []}
              </div>
            </CardContent>
          </Card>

          {/* Currency Pair Popularity */}
          <Card>
            <CardHeader>
              <CardTitle>Currency Pair Popularity</CardTitle>
              <CardDescription>Most popular trading pairs</CardDescription>
            </CardHeader>
            <CardContent className="max-h-80 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Currency Pair</TableHead>
                    <TableHead>Volume %</TableHead>
                    <TableHead>Transactions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.currencyPairs?.map((item: any, index: number) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{item.pair}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-gray-200 rounded-full h-2">
                            <div className="bg-primary h-2 rounded-full" style={{ width: `${item.volume}%` }} />
                          </div>
                          <span className="text-sm">{item.volume.toFixed(1)}%</span>
                        </div>
                      </TableCell>
                      <TableCell>{item.transactions}</TableCell>
                    </TableRow>
                  )) || []}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </OfficeDashboardLayout>
  )
}
