"use client"

import { useEffect, useState } from "react"
import { OfficeDashboardLayout } from "@/components/layout/office-dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { officeFetch } from "@/lib/api-client"

type Row = {
  id: string
  organization_id: string
  amount_cents: number
  currency: string
  status: string
  due_date: string | null
  created_at: string
}

export default function BusinessInvoicesPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    officeFetch("/api/admin/business/invoices")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error)
        else setRows(d.invoices ?? [])
      })
      .catch(() => setError("Failed to load"))
  }, [])

  return (
    <OfficeDashboardLayout>
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold">Invoices</h1>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Card>
          <CardHeader>
            <CardTitle>All invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Org</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>
                      {(inv.amount_cents / 100).toFixed(2)} {inv.currency}
                    </TableCell>
                    <TableCell>{inv.status}</TableCell>
                    <TableCell>{inv.due_date ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{inv.organization_id}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </OfficeDashboardLayout>
  )
}
