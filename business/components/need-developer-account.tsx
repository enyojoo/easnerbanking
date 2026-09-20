"use client"

import { KeyRound, MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BusinessLogo } from "@/components/brand/business-logo"
import { openBusinessSupport } from "@/lib/intercom-messenger"

export function NeedDeveloperAccountPage() {
  return (
    <div className="flex min-h-[28rem] flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-border/70 bg-card shadow-soft">
        <KeyRound className="h-5 w-5 text-primary" />
      </div>
      <h1 className="text-xl font-semibold tracking-tight">Need API Account?</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Contact us for developer access.
      </p>
      <Button
        type="button"
        className="mt-6 gap-2"
        onClick={() => {
          void openBusinessSupport()
        }}
      >
        <MessageCircle className="h-4 w-4" />
        Contact support
      </Button>
      <div className="mt-10">
        <BusinessLogo size="sm" href="/" />
      </div>
    </div>
  )
}
