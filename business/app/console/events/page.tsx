"use client"

import { PageIntro } from "@/components/copy/page-intro"
import { ConsoleWebhooksPanel } from "@/components/console/console-webhooks-panel"

export default function ConsoleEventsPage() {
  return (
    <div className="space-y-6">
      <PageIntro
        title="Events"
        description="The webhook catalog. Tick events on the same endpoint as Webhooks."
        variant="page"
      />
      <ConsoleWebhooksPanel />
    </div>
  )
}
