"use client"

import { useEffect, useRef } from "react"
import snsWebSdk from "@sumsub/websdk"
import { fetchWithSession } from "@/lib/fetch-with-session"

type Props = {
  accessToken: string
  onComplete: () => void
  onError?: (message: string) => void
}

async function refreshGridKycToken(): Promise<string> {
  const res = await fetchWithSession("/api/grid/kyc-links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "business" }),
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
export function GridSumsubWebSdk({ accessToken, onComplete, onError }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onCompleteRef = useRef(onComplete)
  const onErrorRef = useRef(onError)
  onCompleteRef.current = onComplete
  onErrorRef.current = onError

  useEffect(() => {
    const el = containerRef.current
    if (!el || !accessToken.trim()) return

    let disposed = false
    el.replaceChildren()

    const sdk = snsWebSdk
      .init(accessToken, () => refreshGridKycToken())
      .withConf({ lang: "en" })
      .withOptions({ addViewportTag: false, adaptIframeHeight: true })
      .on("idCheck.onApplicantStatusChanged", (payload) => {
        const reviewStatus = String(
          (payload as { reviewStatus?: string } | null)?.reviewStatus ?? "",
        ).toLowerCase()
        if (
          reviewStatus === "completed" ||
          reviewStatus === "pending" ||
          reviewStatus === "onhold"
        ) {
          onCompleteRef.current()
        }
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
      try {
        // SumSub SDK has no documented destroy; clear DOM on unmount.
        if (!disposed) return
        el.replaceChildren()
      } catch {
        // ignore
      }
    }
  }, [accessToken])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 size-full overflow-auto bg-background"
      data-testid="grid-sumsub-websdk"
    />
  )
}
