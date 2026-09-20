"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ConsolePageHeader } from "@/components/console/console-page-header"
import { PAGE_COPY } from "@/lib/copy/business-ui-copy"
import { MERCHANT_WEBHOOK_EVENTS } from "@/lib/checkout/merchant-webhook-events"
import { useConsoleLivemode } from "@/lib/console/livemode-context"
import { fetchWithSession } from "@/lib/fetch-with-session"

type EventRow = { id: string; type: string; payload: Record<string, unknown>; created_at: string }
type DeliveryRow = {
  id: string
  endpoint_id: string
  status: "pending" | "delivered" | "failed"
  attempt_count: number
  last_status_code: number | null
  last_error: string | null
  delivered_at: string | null
  created_at: string
}

function statusVariant(status: DeliveryRow["status"]) {
  return status === "delivered" ? "default" : "secondary"
}

function EventDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const query = useQuery({
    queryKey: ["platform-event-detail", id],
    queryFn: async (): Promise<{ event: EventRow; deliveries: DeliveryRow[] }> => {
      const res = await fetchWithSession(`/api/platform/events/${id}`)
      const body = (await res.json().catch(() => ({}))) as { event?: EventRow; deliveries?: DeliveryRow[]; error?: string }
      if (!res.ok || !body.event) throw new Error(body.error || "Could not load event")
      return { event: body.event, deliveries: body.deliveries ?? [] }
    },
  })

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="font-mono text-sm">{query.data?.event.type ?? "Event"}</SheetTitle>
        </SheetHeader>
        <div className="space-y-6 px-4 pb-6">
          {query.isPending ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : query.isError ? (
            <p className="text-sm text-destructive">{query.error instanceof Error ? query.error.message : "Error"}</p>
          ) : (
            <>
              <div>
                <p className="mb-2 text-sm font-medium text-foreground">Payload</p>
                <pre className="max-h-64 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs">
                  {JSON.stringify(query.data?.event.payload, null, 2)}
                </pre>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-foreground">Deliveries</p>
                {query.data?.deliveries.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No endpoint was subscribed to this event when it happened.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {query.data?.deliveries.map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg border p-3 text-xs">
                        <span className="flex items-center gap-2">
                          <Badge variant={statusVariant(d.status)}>{d.status}</Badge>
                          {d.last_status_code ? `HTTP ${d.last_status_code}` : d.last_error}
                        </span>
                        <span className="text-muted-foreground">{new Date(d.created_at).toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default function ConsoleEventsPage() {
  const { livemode } = useConsoleLivemode()
  const [type, setType] = useState("all")
  const [selected, setSelected] = useState<string | null>(null)

  const query = useQuery({
    queryKey: ["platform-events", livemode, type],
    queryFn: async (): Promise<EventRow[]> => {
      const search = new URLSearchParams({ livemode })
      if (type !== "all") search.set("type", type)
      const res = await fetchWithSession(`/api/platform/events?${search.toString()}`)
      const body = (await res.json().catch(() => ({}))) as { events?: EventRow[]; error?: string }
      if (!res.ok) throw new Error(body.error || "Could not load events")
      return body.events ?? []
    },
  })

  return (
    <div className="space-y-6">
      <ConsolePageHeader title={PAGE_COPY.consoleEvents.title} description={PAGE_COPY.consoleEvents.intro} />

      <Select value={type} onValueChange={setType}>
        <SelectTrigger className="h-8 w-[220px] text-xs">
          <SelectValue placeholder="All event types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All event types</SelectItem>
          {MERCHANT_WEBHOOK_EVENTS.map((e) => (
            <SelectItem key={e} value={e}>
              {e}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="overflow-hidden rounded-xl border">
        {query.isError ? (
          <div className="flex flex-col items-start gap-3 p-6">
            <p className="text-sm text-muted-foreground">
              {query.error instanceof Error ? query.error.message : "Could not load events."}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </div>
        ) : (query.data ?? []).length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            {query.isPending ? "Loading…" : "No events yet — they'll show up here as your integration runs."}
          </p>
        ) : (
          <ul className="divide-y">
            {(query.data ?? []).map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setSelected(row.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left text-sm hover:bg-muted/50"
                >
                  <code className="text-xs">{row.type}</code>
                  <span className="text-muted-foreground">{new Date(row.created_at).toLocaleString()}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected ? <EventDetail id={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  )
}
