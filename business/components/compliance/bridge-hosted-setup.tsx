"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft } from "lucide-react"
import { BUSINESS_VERIFICATION_PRODUCTS, verificationStatusLabel } from "@easner/shared"
import { Button } from "@/components/ui/button"
import { DelayedOpeningVerificationWait } from "@/components/compliance/opening-verification-wait"
import { fetchWithSession } from "@/lib/fetch-with-session"
import {
  buildBridgeHostedIframeUrl,
  isBridgeHostedMessageOrigin,
  isBridgeTosAcceptedMessage,
  isHostedVerificationCompleteMessage,
  signedAgreementIdFromUnknown,
  signedAgreementIdFromUrl,
} from "@/lib/bridge/hosted-iframe-url"

const EUR_TITLE =
  BUSINESS_VERIFICATION_PRODUCTS.find((product) => product.id === "eur")?.title ?? "More accounts"

const TOS_IFRAME_SANDBOX =
  "allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
const KYC_IFRAME_SANDBOX = `${TOS_IFRAME_SANDBOX} allow-top-navigation-by-user-activation`

type HostedPhase = "tos" | "kyc"

type Props = {
  onClose: () => void
}

async function fetchBridgeHostedLinks(): Promise<{
  kyc_link: string
  tos_link: string
  alreadyOnboarded: boolean
}> {
  const res = await fetchWithSession("/api/bridge/kyc-links", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Easner-Account-Scope": "business",
    },
    body: JSON.stringify({ type: "business" }),
  })
  const json = (await res.json().catch(() => ({}))) as {
    kyc_link?: string | null
    tos_link?: string | null
    alreadyOnboarded?: boolean
    error?: string
  }
  if (!res.ok) throw new Error(json.error || "Could not start verification")
  return {
    kyc_link: String(json.kyc_link || "").trim(),
    tos_link: String(json.tos_link || "").trim(),
    alreadyOnboarded: Boolean(json.alreadyOnboarded),
  }
}

export function BridgeHostedSetup({ onClose }: Props) {
  const [hostedUrl, setHostedUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [frameReady, setFrameReady] = useState(false)
  const [phase, setPhase] = useState<HostedPhase>("tos")
  const finishedRef = useRef(false)
  const pendingKycUrl = useRef<string | null>(null)
  const phaseRef = useRef<HostedPhase>("tos")
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  const iframeSrc = useMemo(() => {
    if (!hostedUrl) return null
    const origin = typeof window === "undefined" ? "" : window.location.origin
    return buildBridgeHostedIframeUrl(hostedUrl, origin)
  }, [hostedUrl])

  const closeAndSync = useCallback(() => {
    if (finishedRef.current) return
    finishedRef.current = true
    onClose()
    void fetchWithSession("/api/bridge/sync-status", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Easner-Account-Scope": "business",
      },
      body: JSON.stringify({}),
    })
      .catch(() => undefined)
      .finally(() => {
        window.dispatchEvent(new CustomEvent("business-profile-updated"))
      })
  }, [onClose])

  const openKyc = useCallback((url: string) => {
    pendingKycUrl.current = null
    phaseRef.current = "kyc"
    setPhase("kyc")
    setFrameReady(false)
    setHostedUrl(url)
  }, [])

  const attachTosInBackground = useCallback((signedAgreementId: string) => {
    void fetchWithSession("/api/bridge/tos-accept", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Easner-Account-Scope": "business",
      },
      body: JSON.stringify({ signed_agreement_id: signedAgreementId }),
    }).catch(() => undefined)
  }, [])

  const continueToKyc = useCallback(async (signedAgreementId?: string | null) => {
    if (phaseRef.current === "kyc") return
    const signed = String(signedAgreementId ?? "").trim()
    if (signed) attachTosInBackground(signed)
    const stored = String(pendingKycUrl.current ?? "").trim()
    if (stored) {
      openKyc(stored)
      return
    }
    setFrameReady(false)
    try {
      const next = await fetchBridgeHostedLinks()
      if (next.alreadyOnboarded) {
        closeAndSync()
        return
      }
      if (!next.kyc_link) {
        setError("Could not start verification")
        return
      }
      openKyc(next.kyc_link)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not start verification")
    }
  }, [attachTosInBackground, closeAndSync, openKyc])

  const loadHosted = useCallback(async () => {
    setError(null)
    setFrameReady(false)
    setHostedUrl(null)
    finishedRef.current = false
    const json = await fetchBridgeHostedLinks()
    if (json.alreadyOnboarded && !json.tos_link && !json.kyc_link) {
      closeAndSync()
      return
    }
    if (json.kyc_link) {
      openKyc(json.kyc_link)
      return
    }
    if (json.tos_link) {
      pendingKycUrl.current = null
      phaseRef.current = "tos"
      setPhase("tos")
      setHostedUrl(json.tos_link)
      return
    }
    throw new Error("Could not start verification")
  }, [closeAndSync, openKyc])

  useEffect(() => {
    let cancelled = false
    void loadHosted().catch((err: unknown) => {
      if (cancelled) return
      setError(err instanceof Error ? err.message : "Could not start verification")
    })
    return () => {
      cancelled = true
    }
  }, [loadHosted])

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!isBridgeHostedMessageOrigin(event.origin, window.location.origin)) return
      if (isBridgeTosAcceptedMessage(event.data) || phaseRef.current === "tos") {
        if (isBridgeTosAcceptedMessage(event.data) || isHostedVerificationCompleteMessage(event.data)) {
          void continueToKyc(signedAgreementIdFromUnknown(event.data))
          return
        }
      }
      if (phaseRef.current === "kyc" && isHostedVerificationCompleteMessage(event.data)) {
        closeAndSync()
      }
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [closeAndSync, continueToKyc])

  const readTosReturnFromIframe = useCallback(() => {
    if (phaseRef.current !== "tos") return
    try {
      const href = iframeRef.current?.contentWindow?.location.href ?? ""
      if (!href) return
      if (href.includes("/auth/onboarding-complete") || href.includes("signed_agreement_id")) {
        void continueToKyc(signedAgreementIdFromUrl(href))
      }
    } catch {
      // Still on Bridge's origin until Accept redirects.
    }
  }, [continueToKyc])

  useEffect(() => {
    if (phase !== "tos" || !iframeSrc) return
    const timer = window.setInterval(readTosReturnFromIframe, 400)
    return () => window.clearInterval(timer)
  }, [iframeSrc, phase, readTosReturnFromIframe])

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <div className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b px-2 py-2 sm:px-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 min-w-[8.5rem] justify-start gap-1 px-2"
          onClick={closeAndSync}
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back
        </Button>
        <p className="truncate text-center text-sm font-medium">{EUR_TITLE}</p>
        <p className="min-w-[8.5rem] text-right text-xs font-medium text-muted-foreground">
          {verificationStatusLabel("in_progress", { complete: false })}
        </p>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {error ? (
          <div className="flex h-full min-h-[16rem] flex-col items-center justify-center gap-3 px-4 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                void loadHosted().catch((err: unknown) => {
                  setError(err instanceof Error ? err.message : "Could not start verification")
                })
              }}
            >
              Try again
            </Button>
          </div>
        ) : iframeSrc ? (
          <iframe
            ref={iframeRef}
            title={EUR_TITLE}
            src={iframeSrc}
            className="absolute inset-0 h-full w-full border-0 bg-background"
            allow="camera; microphone"
            sandbox={phase === "tos" ? TOS_IFRAME_SANDBOX : KYC_IFRAME_SANDBOX}
            onLoad={() => {
              setFrameReady(true)
              readTosReturnFromIframe()
            }}
          />
        ) : null}
        {!error && !frameReady ? (
          <div className="absolute inset-0 z-10 bg-background">
            <DelayedOpeningVerificationWait />
          </div>
        ) : null}
      </div>
    </div>
  )
}
