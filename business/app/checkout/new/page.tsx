"use client"

import { CheckoutIntegrationHub } from "@/components/checkout/checkout-integration-hub"
import { CheckoutSetupShell } from "@/components/checkout/checkout-setup-shell"

export default function CheckoutNewPage() {
  return (
    <CheckoutSetupShell>
      <CheckoutIntegrationHub flow="create" />
    </CheckoutSetupShell>
  )
}
