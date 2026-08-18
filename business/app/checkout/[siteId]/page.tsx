"use client"

import { use } from "react"
import { CheckoutIntegrationHub } from "@/components/checkout/checkout-integration-hub"
import { CheckoutSetupShell } from "@/components/checkout/checkout-setup-shell"
import { CollectionsReadinessBanner } from "@/components/collections/collections-readiness-banner"
import { COLLECTIONS_COPY } from "@/lib/copy/business-ui-copy"

export default function CheckoutSitePage({
  params,
}: {
  params: Promise<{ siteId: string }>
}) {
  const { siteId } = use(params)
  return (
    <CheckoutSetupShell title={COLLECTIONS_COPY.setupEditTitle}>
      <CollectionsReadinessBanner />
      <CheckoutIntegrationHub flow="edit" siteId={siteId} />
    </CheckoutSetupShell>
  )
}
