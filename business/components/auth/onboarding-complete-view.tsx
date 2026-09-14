"use client"

import { useEffect } from "react"
import { SETTINGS_BRIDGE_FLOW_HREF, SETTINGS_VERIFICATION_HREF } from "@/lib/compliance/cutover-comms"

/** Minimal ReturnURL target for hosted KYC/KYB (iframe or in-app browser). */
export function OnboardingCompleteView() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const context = params.get("context") ?? undefined
    const signedAgreementId =
      params.get("signed_agreement_id")?.trim() || params.get("signedAgreementId")?.trim() || undefined
    const embedded = window.parent !== window
    if (context === "bridge-tos") {
      if (embedded) {
        window.parent.postMessage(
          {
            type: "bridgeTosAccepted",
            bridgeTosAccepted: true,
            ...(signedAgreementId
              ? { signed_agreement_id: signedAgreementId, signedAgreementId }
              : {}),
          },
          window.location.origin,
        )
        return
      }
      window.location.replace(SETTINGS_BRIDGE_FLOW_HREF)
      return
    }
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
