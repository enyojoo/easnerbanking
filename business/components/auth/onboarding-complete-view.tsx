"use client"

import { useEffect } from "react"
import { SETTINGS_VERIFICATION_HREF } from "@/lib/compliance/cutover-comms"

/** Minimal ReturnURL target for hosted KYC/KYB (iframe or in-app browser). */
export function OnboardingCompleteView() {
  useEffect(() => {
    const context = new URLSearchParams(window.location.search).get("context") ?? undefined
    const embedded = window.parent !== window
    if (embedded) {
      window.parent.postMessage(
        {
          type: "kycCompleted",
          kycCompleted: true,
          hostedComplete: true,
          noahHostedComplete: true,
          gridHostedComplete: true,
          context,
        },
        window.location.origin,
      )
      return
    }
    if (context === "business" || context === "kyb") {
      window.location.replace(SETTINGS_VERIFICATION_HREF)
    }
  }, [])

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <p className="max-w-sm text-center text-sm text-muted-foreground">
        You can close this window and return to Easner.
      </p>
    </main>
  )
}
