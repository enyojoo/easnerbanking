"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { officeFetch } from "@/lib/api-client"
import { officeKeys } from "@/lib/query/keys"
import { useOfficeAdminEnabled } from "@/hooks/queries"
import type { OfficeEventInboxResponse } from "@/lib/types/office-overview"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"

const PROVIDERS = ["all", "noah", "turnkey", "yellowcard", "other"] as const
const STATUSES = ["all", "received", "processed", "failed"] as const

function statusVariant(status: string): "emerald" | "amber" | "oxblood" | "slate" {
  if (status === "processed") return "emerald"
  if (status === "failed") return "oxblood"
  return "amber"
}

function formatTs(iso: string | null | undefined) {
  if (!iso) return "—"
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return "—"
  return d.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function EventInboxPanel() {
  const { enabled } = useOfficeAdminEnabled()
  const [providerFilter, setProviderFilter] = useState<(typeof PROVIDERS)[number]>("all")
  const [statusFilter, setStatusFilter] = useState<(typeof STATUSES)[number]>("all")

  const query = useQuery({
    queryKey: officeKeys.eventInbox(providerFilter, statusFilter),
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<OfficeEventInboxResponse> => {
      const params = new URLSearchParams({ limit: "200" })
      if (providerFilter !== "all") params.set("provider", providerFilter)
      if (statusFilter !== "all") params.set("status", statusFilter)
      const r = await officeFetch(`/api/admin/office/event-inbox?${params.toString()}`)
      const body = (await r.json()) as OfficeEventInboxResponse & { error?: string }
      if (!r.ok || body.error) {
        throw new Error(typeof body.error === "string" ? body.error : r.statusText || "Failed to load webhook inbox")
      }
      return body
    },
  })

  const loading = query.isPending && !query.data
  const counts = query.data?.counts
  const events = query.data?.events ?? []

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">Webhook inbox</h2>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <span className="text-muted-foreground">Received</span>
            <span className="font-semibold">{(counts?.received ?? 0).toLocaleString()}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="text-muted-foreground">Processed</span>
            <span className="font-semibold">{(counts?.processed ?? 0).toLocaleString()}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="text-muted-foreground">Failed</span>
            <span className="font-semibold text-destructive">{(counts?.failed ?? 0).toLocaleString()}</span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Select value={providerFilter} onValueChange={(v) => setProviderFilter(v as (typeof PROVIDERS)[number])}>
            <SelectTrigger className="w-[180px] bg-white">
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              {PROVIDERS.map((p) => (
                <SelectItem key={p} value={p}>
                  {p === "all" ? "All providers" : p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as (typeof STATUSES)[number])}>
            <SelectTrigger className="w-[180px] bg-white">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s === "all" ? "All statuses" : s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent events</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <Skeleton className="h-48 w-full" />
          ) : query.error ? (
            <p className="text-sm text-destructive">
              {query.error instanceof Error ? query.error.message : String(query.error)}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Received</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Event type</TableHead>
                  <TableHead>Event ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-sm whitespace-nowrap">{formatTs(row.received_at)}</TableCell>
                    <TableCell className="font-medium uppercase text-sm">{row.provider}</TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">{row.event_type || "—"}</TableCell>
                    <TableCell className="font-mono text-xs max-w-[220px] truncate">{row.event_id}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-destructive max-w-[240px] truncate" title={row.error || undefined}>
                      {row.error || "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {events.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                      No webhook events match these filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
