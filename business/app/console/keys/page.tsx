"use client"

import { PageIntro } from "@/components/copy/page-intro"
import { ConsoleKeysPanel } from "@/components/console/console-keys-panel"

export default function ConsoleKeysPage() {
  return (
    <div className="space-y-6">
      <PageIntro
        title="API keys"
        description="One test key and one live key. New keys include checkout, accounts, and transfers."
        variant="page"
      />
      <ConsoleKeysPanel />
    </div>
  )
}
