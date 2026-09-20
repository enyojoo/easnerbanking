"use client"

import { useQuery } from "@tanstack/react-query"
import { useSearchParams } from "next/navigation"
import { PageIntro } from "@/components/copy/page-intro"
import { ConsoleModeSwitch } from "@/components/console/console-mode-switch"
import { parseConsoleLivemode } from "@/lib/console/livemode"
import { fetchWithSession } from "@/lib/fetch-with-session"

type LogRow = {
  id: string
  method: string
  path: string
  status: number | null
  error_code: string | null
  created_at: string
}

export default function ConsoleLogsPage() {
  const livemode = parseConsoleLivemode(useSearchParams().get("livemode"))
  const query = useQuery({
    queryKey: ["platform-logs", livemode],
    queryFn: async () => {
      const res = await fetchWithSession(`/api/platform/logs?livemode=${livemode}`)
      const body = (await res.json().catch(() => ({}))) as { logs?: LogRow[]; error?: string }
      if (!res.ok) throw new Error(body.error || "Could not load logs")
      return body.logs ?? []
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PageIntro title="Logs" description="Recent platform API requests for this business." variant="page" />
        <ConsoleModeSwitch />
      </div>
      <div className="overflow-hidden rounded-xl border">
        {(query.data ?? []).length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No API calls yet.</p>
        ) : (
          <ul className="divide-y">
            {(query.data ?? []).map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="font-mono text-xs">
                  {row.method} {row.path}
                </span>
                <span className="text-muted-foreground">
                  {row.status ?? "—"}
                  {row.error_code ? ` · ${row.error_code}` : ""}
                  {" · "}
                  {new Date(row.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
