"use client"

import { type ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckoutWebhookDeliveries } from "@/components/checkout/checkout-webhook-deliveries"
import type { CheckoutSiteSetupStep } from "@/lib/checkout/checkout-phases"
import type { CheckoutHubPayload, CheckoutSite } from "@/lib/checkout/hub-types"
import { COLLECTIONS_COPY } from "@/lib/copy/business-ui-copy"

export function CheckoutDashboardPanel({
  data,
  site,
  onEditStep,
  liveSwitch,
}: {
  data: CheckoutHubPayload
  site: CheckoutSite
  onEditStep: (step: CheckoutSiteSetupStep) => void
  liveSwitch: ReactNode
}) {
  const testKey = data.keys.find((key) => key.mode === "test")
  const liveKey = data.keys.find((key) => key.mode === "live")
  const activeKey = liveKey ?? testKey
  const webhookOn = Boolean(data.settings.webhookUrl && data.settings.webhookSecretLast4)
  const lastDelivery = data.settings.lastWebhookDeliveredAt
    ? `Delivered ${new Date(data.settings.lastWebhookDeliveredAt).toLocaleString()}`
    : COLLECTIONS_COPY.webhookNoDeliveries

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

      <p className="text-sm text-muted-foreground">{COLLECTIONS_COPY.testOnYourWebsite}</p>

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
