"use client"

import { useEffect, useRef } from "react"
import snsWebSdk from "@sumsub/websdk"
import { fetchWithSession } from "@/lib/fetch-with-session"
import {
  sumsubApplicantHasNoRequiredAction,
  sumsubReviewStatusIsWaitingForReview,
  sumsubReviewStatusShouldSyncGrid,
  sumsubReviewStatusTriggersComplete,
  sumsubStepIsIdentityDocument,
  sumsubStepRequiresApplicantAction,
} from "@/lib/compliance/sumsub-hosted-kyb-status"
import { cn } from "@/lib/utils"

export {
  gridKybStatusClosesHostedFlow,
  sumsubReviewStatusShouldSyncGrid,
  sumsubReviewStatusTriggersComplete,
} from "@/lib/compliance/sumsub-hosted-kyb-status"

type Props = {
  accessToken: string
  onComplete: () => void
  /** Pull Grid KYB after a SumSub step. Must not close the pane (company-only `pending`). */
  onProgress?: (reviewStatus: string) => void
  onError?: (message: string) => void
  onReady?: () => void
  theme?: "light" | "dark"
}

async function refreshGridKycToken(): Promise<string> {
  const res = await fetchWithSession("/api/grid/kyc-links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "business", refresh: true }),
  })
  const json = (await res.json().catch(() => ({}))) as {
    kyc_token?: string | null
    error?: string
  }
  const token = String(json.kyc_token ?? "").trim()
  if (!res.ok || !token) {
    throw new Error(json.error || "Could not refresh verification session")
  }
  return token
}

/**
 * Embed SumSub via Grid `createKYCLink.token` (preferred over iframing `kycUrl`).
 * Grid docs: token and hosted URL both update the same customer kyc/kyb status.
 */
export function GridSumsubWebSdk({
  accessToken,
  onComplete,
  onProgress,
  onError,
  onReady,
  theme = "dark",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onCompleteRef = useRef(onComplete)
  const onProgressRef = useRef(onProgress)
  const onErrorRef = useRef(onError)
  const onReadyRef = useRef(onReady)
  onCompleteRef.current = onComplete
  onProgressRef.current = onProgress
  onErrorRef.current = onError
  onReadyRef.current = onReady

  useEffect(() => {
    const el = containerRef.current
    if (!el || !accessToken.trim()) return

    let disposed = false
    let identityStepDone = false
    let requiredStepShown = false
    let noActionTimer: ReturnType<typeof setTimeout> | null = null
    el.replaceChildren()

    const markNoActionRequired = () => {
      if (requiredStepShown || disposed) return
      identityStepDone = true
      onProgressRef.current?.("no_action_required")
    }

    const scheduleNoActionIfIdle = () => {
      if (noActionTimer) clearTimeout(noActionTimer)
      noActionTimer = setTimeout(() => {
        if (!disposed && !requiredStepShown) markNoActionRequired()
      }, 2000)
    }

    const noteRequiredStep = (payload: unknown) => {
      if (!sumsubStepRequiresApplicantAction(readStepType(payload))) return
      requiredStepShown = true
      if (noActionTimer) clearTimeout(noActionTimer)
    }

    const readStepType = (payload: unknown): string => {
      const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {}
      return String(record.idDocSetType ?? record.step ?? "").trim()
    }

    const onIdentityOrCompanySubmit = () => {
      if (identityStepDone) {
        onProgressRef.current?.("identity_submitted")
        return
      }
      onProgressRef.current?.("applicant_submitted")
    }

    const handleApplicantStatus = (payload: unknown) => {
      const reviewStatus = String(
        (payload as { reviewStatus?: string } | null)?.reviewStatus ?? "",
      )
      if (sumsubApplicantHasNoRequiredAction(payload) || sumsubReviewStatusIsWaitingForReview(reviewStatus)) {
        scheduleNoActionIfIdle()
      }
      if (sumsubApplicantHasNoRequiredAction(payload)) {
        markNoActionRequired()
      } else if (sumsubReviewStatusShouldSyncGrid(reviewStatus)) {
        onProgressRef.current?.(
          identityStepDone && reviewStatus.toLowerCase() === "pending" ? "identity_submitted" : reviewStatus,
        )
      }
      if (sumsubReviewStatusTriggersComplete(reviewStatus)) {
        onCompleteRef.current()
      }
    }

    const sdk = snsWebSdk
      .init(accessToken, () => refreshGridKycToken())
      .withConf({ lang: "en", theme })
      // false = fill our dialog height; true shrinks iframe to SumSub card height (leaves empty gap).
      .withOptions({ addViewportTag: false, adaptIframeHeight: false })
      .on("idCheck.onReady", () => {
        onReadyRef.current?.()
      })
      .on("idCheck.onStepInitiated", (payload) => {
        noteRequiredStep(payload)
      })
      .on("idCheck.stepInitiated", (payload) => {
        noteRequiredStep(payload)
      })
      .on("idCheck.onApplicantLoaded", (payload) => {
        if (sumsubApplicantHasNoRequiredAction(payload)) markNoActionRequired()
      })
      .on("idCheck.onModuleResultPresented", () => {
        markNoActionRequired()
      })
      .on("idCheck.moduleResultPresented", () => {
        markNoActionRequired()
      })
      .on("idCheck.onStepCompleted", (payload) => {
        if (!sumsubStepIsIdentityDocument(readStepType(payload))) return
        identityStepDone = true
        onProgressRef.current?.("identity_submitted")
      })
      .on("idCheck.stepCompleted", (payload) => {
        if (!sumsubStepIsIdentityDocument(readStepType(payload))) return
        identityStepDone = true
        onProgressRef.current?.("identity_submitted")
      })
      .on("idCheck.onApplicantStatusChanged", handleApplicantStatus)
      .on("idCheck.applicantStatus", handleApplicantStatus)
      .on("idCheck.onApplicantSubmitted", () => {
        onIdentityOrCompanySubmit()
      })
      .on("idCheck.onApplicantResubmitted", () => {
        onIdentityOrCompanySubmit()
      })
      .on("idCheck.onError", (error) => {
        const message =
          error && typeof error === "object" && "message" in error
            ? String((error as { message?: unknown }).message ?? "Verification error")
            : "Verification error"
        onErrorRef.current?.(message)
      })
      .build()

    sdk.launch(el)

    return () => {
      disposed = true
      if (noActionTimer) clearTimeout(noActionTimer)
      try {
        // SumSub SDK has no documented destroy; clear DOM on unmount.
        el.replaceChildren()
      } catch {
        // ignore
      }
      void disposed
    }
  }, [accessToken])

  return (
    <div
      ref={containerRef}
      className={cn(
        "grid-sumsub-host size-full min-h-0 overflow-auto",
        theme === "light" ? "bg-background" : "bg-[#1a1a1a]",
      )}
      data-testid="grid-sumsub-websdk"
    />
  )
}
