"use client"

import { useEffect, useState } from "react"
import { OfficeDashboardLayout } from "@/components/layout/office-dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { officeFetch } from "@/lib/api-client"

type Entry = {
  id: string
  admin_user_id: string
  action: string
  resource: string
  metadata: unknown
  created_at: string
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    officeFetch("/api/admin/audit-log?limit=200")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error)
        else setEntries(d.entries ?? [])
      })
      .catch(() => setError("Failed to load audit log (table may not exist yet)"))
  }, [])

  return (
    <OfficeDashboardLayout>
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Immutable staff actions (when <code className="text-xs">admin_audit_log</code> is applied in Supabase).
        </p>
        {error && <p className="text-sm text-amber-800">{error}</p>}
        <Card>
          <CardHeader>
            <CardTitle>Recent entries</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Admin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {new Date(e.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>{e.action}</TableCell>
                    <TableCell className="font-mono text-xs">{e.resource}</TableCell>
                    <TableCell className="font-mono text-xs">{e.admin_user_id}</TableCell>
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
