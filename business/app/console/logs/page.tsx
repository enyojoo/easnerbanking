"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConsolePageHeader } from "@/components/console/console-page-header"
import { PAGE_COPY } from "@/lib/copy/business-ui-copy"
import { useConsoleLivemode } from "@/lib/console/livemode-context"
import { fetchWithSession } from "@/lib/fetch-with-session"

type LogRow = {
  id: string
  method: string
  path: string
  status: number | null
  error_code: string | null
  duration_ms: number | null
  created_at: string
}

type LogsResponse = { logs: LogRow[]; nextCursor: string | null }

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const

function buildQuery(params: {
  livemode: string
  method: string
  path: string
  status: string
  since: string
  until: string
  cursor?: string
}) {
  const search = new URLSearchParams({ livemode: params.livemode })
  if (params.method !== "all") search.set("method", params.method)
  if (params.path.trim()) search.set("path", params.path.trim())
  if (params.status !== "all") search.set("status", params.status)
  if (params.since) search.set("since", new Date(params.since).toISOString())
  if (params.until) search.set("until", new Date(params.until).toISOString())
  if (params.cursor) search.set("cursor", params.cursor)
  return search.toString()
}

export default function ConsoleLogsPage() {
  const { livemode } = useConsoleLivemode()
  const [method, setMethod] = useState("all")
  const [path, setPath] = useState("")
  const [status, setStatus] = useState("all")
  const [since, setSince] = useState("")
  const [until, setUntil] = useState("")
  const [rows, setRows] = useState<LogRow[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const filters = useMemo(
    () => ({ livemode, method, path, status, since, until }),
    [livemode, method, path, status, since, until],
  )

  useEffect(() => {
    // A filter change starts a fresh first page — drop any "Load more" state
    // from the previous filter set so it can't flash stale rows while the
    // new query is pending.
    setRows([])
    setNextCursor(null)
  }, [filters])

  const query = useQuery({
    queryKey: ["platform-logs", filters],
    queryFn: async (): Promise<LogsResponse> => {
      const res = await fetchWithSession(`/api/platform/logs?${buildQuery(filters)}`)
      const body = (await res.json().catch(() => ({}))) as LogsResponse & { error?: string }
      if (!res.ok) throw new Error(body.error || "Could not load logs")
      return { logs: body.logs ?? [], nextCursor: body.nextCursor ?? null }
    },
  })

  const data = query.data
  const displayRows = data ? data.logs : rows
  const cursor = data ? data.nextCursor : nextCursor

  const loadMore = async () => {
    if (!cursor) return
    setLoadingMore(true)
    try {
      const res = await fetchWithSession(`/api/platform/logs?${buildQuery({ ...filters, cursor })}`)
      const body = (await res.json().catch(() => ({}))) as LogsResponse & { error?: string }
      if (!res.ok) return
      setRows([...(data?.logs ?? rows), ...(body.logs ?? [])])
      setNextCursor(body.nextCursor ?? null)
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="space-y-6">
      <ConsolePageHeader title={PAGE_COPY.consoleLogs.title} description={PAGE_COPY.consoleLogs.intro} />

      <div className="flex flex-wrap items-center gap-2">
        <Select value={method} onValueChange={setMethod}>
          <SelectTrigger className="h-8 w-[110px] text-xs">
            <SelectValue placeholder="Method" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All methods</SelectItem>
            {METHODS.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="2xx">2xx success</SelectItem>
            <SelectItem value="4xx">4xx errors</SelectItem>
            <SelectItem value="5xx">5xx errors</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="Filter by path"
          className="h-8 w-[180px] text-xs"
        />
        <Input
          type="date"
          value={since}
          onChange={(e) => setSince(e.target.value)}
          className="h-8 w-[150px] text-xs"
          aria-label="Since date"
        />
        <Input
          type="date"
          value={until}
          onChange={(e) => setUntil(e.target.value)}
          className="h-8 w-[150px] text-xs"
          aria-label="Until date"
        />
      </div>

      <div className="overflow-hidden rounded-xl border">
        {query.isError ? (
          <div className="flex flex-col items-start gap-3 p-6">
            <p className="text-sm text-muted-foreground">
              {query.error instanceof Error ? query.error.message : "Could not load logs."}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </div>
        ) : displayRows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            {query.isPending ? "Loading…" : PAGE_COPY.consoleLogs.empty}
          </p>
        ) : (
          <ul className="divide-y">
            {displayRows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="font-mono text-xs">
                  {row.method} {row.path}
                </span>
                <span className="text-muted-foreground">
                  {row.status ?? "—"}
                  {row.error_code ? ` · ${row.error_code}` : ""}
                  {row.duration_ms != null ? ` · ${row.duration_ms}ms` : ""}
                  {" · "}
                  {new Date(row.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {cursor ? (
        <div className="flex justify-center">
          <Button type="button" variant="outline" size="sm" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
