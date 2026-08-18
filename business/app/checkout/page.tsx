"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { CheckoutIntegrationHub } from "@/components/checkout/checkout-integration-hub"
import { CollectionsPageHeader } from "@/components/collections/collections-page-header"
import { useCheckoutSettings } from "@/hooks/use-checkout-settings"
import { COLLECTIONS_COPY, PAGE_COPY } from "@/lib/copy/business-ui-copy"

export default function CheckoutPage() {
  const { data } = useCheckoutSettings()
  const [dashboard, setDashboard] = useState(false)

  const chips = useMemo(() => {
    if (!data) return []
    const webhookOn = Boolean(data.settings.webhookUrl && data.settings.webhookSecretLast4)
    return [
      data.settings.liveModeEnabled ? COLLECTIONS_COPY.statusLive : COLLECTIONS_COPY.statusTest,
      webhookOn ? COLLECTIONS_COPY.statusWebhookOn : COLLECTIONS_COPY.statusWebhookOff,
    ]
  }, [data])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <CollectionsPageHeader
          title={PAGE_COPY.checkout.title}
          intro={PAGE_COPY.checkout.intro}
          chips={dashboard ? chips : undefined}
          actions={
            <p className="text-sm text-muted-foreground lg:text-right">
              {COLLECTIONS_COPY.notBuildingSite}{" "}
              <Link href="/links" className="underline underline-offset-2">
                {COLLECTIONS_COPY.openPaymentLinks}
              </Link>
            </p>
          }
        />
      </div>
      <CheckoutIntegrationHub onDashboardReady={setDashboard} />
    </div>
  )
}
