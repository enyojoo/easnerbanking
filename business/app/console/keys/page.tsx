"use client"

import { ConsoleKeysPanel } from "@/components/console/console-keys-panel"
import { ConsolePageHeader } from "@/components/console/console-page-header"
import { PAGE_COPY } from "@/lib/copy/business-ui-copy"

export default function ConsoleKeysPage() {
  return (
    <div className="space-y-6">
      <ConsolePageHeader title={PAGE_COPY.consoleKeys.title} description={PAGE_COPY.consoleKeys.intro} />
      <ConsoleKeysPanel />
    </div>
  )
}
