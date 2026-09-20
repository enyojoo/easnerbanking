"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { saveCheckoutSettings, useCheckoutSettings } from "@/hooks/use-checkout-settings"
import { fetchWithSession } from "@/lib/fetch-with-session"
import {
  MERCHANT_WEBHOOK_EVENT_DESCRIPTIONS,
  MERCHANT_WEBHOOK_EVENTS,
  type MerchantWebhookEvent,
} from "@/lib/checkout/merchant-webhook-events"

export function ConsoleWebhooksPanel({
  variant = "endpoint",
  showEvents = true,
}: {
  variant?: "endpoint" | "catalog"
  showEvents?: boolean
}) {
  const showEndpoint = variant === "endpoint"
  const { data, refetch } = useCheckoutSettings()
  const savedUrl = data?.settings.webhookUrl ?? ""
  const [editing, setEditing] = useState(!savedUrl)
  const [url, setUrl] = useState(savedUrl)
  const [saving, setSaving] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [testing, setTesting] = useState(false)
  const [rotateOpen, setRotateOpen] = useState(false)
  const [secret, setSecret] = useState<string | null>(null)
  const [events, setEvents] = useState<MerchantWebhookEvent[]>(
    data?.settings.subscribedWebhookEvents ?? [],
  )
  const hasSecret = Boolean(data?.settings.webhookSecretLast4)

  useEffect(() => {
    if (!editing) setUrl(savedUrl)
  }, [savedUrl, editing])

  useEffect(() => {
    if (data?.settings.subscribedWebhookEvents) {
      setEvents(data.settings.subscribedWebhookEvents)
    }
  }, [data?.settings.subscribedWebhookEvents])

  const saveUrl = async () => {
    setSaving(true)
    try {
      const result = await saveCheckoutSettings({ webhook_url: url })
      if (!result.ok) {
        toast.error(result.error || "Could not save")
        return
      }
      toast.success("Saved.")
      setEditing(false)
      await refetch()
    } finally {
      setSaving(false)
    }
  }

  const saveEvents = async (next: MerchantWebhookEvent[]) => {
    setEvents(next)
    const result = await saveCheckoutSettings({ webhook_events: next })
    if (!result.ok) {
      toast.error(result.error || "Could not save events")
      return
    }
    await refetch()
  }

  const rotateSecret = async () => {
    setRotating(true)
    try {
      const result = await saveCheckoutSettings({ rotate_webhook_secret: true })
      if (!result.ok) {
        toast.error(result.error || "Could not rotate the secret")
        return
      }
      if (result.webhookSecret) setSecret(result.webhookSecret)
      toast.success(hasSecret ? "Signing secret rotated." : "Signing secret created.")
      setRotateOpen(false)
      await refetch()
    } finally {
      setRotating(false)
    }
  }

  const sendTest = async () => {
    setTesting(true)
    try {
      const res = await fetchWithSession("/api/checkout/webhook-test", { method: "POST" })
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

  return (
    <div className="flex flex-col gap-6">
      {showEndpoint ? (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="console-webhook" className="mb-0">
            Endpoint URL
          </Label>
          {editing ? (
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button type="button" size="sm" disabled={saving || !url.trim()} onClick={() => void saveUrl()}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
        </div>
        <Input
          id="console-webhook"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://yourapp.com/webhooks/easner"
          disabled={!editing}
          className="font-mono text-xs"
        />
      </div>
      ) : null}

      {showEndpoint ? (
        <>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setRotateOpen(true)}>
              {hasSecret ? "Rotate signing secret" : "Create signing secret"}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={testing || !savedUrl} onClick={() => void sendTest()}>
              {testing ? "Sending…" : "Send test event"}
            </Button>
            {data?.settings.webhookSecretLast4 ? (
              <p className="self-center text-xs text-muted-foreground">
                Secret ending {data.settings.webhookSecretLast4}
              </p>
            ) : null}
          </div>
          {secret ? (
            <RevealOnceValue
              value={secret}
              note="Shown once. Keep it on your server."
            />
          ) : null}
        </>
      ) : null}

      {showEvents ? (
        <div className="space-y-3 rounded-xl border p-4 sm:p-5">
          <div>
            <p className="text-sm font-medium text-foreground">Events</p>
            <p className="text-xs text-muted-foreground">Choose what we send you.</p>
          </div>
          <ul className="space-y-3">
            {MERCHANT_WEBHOOK_EVENTS.map((event) => {
              const checked = events.includes(event)
              return (
                <li key={event} className="flex items-start gap-3">
                  <Checkbox
                    id={`evt-${event}`}
                    checked={checked}
                    onCheckedChange={(value) => {
                      const next = value === true
                        ? [...new Set([...events, event])]
                        : events.filter((item) => item !== event)
                      void saveEvents(next)
                    }}
                  />
                  <label htmlFor={`evt-${event}`} className="min-w-0 cursor-pointer">
                    <code className="text-xs">{event}</code>
                    <p className="text-xs text-muted-foreground">
                      {MERCHANT_WEBHOOK_EVENT_DESCRIPTIONS[event]}
                    </p>
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      {showEndpoint ? <CheckoutWebhookDeliveries live /> : null}

      <AlertDialog open={rotateOpen} onOpenChange={setRotateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rotate the signing secret?</AlertDialogTitle>
            <AlertDialogDescription>
              Deliveries will fail until you update your server with the new secret.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void rotateSecret()} disabled={rotating}>
              {rotating ? "Rotating…" : "Rotate secret"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
