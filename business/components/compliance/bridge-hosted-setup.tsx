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
  isHostedVerificationCompleteMessage,
} from "@/lib/bridge/hosted-iframe-url"

const EUR_TITLE =
  BUSINESS_VERIFICATION_PRODUCTS.find((product) => product.id === "eur")?.title ?? "EUR accounts"

const IFRAME_SANDBOX =
  "allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-top-navigation-by-user-activation"

type Props = {
  onClose: () => void
}

export function BridgeHostedSetup({ onClose }: Props) {
  const [hostedUrl, setHostedUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [frameReady, setFrameReady] = useState(false)
  const finishedRef = useRef(false)

  const iframeSrc = useMemo(() => {
    if (!hostedUrl) return null
    const origin = typeof window === "undefined" ? "" : window.location.origin
    return buildBridgeHostedIframeUrl(hostedUrl, origin)
  }, [hostedUrl])

  const loadHosted = useCallback(async () => {
    setError(null)
    setFrameReady(false)
    setHostedUrl(null)
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
      error?: string
    }
    if (!res.ok) throw new Error(json.error || "Could not start verification")
    const hosted = String(json.kyc_link || json.tos_link || "").trim()
    if (!hosted) throw new Error("Could not start verification")
    setHostedUrl(hosted)
  }, [])

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

  const finish = useCallback(() => {
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

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!isHostedVerificationCompleteMessage(event.data)) return
      if (!isBridgeHostedMessageOrigin(event.origin, window.location.origin)) return
      finish()
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [finish])

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <div className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b px-2 py-2 sm:px-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 min-w-[8.5rem] justify-start gap-1 px-2"
          onClick={finish}
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
            title={EUR_TITLE}
            src={iframeSrc}
            className="absolute inset-0 h-full w-full border-0 bg-background"
            allow="camera; microphone"
            sandbox={IFRAME_SANDBOX}
            onLoad={() => setFrameReady(true)}
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
