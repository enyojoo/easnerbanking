"use client"

import { useMemo, useState } from "react"
import { CheckoutIntegrationHub } from "@/components/checkout/checkout-integration-hub"
import { CollectionsPageHeader } from "@/components/collections/collections-page-header"
import { CollectionsReadinessBanner } from "@/components/collections/collections-readiness-banner"
import { useCheckoutSettings } from "@/hooks/use-checkout-settings"
import { COLLECTIONS_COPY, PAGE_COPY } from "@/lib/copy/business-ui-copy"

function relativeTime(iso: string | null): string | null {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return null
  const delta = Date.now() - then
  const hours = Math.round(delta / 3_600_000)
  if (hours < 1) return `${COLLECTIONS_COPY.statusLastTest}: just now`
  if (hours < 24) return `${COLLECTIONS_COPY.statusLastTest}: ${hours}h ago`
  const days = Math.round(hours / 24)
  return `${COLLECTIONS_COPY.statusLastTest}: ${days}d ago`
}

export default function CheckoutPage() {
  const { data } = useCheckoutSettings()
  const [dashboard, setDashboard] = useState(false)

  const chips = useMemo(() => {
    if (!data) return []
    const webhookOn = Boolean(data.settings.webhookUrl && data.settings.webhookSecretLast4)
    return [
      data.settings.liveModeEnabled ? COLLECTIONS_COPY.statusLive : COLLECTIONS_COPY.statusTest,
      webhookOn ? COLLECTIONS_COPY.statusWebhookOn : COLLECTIONS_COPY.statusWebhookOff,
      relativeTime(data.settings.testPaymentCompletedAt) ?? COLLECTIONS_COPY.statusNoTest,
    ]
  }, [data])

  return (
    <div className="flex flex-col gap-6">
      <div className="sticky top-0 z-20 flex shrink-0 flex-col gap-4 border-b bg-background pb-4">
        <CollectionsPageHeader
          title={PAGE_COPY.checkout.title}
          intro={PAGE_COPY.checkout.intro}
          chips={dashboard ? chips : undefined}
        />
        <CollectionsReadinessBanner />
      </div>
      <CheckoutIntegrationHub onDashboardReady={setDashboard} />
    </div>
  )
}
