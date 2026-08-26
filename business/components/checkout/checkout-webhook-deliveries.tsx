"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { toast } from "sonner"

type Delivery = {
  id: string
  event: string
  status: "pending" | "delivered" | "failed"
  attemptCount: number
  lastStatusCode: number | null
  lastError: string | null
  createdAt: string
  deliveredAt: string | null
}

function statusLabel(status: Delivery["status"]) {
  if (status === "delivered") return "Delivered"
  if (status === "failed") return "Failed"
  return "Retrying"
}

export function CheckoutWebhookDeliveries({ live }: { live?: boolean }) {
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [loading, setLoading] = useState(true)
  const [redelivering, setRedelivering] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetchWithSession("/api/checkout/webhook-deliveries")
    const body = (await res.json().catch(() => ({}))) as { deliveries?: Delivery[]; error?: string }
    if (!res.ok) {
      if (!live) toast.error(body.error || "Could not load deliveries")
      setLoading(false)
      return
    }
    setDeliveries(body.deliveries ?? [])
    setLoading(false)
  }, [live])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!live) return
    const timer = window.setInterval(() => void load(), 4000)
    return () => window.clearInterval(timer)
  }, [live, load])

  const redeliver = async (id: string) => {
    setRedelivering(id)
    try {
      const res = await fetchWithSession(
        `/api/checkout/webhook-deliveries/${encodeURIComponent(id)}/redeliver`,
        { method: "POST" },
      )
      const body = (await res.json().catch(() => ({}))) as { error?: string; status?: number }
      if (!res.ok) {
        toast.error(body.error || "Redelivery failed")
        return
      }
      toast.success(`Your endpoint replied ${body.status ?? 200}.`)
      await load()
    } finally {
      setRedelivering(null)
    }
  }

  return (
    <div className="space-y-3 rounded-xl border p-4 sm:p-5">
      <div>
        <p className="text-sm font-medium text-foreground">Recent deliveries</p>
        <p className="text-xs text-muted-foreground">
          Failed events retry automatically. Use Redeliver after you fix your endpoint.
        </p>
      </div>
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : deliveries.length === 0 ? (
        <p className="text-xs text-muted-foreground">No events yet.</p>
      ) : (
        <ul className="space-y-3">
          {deliveries.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-start justify-between gap-3 border-t pt-3 first:border-t-0 first:pt-0"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{row.event}</code>
                  <Badge variant={row.status === "delivered" ? "default" : "secondary"}>
                    {statusLabel(row.status)}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(row.createdAt).toLocaleString()}
                  {row.lastStatusCode ? ` · HTTP ${row.lastStatusCode}` : ""}
                  {row.attemptCount > 1 ? ` · ${row.attemptCount} attempts` : ""}
                </p>
                {row.lastError && row.status !== "delivered" ? (
                  <p className="text-xs text-destructive">{row.lastError}</p>
                ) : null}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={redelivering === row.id}
                onClick={() => void redeliver(row.id)}
              >
                {redelivering === row.id ? "Sending…" : "Redeliver"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
