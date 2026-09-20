"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { CheckoutWebhookDeliveries } from "@/components/checkout/checkout-webhook-deliveries"
import { RevealOnceValue } from "@/components/checkout/checkout-code-block"
import { fetchWithSession } from "@/lib/fetch-with-session"
import {
  MERCHANT_WEBHOOK_EVENT_DESCRIPTIONS,
  MERCHANT_WEBHOOK_EVENTS,
  type MerchantWebhookEvent,
} from "@/lib/checkout/merchant-webhook-events"
import { useConsoleLivemode } from "@/lib/console/livemode-context"

type WebhookEndpoint = {
  id: string
  url: string
  description: string | null
  livemode: boolean
  events: MerchantWebhookEvent[]
  webhook_secret_last4: string | null
  disabled_at: string | null
  created_at: string
}

const ENDPOINTS_QUERY_KEY = ["platform-webhook-endpoints"]

function useEndpoints() {
  return useQuery({
    queryKey: ENDPOINTS_QUERY_KEY,
    queryFn: async (): Promise<WebhookEndpoint[]> => {
      const res = await fetchWithSession("/api/checkout/webhook-endpoints")
      const body = (await res.json().catch(() => ({}))) as { endpoints?: WebhookEndpoint[]; error?: string }
      if (!res.ok) throw new Error(body.error || "Could not load endpoints")
      return body.endpoints ?? []
    },
  })
}

function EventCheckboxes({
  selected,
  onToggle,
}: {
  selected: Set<MerchantWebhookEvent>
  onToggle: (event: MerchantWebhookEvent) => void
}) {
  return (
    <ul className="max-h-56 space-y-2 overflow-y-auto">
      {MERCHANT_WEBHOOK_EVENTS.map((event) => (
        <li key={event} className="flex items-start gap-3">
          <Checkbox
            id={`evt-${event}`}
            checked={selected.has(event)}
            onCheckedChange={() => onToggle(event)}
          />
          <label htmlFor={`evt-${event}`} className="min-w-0 cursor-pointer">
            <code className="text-xs">{event}</code>
            <p className="text-xs text-muted-foreground">{MERCHANT_WEBHOOK_EVENT_DESCRIPTIONS[event]}</p>
          </label>
        </li>
      ))}
    </ul>
  )
}

function AddEndpointDialog({ onCreated }: { onCreated: () => void }) {
  const { livemode } = useConsoleLivemode()
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState("")
  const [description, setDescription] = useState("")
  const [events, setEvents] = useState<Set<MerchantWebhookEvent>>(new Set())
  const [creating, setCreating] = useState(false)
  const [secret, setSecret] = useState<string | null>(null)

  const toggle = (event: MerchantWebhookEvent) => {
    setEvents((prev) => {
      const next = new Set(prev)
      if (next.has(event)) next.delete(event)
      else next.add(event)
      return next
    })
  }

  const create = async () => {
    setCreating(true)
    try {
      const res = await fetchWithSession("/api/checkout/webhook-endpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, description, events: [...events], livemode: livemode === "live" }),
      })
      const body = (await res.json().catch(() => ({}))) as { secret?: string; error?: string }
      if (!res.ok || !body.secret) {
        toast.error(body.error || "Could not create endpoint")
        return
      }
      setSecret(body.secret)
      onCreated()
    } finally {
      setCreating(false)
    }
  }

  const close = () => {
    setOpen(false)
    setUrl("")
    setDescription("")
    setEvents(new Set())
    setSecret(null)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          Add endpoint
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a {livemode} endpoint</DialogTitle>
        </DialogHeader>
        {secret ? (
          <RevealOnceValue value={secret} note="Shown once. Keep it on your server." />
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="endpoint-url">Endpoint URL</Label>
              <Input
                id="endpoint-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://yourapp.com/webhooks/easner"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="endpoint-description">Description (optional)</Label>
              <Input
                id="endpoint-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Order fulfillment service"
              />
            </div>
            <div className="space-y-2">
              <Label>Events</Label>
              <EventCheckboxes selected={events} onToggle={toggle} />
            </div>
          </div>
        )}
        <DialogFooter>
          {secret ? (
            <Button type="button" onClick={close}>
              Done
            </Button>
          ) : (
            <Button
              type="button"
              disabled={creating || !url.trim() || events.size === 0}
              onClick={() => void create()}
            >
              {creating ? "Creating…" : "Create endpoint"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EndpointRow({ endpoint, onChanged }: { endpoint: WebhookEndpoint; onChanged: () => void }) {
  const [disableOpen, setDisableOpen] = useState(false)
  const [disabling, setDisabling] = useState(false)
  const [testEvent, setTestEvent] = useState<MerchantWebhookEvent>(endpoint.events[0] ?? "checkout.completed")
  const [testing, setTesting] = useState(false)

  const disable = async () => {
    setDisabling(true)
    try {
      const res = await fetchWithSession(`/api/checkout/webhook-endpoints/${endpoint.id}`, { method: "DELETE" })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        toast.error(body.error || "Could not disable endpoint")
        return
      }
      toast.success("Endpoint disabled.")
      setDisableOpen(false)
      onChanged()
    } finally {
      setDisabling(false)
    }
  }

  const sendTest = async () => {
    setTesting(true)
    try {
      const res = await fetchWithSession("/api/checkout/webhook-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpointId: endpoint.id, event: testEvent }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string; status?: number }
      if (!res.ok) {
        toast.error(body.error || "Test delivery failed")
        return
      }
      toast.success(`Your endpoint replied ${body.status ?? 200}.`)
    } finally {
      setTesting(false)
    }
  }

  if (endpoint.disabled_at) return null

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs text-foreground">{endpoint.url}</p>
          {endpoint.description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{endpoint.description}</p>
          ) : null}
        </div>
        <Badge variant="secondary" className="shrink-0 text-[11px] capitalize">
          {endpoint.livemode ? "live" : "test"}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {endpoint.events.map((event) => (
          <Badge key={event} variant="outline" className="text-[11px] font-normal">
            {event}
          </Badge>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Secret ending {endpoint.webhook_secret_last4 ?? "—"}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={testEvent} onValueChange={(v) => setTestEvent(v as MerchantWebhookEvent)}>
          <SelectTrigger className="h-8 w-[220px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {endpoint.events.map((event) => (
              <SelectItem key={event} value={event}>
                {event}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" size="sm" variant="outline" disabled={testing} onClick={() => void sendTest()}>
          {testing ? "Sending…" : "Send test event"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setDisableOpen(true)}>
          Disable
        </Button>
      </div>

      <AlertDialog open={disableOpen} onOpenChange={setDisableOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable this endpoint?</AlertDialogTitle>
            <AlertDialogDescription>
              It stops receiving events immediately. This can&rsquo;t be undone from here — create a new endpoint if you
              need it again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void disable()} disabled={disabling}>
              {disabling ? "Disabling…" : "Disable endpoint"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export function ConsoleWebhooksPanel() {
  const queryClient = useQueryClient()
  const { data, isPending, isError } = useEndpoints()
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ENDPOINTS_QUERY_KEY })
  const endpoints = (data ?? []).filter((e) => !e.disabled_at)
  const endpointLabels = Object.fromEntries((data ?? []).map((e) => [e.id, e.description || e.url]))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">Endpoints</p>
          <p className="text-xs text-muted-foreground">Send events to as many endpoints as you need.</p>
        </div>
        <AddEndpointDialog onCreated={refresh} />
      </div>

      {isPending ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : isError ? (
        <p className="text-xs text-destructive">Could not load endpoints.</p>
      ) : endpoints.length === 0 ? (
        <p className="text-xs text-muted-foreground">No endpoints yet. Add one to start receiving events.</p>
      ) : (
        <div className="space-y-3">
          {endpoints.map((endpoint) => (
            <EndpointRow key={endpoint.id} endpoint={endpoint} onChanged={refresh} />
          ))}
        </div>
      )}

      <CheckoutWebhookDeliveries live endpointLabels={endpointLabels} />
    </div>
  )
}
