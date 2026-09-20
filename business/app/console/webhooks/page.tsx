"use client"

import { PageIntro } from "@/components/copy/page-intro"
import { ConsoleWebhooksPanel } from "@/components/console/console-webhooks-panel"

export default function ConsoleWebhooksPage() {
  return (
    <div className="space-y-6">
      <PageIntro
        title="Webhooks"
        description="One endpoint per mode. Tick events and verify easner-signature."
        variant="page"
      />
      <ConsoleWebhooksPanel />
    </div>
  )
}
