"use client"

import { ConsolePageHeader } from "@/components/console/console-page-header"
import { ConsoleWebhooksPanel } from "@/components/console/console-webhooks-panel"
import { PAGE_COPY } from "@/lib/copy/business-ui-copy"

export default function ConsoleEventsPage() {
  return (
    <div className="space-y-6">
      <ConsolePageHeader
        title={PAGE_COPY.consoleEvents.title}
        description={PAGE_COPY.consoleEvents.intro}
      />
      <ConsoleWebhooksPanel variant="catalog" />
    </div>
  )
}
