"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { OfficeDashboardLayout } from "@/components/layout/office-dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { officeFetch } from "@/lib/api-client"

type BusinessRow = {
  id: string
  name: string
  easetag?: string | null
  slug?: string | null
  logo_url: string | null
  business_type: string | null
  base_currency: string | null
  description: string | null
  created_at: string
  owner_user_id?: string | null
  owner_email?: string | null
  owner_name?: string | null
}

function BusinessesPageInner() {
  const searchParams = useSearchParams()
  const highlightBusinessId = searchParams.get("highlight")

  const [rows, setRows] = useState<BusinessRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    officeFetch("/api/admin/business/businesses")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        if (d.error) setError(d.error)
        else setRows(d.businesses ?? [])
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const displayRows = useMemo(() => {
    if (!highlightBusinessId) return rows
    const h = rows.find((o) => o.id === highlightBusinessId)
    if (!h) return rows
    return [h, ...rows.filter((o) => o.id !== highlightBusinessId)]
  }, [rows, highlightBusinessId])

  const ownerLabel = (o: BusinessRow) => {
    if (o.owner_name?.trim()) return o.owner_name.trim()
    if (o.owner_email?.trim()) return o.owner_email.trim()
    return o.owner_user_id ? o.owner_user_id.slice(0, 8) + "…" : "—"
  }

  return (
    <OfficeDashboardLayout>
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold">Businesses</h1>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Card>
          <CardHeader>
            <CardTitle>All businesses</CardTitle>
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
                    <TableHead>Owner</TableHead>
                    <TableHead>Logo</TableHead>
                    <TableHead>Easetag</TableHead>
                    <TableHead>Business type</TableHead>
                    <TableHead>Base currency</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                        No businesses yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    displayRows.map((o) => (
                      <TableRow
                        key={o.id}
                        className={highlightBusinessId === o.id ? "bg-muted/50" : undefined}
                        data-business-id={o.id}
                      >
                        <TableCell className="font-medium">{o.name}</TableCell>
                        <TableCell>
                          {o.owner_user_id ? (
                            <Link
                              href={`/users?highlight=${encodeURIComponent(o.owner_user_id)}`}
                              className="text-primary underline-offset-2 hover:underline text-sm"
                            >
                              {ownerLabel(o)}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {o.logo_url ? (
                            <img src={o.logo_url} alt="" className="h-8 w-8 rounded object-cover border" />
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const t = o.easetag ?? o.slug
                            return t ? `@${t}` : "—"
                          })()}
                        </TableCell>
                        <TableCell>{o.business_type ?? "—"}</TableCell>
                        <TableCell>{o.base_currency ?? "USD"}</TableCell>
                        <TableCell className="max-w-[360px] truncate" title={o.description ?? ""}>
                          {o.description ?? "—"}
                        </TableCell>
                        <TableCell>{new Date(o.created_at).toLocaleString()}</TableCell>
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

export default function BusinessesPage() {
  return (
    <Suspense
      fallback={
        <OfficeDashboardLayout>
          <div className="p-6 space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-64 w-full" />
          </div>
        </OfficeDashboardLayout>
      }
    >
      <BusinessesPageInner />
    </Suspense>
  )
}
