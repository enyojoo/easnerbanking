"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useOfficeCustomers, useQueryInitialLoading } from "@/hooks/queries"
import { OfficeBackgroundRefresh, OfficeQueryError } from "@/components/data/office-data-status"

type Row = {
  id: string
  business_id: string
  email: string | null
  name: string | null
  phone: string | null
  created_at: string
}

export default function CustomersPage() {
  const customersQuery = useOfficeCustomers()
  const rows = (customersQuery.data ?? []) as Row[]

  const message =
    customersQuery.error instanceof Error
      ? customersQuery.error.message
      : customersQuery.error
        ? String(customersQuery.error)
        : null
  const loading = useQueryInitialLoading(customersQuery.isPending, customersQuery.data, rows)

  return (
    <>
      <div className="p-6 space-y-4">
        <div className="flex min-h-8 items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">B2B customers</h1>
          <OfficeBackgroundRefresh isFetching={customersQuery.isFetching && !loading} />
        </div>
        <OfficeQueryError
          message={message}
          hasData={rows.length > 0}
          onRetry={() => void customersQuery.refetch()}
        />
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
                        <TableCell>{c.name ?? "–"}</TableCell>
                        <TableCell>{c.email ?? "–"}</TableCell>
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
    </>
  )
}
