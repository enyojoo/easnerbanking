"use client"

import { OfficeDashboardLayout } from "@/components/layout/office-dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { officeFetch } from "@/lib/api-client"
import { useQuery } from "@tanstack/react-query"
import { officeKeys } from "@/lib/query/keys"

type Row = {
  id: string
  business_id: string
  email: string | null
  name: string | null
  phone: string | null
  created_at: string
}

export default function CustomersPage() {
  const { data: rows = [], error, isPending } = useQuery({
    queryKey: officeKeys.businessCustomers(),
    queryFn: async () => {
      const r = await officeFetch("/api/admin/business/customers")
      const d = (await r.json()) as { customers?: Row[]; error?: string }
      if (d.error) throw new Error(d.error)
      return d.customers ?? []
    },
    staleTime: 60_000,
  })

  const message = error instanceof Error ? error.message : error ? String(error) : null
  const loading = isPending && rows.length === 0

  return (
    <OfficeDashboardLayout>
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold">B2B customers</h1>
        {message && <p className="text-sm text-destructive">{message}</p>}
        <Card>
          <CardHeader>
            <CardTitle>Customers</CardTitle>
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
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Business</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-sm text-muted-foreground">
                        No customers yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>{c.name ?? "—"}</TableCell>
                        <TableCell>{c.email ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{c.business_id}</TableCell>
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
