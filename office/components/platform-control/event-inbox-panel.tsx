"use client"

import { useState } from "react"
import { useOfficeEventInbox, useQueryInitialLoading } from "@/hooks/queries"
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
  const [providerFilter, setProviderFilter] = useState<(typeof PROVIDERS)[number]>("all")
  const [statusFilter, setStatusFilter] = useState<(typeof STATUSES)[number]>("all")

  const query = useOfficeEventInbox(providerFilter, statusFilter)

  const loading = useQueryInitialLoading(query.isPending, query.data)
  const counts = query.data?.counts
  const events = query.data?.events ?? []

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">Webhook inbox</h2>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
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

        <div className="flex flex-wrap gap-2">
          <Select value={providerFilter} onValueChange={(v) => setProviderFilter(v as (typeof PROVIDERS)[number])}>
            <SelectTrigger className="w-[160px]">
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
            <SelectTrigger className="w-[160px]">
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
        <CardHeader>
          <CardTitle>Recent events</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>{event.provider}</TableCell>
                    <TableCell className="font-mono text-xs">{event.event_type ?? event.event_id}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(event.status)}>{event.status}</Badge>
                    </TableCell>
                    <TableCell>{formatTs(event.received_at)}</TableCell>
                    <TableCell className="max-w-[240px] truncate text-xs text-muted-foreground">
                      {event.error ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {events.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-sm text-muted-foreground">
                      No events match these filters.
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
