"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { OfficeDashboardLayout } from "@/components/layout/office-dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { officeFetch } from "@/lib/api-client"
import { Building2, UsersRound, Receipt } from "lucide-react"

export default function BusinessOverviewPage() {
  const [summary, setSummary] = useState<{
    organizationCount?: number
    b2bCustomerCount?: number
    invoiceCount?: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    officeFetch("/api/admin/business/summary")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.hint || d.error)
        else setSummary(d)
      })
      .catch(() => setError("Could not load summary"))
  }, [])

  return (
    <OfficeDashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Business (B2B)</h1>
          <p className="text-gray-600">Organizations, customers, and invoices stored in Supabase.</p>
        </div>

        {error && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center gap-2 pb-2">
              <Building2 className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Organizations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary?.organizationCount ?? "—"}</div>
              <CardDescription>Merchant / org accounts</CardDescription>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center gap-2 pb-2">
              <UsersRound className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">B2B customers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary?.b2bCustomerCount ?? "—"}</div>
              <CardDescription>Per-organization customers</CardDescription>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center gap-2 pb-2">
              <Receipt className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Invoices</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary?.invoiceCount ?? "—"}</div>
              <CardDescription>All invoice records</CardDescription>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/business/organizations">Organizations</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/business/customers">Customers</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/business/invoices">Invoices</Link>
          </Button>
        </div>
      </div>
    </OfficeDashboardLayout>
  )
}
