"use client"

import { OfficeDashboardLayout } from "@/components/layout/office-dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useOfficeInvoices, useQueryInitialLoading } from "@/hooks/queries"
import { OfficeBackgroundRefresh, OfficeQueryError } from "@/components/data/office-data-status"

type Row = {
  id: string
  business_id: string
  amount_cents: number
  currency: string
  status: string
  due_date: string | null
  created_at: string
}

export default function InvoicesPage() {
  const invoicesQuery = useOfficeInvoices()
  const rows = (invoicesQuery.data ?? []) as Row[]

  const message =
    invoicesQuery.error instanceof Error
      ? invoicesQuery.error.message
      : invoicesQuery.error
        ? String(invoicesQuery.error)
        : null
  const loading = useQueryInitialLoading(invoicesQuery.isPending, invoicesQuery.data, rows)

  return (
    <OfficeDashboardLayout>
      <div className="p-6 space-y-4">
        <div className="flex min-h-8 items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">Invoices</h1>
          <OfficeBackgroundRefresh isFetching={invoicesQuery.isFetching && !loading} />
        </div>
        <OfficeQueryError
          message={message}
          hasData={rows.length > 0}
          onRetry={() => void invoicesQuery.refetch()}
        />
        <Card>
          <CardHeader>
            <CardTitle>All invoices</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Business</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-sm text-muted-foreground">
                        No invoices yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell>
                          {(inv.amount_cents / 100).toFixed(2)} {inv.currency}
                        </TableCell>
                        <TableCell>{inv.status}</TableCell>
                        <TableCell>{inv.due_date ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{inv.business_id}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </OfficeDashboardLayout>
  )
}
