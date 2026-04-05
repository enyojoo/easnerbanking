"use client"

import { useEffect, useState } from "react"
import { OfficeDashboardLayout } from "@/components/layout/office-dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { officeFetch } from "@/lib/api-client"

type Row = {
  id: string
  business_id: string
  email: string | null
  name: string | null
  phone: string | null
  created_at: string
}

export default function CustomersPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    officeFetch("/api/admin/business/customers")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error)
        else setRows(d.customers ?? [])
      })
      .catch(() => setError("Failed to load"))
  }, [])

  return (
    <OfficeDashboardLayout>
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold">B2B customers</h1>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Card>
          <CardHeader>
            <CardTitle>Customers</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Business</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.name ?? "—"}</TableCell>
                    <TableCell>{c.email ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{c.business_id}</TableCell>
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
