"use client"

import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { ConsolePageHeader } from "@/components/console/console-page-header"
import { PAGE_COPY } from "@/lib/copy/business-ui-copy"
import { useConsoleLivemode } from "@/lib/console/livemode-context"
import { fetchWithSession } from "@/lib/fetch-with-session"

type UsageResponse = {
  limits: { businessWritePerMinute: number; businessReadPerMinute: number }
  currentWindow: { writeRequestsThisMinute: number }
  daily: { day: string; total: number; errors: number }[]
}

function UsageBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>
          {value} / {max}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function DailyChart({ daily }: { daily: UsageResponse["daily"] }) {
  const max = Math.max(1, ...daily.map((d) => d.total))
  return (
    <div className="flex h-32 items-end gap-1">
      {daily.map((d) => (
        <div key={d.day} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${d.day}: ${d.total} calls, ${d.errors} errors`}>
          <div className="flex w-full flex-col justify-end" style={{ height: "100%" }}>
            <div
              className="w-full rounded-t bg-destructive/70"
              style={{ height: `${(d.errors / max) * 100}%` }}
            />
            <div
              className="w-full rounded-t bg-primary"
              style={{ height: `${((d.total - d.errors) / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function ConsoleUsagePage() {
  const { livemode } = useConsoleLivemode()
  const query = useQuery({
    queryKey: ["platform-usage", livemode],
    queryFn: async (): Promise<UsageResponse> => {
      const res = await fetchWithSession(`/api/platform/usage?livemode=${livemode}`)
      const body = (await res.json().catch(() => ({}))) as UsageResponse & { error?: string }
      if (!res.ok) throw new Error((body as { error?: string }).error || "Could not load usage")
      return body
    },
  })

  const data = query.data
  const totalCalls = data?.daily.reduce((sum, d) => sum + d.total, 0) ?? 0
  const totalErrors = data?.daily.reduce((sum, d) => sum + d.errors, 0) ?? 0
  const errorRate = totalCalls > 0 ? ((totalErrors / totalCalls) * 100).toFixed(1) : "0.0"

  return (
    <div className="space-y-6">
      <ConsolePageHeader title={PAGE_COPY.consoleUsage.title} description={PAGE_COPY.consoleUsage.intro} />

      {query.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : query.isError ? (
        <p className="text-sm text-destructive">{query.error instanceof Error ? query.error.message : "Error"}</p>
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Calls (14d)</p>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">{totalCalls.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Error rate (14d)</p>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">{errorRate}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Write requests now</p>
              </CardHeader>
              <CardContent>
                <UsageBar
                  label="This minute"
                  value={data.currentWindow.writeRequestsThisMinute}
                  max={data.limits.businessWritePerMinute}
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <p className="text-sm font-medium text-foreground">Calls per day</p>
              <p className="text-xs text-muted-foreground">Solid = successful, red = 4xx/5xx</p>
            </CardHeader>
            <CardContent>
              {data.daily.length === 0 ? (
                <p className="text-sm text-muted-foreground">No calls in this window yet.</p>
              ) : (
                <DailyChart daily={data.daily} />
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            Rate limits: {data.limits.businessWritePerMinute} writes/min · {data.limits.businessReadPerMinute} reads/min,
            per business.
          </p>
        </>
      ) : null}
    </div>
  )
}
