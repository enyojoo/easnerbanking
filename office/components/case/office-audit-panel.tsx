"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { formatOfficeTimestamp } from "@/lib/format-office-date"
import type { OfficeAuditEntry } from "@/lib/case/types"

export function OfficeAuditPanel({
  entries,
  loading,
  error,
}: {
  entries: OfficeAuditEntry[]
  loading: boolean
  error?: string | null
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    )
  }
  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No office actions recorded for this subject.</p>
  }
  return (
    <div className="space-y-0">
      {entries.map((entry) => (
        <div key={entry.id} className="border-b border-border/60 py-2.5 text-sm last:border-b-0 last:pb-0 first:pt-0">
          <div className="flex justify-between gap-3">
            <span className="font-medium">{entry.action}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatOfficeTimestamp(entry.created_at)}
            </span>
          </div>
          {entry.resource ? (
            <p className="mt-1 font-mono text-xs text-muted-foreground">{entry.resource}</p>
          ) : null}
        </div>
      ))}
    </div>
  )
}
