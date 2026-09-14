"use client"

import { useEffect } from "react"

/** Minimal ReturnURL target for hosted KYC/KYB (iframe or in-app browser). */
export function OnboardingCompleteView() {
  useEffect(() => {
    const embedded = window.parent !== window
    if (!embedded) return
    const context = new URLSearchParams(window.location.search).get("context") ?? undefined
    window.parent.postMessage(
      {
        type: "kycCompleted",
        kycCompleted: true,
        hostedComplete: true,
        context,
      },
      window.location.origin,
    )
  }, [])

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <p className="max-w-sm text-center text-sm text-muted-foreground">
        You can close this window and return to Easner.
      </p>
    </main>
  )
}
