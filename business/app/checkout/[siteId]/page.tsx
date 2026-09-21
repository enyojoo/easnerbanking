"use client"

import { use } from "react"
import { CheckoutIntegrationHub } from "@/components/checkout/checkout-integration-hub"
import { CheckoutSetupShell } from "@/components/checkout/checkout-setup-shell"

export default function CheckoutSitePage({
  params,
}: {
  params: Promise<{ siteId: string }>
}) {
  const { siteId } = use(params)
  return (
    <CheckoutSetupShell>
      <CheckoutIntegrationHub flow="edit" siteId={siteId} />
    </CheckoutSetupShell>
  )
}
