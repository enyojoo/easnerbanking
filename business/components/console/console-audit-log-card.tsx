"use client"

import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { fetchWithSession } from "@/lib/fetch-with-session"

type AuditEntry = {
  id: string
  action: string
  target_type: string
  target_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

const ACTION_LABELS: Record<string, string> = {
  "key.created": "API key created",
  "key.revoked": "API key revoked",
  "webhook_endpoint.created": "Webhook endpoint added",
  "webhook_endpoint.updated": "Webhook endpoint updated",
  "webhook_endpoint.disabled": "Webhook endpoint disabled",
}

export function ConsoleAuditLogCard() {
  const query = useQuery({
    queryKey: ["platform-audit-log"],
    queryFn: async (): Promise<AuditEntry[]> => {
      const res = await fetchWithSession("/api/platform/audit-log")
      const body = (await res.json().catch(() => ({}))) as { entries?: AuditEntry[] }
      if (!res.ok) return []
      return body.entries ?? []
    },
  })

  const entries = query.data ?? []
  if (!query.isPending && entries.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="text-sm font-medium text-foreground">Recent changes</p>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : (
          <ul className="space-y-2">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-2 text-xs">
                <span>{ACTION_LABELS[entry.action] ?? entry.action}</span>
                <span className="text-muted-foreground">{new Date(entry.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
