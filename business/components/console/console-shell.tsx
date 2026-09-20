"use client"

import { ConsoleLivemodeProvider } from "@/lib/console/livemode-context"
import { ConsoleModeSwitch } from "@/components/console/console-mode-switch"

/**
 * Persistent chrome for the whole Developers section: one Test/Live switch
 * that survives sidebar navigation, instead of each page owning its own
 * `?livemode=` query param.
 */
export function ConsoleShell({ children }: { children: React.ReactNode }) {
  return (
    <ConsoleLivemodeProvider>
      <div className="space-y-4">
        <div className="flex justify-end">
          <ConsoleModeSwitch />
        </div>
        {children}
      </div>
    </ConsoleLivemodeProvider>
  )
}
