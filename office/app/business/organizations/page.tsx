"use client"

import { useEffect, useState } from "react"
import { OfficeDashboardLayout } from "@/components/layout/office-dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { officeFetch } from "@/lib/api-client"

type Org = {
  id: string
  name: string
  slug: string | null
  logo_url: string | null
  business_type: string | null
  base_currency: string | null
  description: string | null
  created_at: string
}

export default function BusinessOrganizationsPage() {
  const [rows, setRows] = useState<Org[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    officeFetch("/api/admin/business/organizations")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error)
        else setRows(d.organizations ?? [])
      })
      .catch(() => setError("Failed to load"))
  }, [])

  return (
    <OfficeDashboardLayout>
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold">Organizations</h1>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Card>
          <CardHeader>
            <CardTitle>All organizations</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Logo</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Business type</TableHead>
                  <TableHead>Base currency</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">{o.name}</TableCell>
                    <TableCell>
                      {o.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={o.logo_url} alt={`${o.name} logo`} className="h-8 w-8 rounded object-cover border" />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>{o.slug ?? "—"}</TableCell>
                    <TableCell>{o.business_type ?? "—"}</TableCell>
                    <TableCell>{o.base_currency ?? "USD"}</TableCell>
                    <TableCell className="max-w-[360px] truncate" title={o.description ?? ""}>
                      {o.description ?? "—"}
                    </TableCell>
                    <TableCell>{new Date(o.created_at).toLocaleString()}</TableCell>
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
