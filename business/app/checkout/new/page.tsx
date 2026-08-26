"use client"

import { CheckoutIntegrationHub } from "@/components/checkout/checkout-integration-hub"
import { CheckoutSetupShell } from "@/components/checkout/checkout-setup-shell"
import { CollectionsReadinessBanner } from "@/components/collections/collections-readiness-banner"

export default function CheckoutNewPage() {
  return (
    <CheckoutSetupShell>
      <CollectionsReadinessBanner />
      <CheckoutIntegrationHub flow="create" />
    </CheckoutSetupShell>
  )
}
