"use client"

import { CheckoutIntegrationHub } from "@/components/checkout/checkout-integration-hub"
import { CheckoutSetupShell } from "@/components/checkout/checkout-setup-shell"
import { CollectionsReadinessBanner } from "@/components/collections/collections-readiness-banner"
import { COLLECTIONS_COPY } from "@/lib/copy/business-ui-copy"

export default function CheckoutNewPage() {
  return (
    <CheckoutSetupShell title={COLLECTIONS_COPY.setupCreateTitle}>
      <CollectionsReadinessBanner />
      <CheckoutIntegrationHub flow="create" />
    </CheckoutSetupShell>
  )
}
