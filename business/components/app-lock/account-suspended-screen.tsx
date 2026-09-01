"use client"

import { Button } from "@/components/ui/button"
import { accountRestrictionLockedCopy } from "@easner/shared"

export function AccountSuspendedScreen({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="fixed inset-0 z-[2147483647] flex flex-col items-center justify-center bg-background px-6 text-center">
      <div className="max-w-md space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Account suspended</h1>
        <p className="text-sm text-muted-foreground">{accountRestrictionLockedCopy()}</p>
        <Button variant="outline" onClick={onLogout}>
          Sign out
        </Button>
      </div>
    </div>
  )
}
