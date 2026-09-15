"use client"

import { Button } from "@/components/ui/button"
import {
  ACCOUNT_RESTRICTION_LOCKED_CONTACT_CTA,
  ACCOUNT_RESTRICTION_LOCKED_LEAD,
  ACCOUNT_RESTRICTION_LOCKED_TRAIL,
  APP_URLS,
} from "@easner/shared"

export function AccountSuspendedScreen({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="fixed inset-0 z-[2147483647] flex flex-col items-center justify-center bg-background px-6 text-center">
      <div className="max-w-md space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Account suspended</h1>
        <p className="text-sm text-muted-foreground">
          {ACCOUNT_RESTRICTION_LOCKED_LEAD}{" "}
          <a
            href={APP_URLS.contact}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground underline underline-offset-2"
          >
            {ACCOUNT_RESTRICTION_LOCKED_CONTACT_CTA}
          </a>{" "}
          {ACCOUNT_RESTRICTION_LOCKED_TRAIL}
        </p>
        <Button variant="outline" onClick={onLogout}>
          Sign out
        </Button>
      </div>
    </div>
  )
}
