"use client"

import { use } from "react"
import { CheckoutIntegrationHub } from "@/components/checkout/checkout-integration-hub"
import { CheckoutSetupShell } from "@/components/checkout/checkout-setup-shell"
import { CollectionsReadinessBanner } from "@/components/collections/collections-readiness-banner"

export default function CheckoutSitePage({
  params,
}: {
  params: Promise<{ siteId: string }>
}) {
  const { siteId } = use(params)
  return (
    <CheckoutSetupShell>
      <CollectionsReadinessBanner />
      <CheckoutIntegrationHub flow="edit" siteId={siteId} />
    </CheckoutSetupShell>
  )
}
