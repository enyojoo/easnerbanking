"use client"

import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckoutWebhookDeliveries } from "@/components/checkout/checkout-webhook-deliveries"
import { openTestCheckout } from "@/components/checkout/open-test-checkout"
import type { CheckoutSiteSetupStep } from "@/lib/checkout/checkout-phases"
import type { CheckoutHubPayload, CheckoutSite } from "@/lib/checkout/hub-types"
import { COLLECTIONS_COPY } from "@/lib/copy/business-ui-copy"

export function CheckoutDashboardPanel({
  data,
  site,
  onEditStep,
  onOpenGuide,
  onSaved,
  liveSwitch,
}: {
  data: CheckoutHubPayload
  site: CheckoutSite
  onEditStep: (step: CheckoutSiteSetupStep) => void
  onOpenGuide: () => void
  onSaved: () => void
  liveSwitch: ReactNode
}) {
  const [trying, setTrying] = useState(false)
  const testKey = data.keys.find((key) => key.mode === "test")
  const liveKey = data.keys.find((key) => key.mode === "live")
  const activeKey = liveKey ?? testKey
  const publishable = activeKey?.publishable_key ?? "easner_pk_test_…"
  const webhookOn = Boolean(data.settings.webhookUrl && data.settings.webhookSecretLast4)
  const lastDelivery = data.settings.lastWebhookDeliveredAt
    ? `Delivered ${new Date(data.settings.lastWebhookDeliveredAt).toLocaleString()}`
    : COLLECTIONS_COPY.webhookNoDeliveries

  const tryTest = async () => {
    setTrying(true)
    try {
      await openTestCheckout({
        fallbackPublishableKey: publishable,
        onSuccess: onSaved,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open checkout")
    } finally {
      setTrying(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <StatusCard
          title={COLLECTIONS_COPY.originLabel}
          hint={site.origin}
          onEdit={() => onEditStep("website")}
        />
        <StatusCard
          title={COLLECTIONS_COPY.returnUrlsLabel}
          hint={[
            site.successUrl ? COLLECTIONS_COPY.successUrlSaved : null,
            site.cancelUrl ? COLLECTIONS_COPY.cancelUrlSaved : COLLECTIONS_COPY.noCancelUrl,
          ]
            .filter(Boolean)
            .join(" · ")}
          onEdit={() => onEditStep("urls")}
        />
        <StatusCard
          title={COLLECTIONS_COPY.keysLabel}
          hint={
            activeKey
              ? `${activeKey.mode} · last used ${
                  activeKey.last_used_at
                    ? new Date(activeKey.last_used_at).toLocaleString()
                    : COLLECTIONS_COPY.lastUsedNever
                }`
              : "None yet"
          }
          onEdit={() => onEditStep("keys")}
        />
        <StatusCard
          title={COLLECTIONS_COPY.webhookLabel}
          hint={data.settings.webhookUrl ?? lastDelivery}
          badge={
            <Badge variant={webhookOn ? "emerald" : "slate"}>
              {webhookOn ? COLLECTIONS_COPY.statusWebhookOn : COLLECTIONS_COPY.statusWebhookOff}
            </Badge>
          }
          extra={webhookOn ? lastDelivery : null}
          onEdit={() => onEditStep("webhook")}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="primary"
          disabled={trying || !data.keys.length}
          onClick={() => void tryTest()}
        >
          {trying ? COLLECTIONS_COPY.tryingTestCheckout : COLLECTIONS_COPY.tryTestCheckout}
        </Button>
        <Button type="button" variant="secondary" onClick={onOpenGuide}>
          {COLLECTIONS_COPY.addToWebsite}
        </Button>
      </div>

      <CheckoutWebhookDeliveries live />
      {liveSwitch}
    </div>
  )
}

function StatusCard({
  title,
  hint,
  badge,
  extra,
  onEdit,
}: {
  title: string
  hint: string
  badge?: ReactNode
  extra?: string | null
  onEdit: () => void
}) {
  return (
    <Card elevation="flat" padding="sm">
      <CardHeader className="px-5">
        <CardTitle>{title}</CardTitle>
        <CardAction>
          <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
            {COLLECTIONS_COPY.editWebsite}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 px-5">
        {badge}
        <p className="break-all font-mono text-xs text-muted-foreground">{hint}</p>
        {extra ? <p className="text-xs text-muted-foreground">{extra}</p> : null}
      </CardContent>
    </Card>
  )
}
