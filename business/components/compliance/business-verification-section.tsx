"use client"

/**
 * Hosted KYB opens in a dialog iframe. Users close via the dialog’s built-in control.
 *
 * B2B parity: uses the same `/api/noah/kyc-links` + Easner context headers as consumer flows;
 * Tier state is driven by org `noah_kyb_status` via `useBusinessProfile` (see `/api/business/profile`).
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { createSupabaseBrowser } from "@/lib/supabase/browser"
import { syncBusinessNoahStatus } from "@/lib/noah/sync-business-noah-status"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { BUSINESS_TIER_LADDER } from "@/lib/compliance-tier-ladder-copy"
import { buildNoahHostedIframeUrl } from "@/lib/noah/hosted-iframe-url"
import { isNoahCompleteUrl } from "@/lib/noah/noah-complete-url"
import { cn } from "@/lib/utils"
import { KybRequiredDocumentsNotice } from "@/components/compliance/kyb-required-documents-notice"
import {
  getNoahRejectionDisplay,
  NOAH_VERIFICATION_IN_REVIEW_COPY,
} from "@/lib/noah/rejection-reasons"

function formatTier1Status(status: string | null): string {
  if (!status) return "Not started"
  const s = status.replace(/_/g, " ")
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function tier1StatusIsInReview(status: string | null | undefined): boolean {
  const s = (status || "").toLowerCase()
  return s === "pending" || s === "in_review" || s === "under_review" || s.includes("review")
}

/**
 * Last-known "can resume hosted session" result per business, kept at module scope so it survives
 * remounts (e.g. leaving Settings and returning, or switching tabs). This lets the in-review CTA
 * render immediately from the cached value instead of flashing while the probe re-runs in the
 * background — the visibility/label is resolved before the user sees the page.
 */
const hostedResumeAvailableCache = new Map<string, boolean>()

function tierLadderCopy(tier: 1 | 2 | 3) {
  return BUSINESS_TIER_LADDER.tiers.find((x) => x.tier === tier)
}

export function BusinessVerificationSection() {
  const {
    tier1Complete,
    tier1VerificationStatus,
    tier1RejectionReasons,
    tier1RejectionType,
    tier1RetryGuidance,
    canManageBusinessVerification,
    isLoading,
    hasData,
    businessId,
    noahKybCustomerId,
  } = useBusinessProfile()

  const [busy, setBusy] = useState<null | "link">(null)
  const [error, setError] = useState<string | null>(null)
  /** Neutral (non-error) notice, e.g. when KYB is already submitted and under review. */
  const [info, setInfo] = useState<string | null>(null)
  /** When in review, probe whether Noah still exposes a resumable hosted URL. Seed from the module
   *  cache so the CTA does not flash on remount while the probe revalidates in the background. */
  const [hostedResumeAvailable, setHostedResumeAvailable] = useState<boolean | null>(() =>
    businessId ? hostedResumeAvailableCache.get(businessId) ?? null : null,
  )
  const probedHostedUrlRef = useRef<string | null>(null)
  const [hostedOpen, setHostedOpen] = useState(false)
  const [hostedUrl, setHostedUrl] = useState<string | null>(null)
  /** Which tier the hosted iframe session is for (only Tier 1 today; same header pattern for future tiers). */
  const [hostedTierLevel, setHostedTierLevel] = useState<1 | 2 | 3>(1)
  /** Clear iframe after Radix exit animation so the dialog can close smoothly (iframe unmount is heavy). */
  const clearUrlAfterCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hostedIframeSrc =
    hostedUrl && typeof window !== "undefined"
      ? buildNoahHostedIframeUrl(hostedUrl, window.location.origin)
      : hostedUrl

  useEffect(() => {
    return () => {
      if (clearUrlAfterCloseRef.current) clearTimeout(clearUrlAfterCloseRef.current)
    }
  }, [])

  const tier1RejectedForProbe = tier1VerificationStatus === "rejected"
  const tier1UnderReviewForProbe = tier1StatusIsInReview(tier1VerificationStatus)
  const tier1AwaitingReviewForProbe = tier1UnderReviewForProbe && !tier1RejectedForProbe

  useEffect(() => {
    probedHostedUrlRef.current = null
    if (
      !canManageBusinessVerification ||
      !businessId ||
      tier1Complete ||
      !tier1AwaitingReviewForProbe
    ) {
      setHostedResumeAvailable(null)
      return
    }

    let cancelled = false
    // Keep the last-known value (from a prior probe) while revalidating so the CTA stays stable.
    setHostedResumeAvailable(hostedResumeAvailableCache.get(businessId) ?? null)
    void (async () => {
      try {
        const res = await fetchWithSession("/api/noah/kyc-links", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Easner-Noah-Scope": "business",
          },
          body: JSON.stringify({ type: "business" }),
        })
        const json = (await res.json().catch(() => ({}))) as { kyc_link?: string | null }
        if (cancelled) return
        const link = typeof json.kyc_link === "string" ? json.kyc_link.trim() : ""
        probedHostedUrlRef.current = link || null
        hostedResumeAvailableCache.set(businessId, Boolean(link))
        setHostedResumeAvailable(Boolean(link))
      } catch {
        // Preserve any cached value on transient network failure rather than hiding the CTA.
        if (!cancelled) setHostedResumeAvailable(hostedResumeAvailableCache.get(businessId) ?? false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    businessId,
    canManageBusinessVerification,
    tier1Complete,
    tier1AwaitingReviewForProbe,
  ])

  const syncBusinessTier1FromNoah = useCallback(async (): Promise<boolean> => {
    const result = await syncBusinessNoahStatus()
    return result.ok
  }, [])

  const closeHostedAndSync = useCallback(() => {
    setHostedOpen(false)
    void syncBusinessTier1FromNoah()
    if (clearUrlAfterCloseRef.current) clearTimeout(clearUrlAfterCloseRef.current)
    clearUrlAfterCloseRef.current = setTimeout(() => {
      setHostedUrl(null)
      clearUrlAfterCloseRef.current = null
    }, 280)
  }, [syncBusinessTier1FromNoah])

  useEffect(() => {
    if (!hostedOpen) return
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data as
        | { type?: string; kycCompleted?: boolean; noahHostedComplete?: boolean }
        | null
      if (
        data?.type === "kycCompleted" ||
        data?.kycCompleted ||
        data?.noahHostedComplete
      ) {
        closeHostedAndSync()
      }
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [hostedOpen, closeHostedAndSync])

  const handleHostedIframeLoad = useCallback(
    (event: React.SyntheticEvent<HTMLIFrameElement>) => {
      try {
        const href = event.currentTarget.contentWindow?.location?.href
        if (href && isNoahCompleteUrl(href)) {
          closeHostedAndSync()
        }
      } catch {
        // Cross-origin until Noah redirects to our ReturnURL.
      }
    },
    [closeHostedAndSync],
  )

  const openHostedVerification = useCallback(async () => {
    setError(null)
    setInfo(null)
    if (!businessId) {
      setInfo("Your organization is still being set up. Refresh and try again in a moment.")
      return
    }

    const probedUrl = probedHostedUrlRef.current
    if (probedUrl) {
      if (clearUrlAfterCloseRef.current) {
        clearTimeout(clearUrlAfterCloseRef.current)
        clearUrlAfterCloseRef.current = null
      }
      setHostedTierLevel(1)
      setHostedUrl(probedUrl)
      setHostedOpen(true)
      return
    }

    setBusy("link")
    try {
      const supabase = createSupabaseBrowser()
      const { data } = await supabase.auth.getSession()
      if (!data.session) {
        setError("You need to be signed in.")
        return
      }
      const res = await fetchWithSession("/api/noah/kyc-links", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Easner-Noah-Scope": "business",
        },
        body: JSON.stringify({ type: "business" }),
      })
      const text = await res.text()
      let json = {} as {
        kyc_link?: string | null
        error?: string
        alreadyOnboarded?: boolean
        kyc_status?: string
        canResubmit?: boolean
      }
      if (text) {
        try {
          json = JSON.parse(text) as { kyc_link?: string; error?: string }
        } catch {
          setError(res.status === 431 ? "Request headers too large. Sign out, sign in again, or clear site data for localhost." : "Invalid response from server.")
          return
        }
      }
      if (res.status === 431) {
        setError(
          json.error ??
            "Session data is too large (often from a profile image stored in your account). Sign out and sign in again, or visit Personal settings after we refresh your session.",
        )
        return
      }
      if (!res.ok) {
        setError(json.error ?? "Could not start verification.")
        return
      }
      if (json.canResubmit === false) {
        setError(null)
        setInfo("Verification could not be completed for this account. Please contact support if you have questions.")
        return
      }
      if (json.alreadyOnboarded || !json.kyc_link) {
        void syncBusinessTier1FromNoah()
        if (json.kyc_status === "approved") {
          setError(null)
          setInfo(null)
          return
        }
        if (json.kyc_status === "rejected") {
          setError("Verification was declined. Review the message above or contact support.")
          return
        }
        // Submitted with no resumable hosted session — show in-review once (card may already show it).
        if (tier1StatusIsInReview(json.kyc_status)) {
          setInfo(tier1StatusIsInReview(tier1VerificationStatus) ? null : NOAH_VERIFICATION_IN_REVIEW_COPY)
          return
        }
        setInfo("No additional verification steps are available right now. We'll update your status shortly.")
        return
      }
      if (clearUrlAfterCloseRef.current) {
        clearTimeout(clearUrlAfterCloseRef.current)
        clearUrlAfterCloseRef.current = null
      }
      setHostedTierLevel(1)
      setHostedUrl(json.kyc_link)
      setHostedOpen(true)
      probedHostedUrlRef.current = json.kyc_link
      if (businessId) hostedResumeAvailableCache.set(businessId, true)
      setHostedResumeAvailable(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong.")
    } finally {
      setBusy(null)
    }
  }, [businessId, syncBusinessTier1FromNoah, tier1VerificationStatus])

  // Only show the loading placeholder on a genuine cold load. When cached profile data exists
  // (e.g. returning to Settings), render the real section immediately so the CTA does not flash.
  if (isLoading && !hasData) {
    return <div className="text-sm text-muted-foreground">Loading verification status…</div>
  }

  const hostedTierMeta = tierLadderCopy(hostedTierLevel)
  const hostedTierTitle = hostedTierMeta?.title ?? `Tier ${hostedTierLevel}`
  const tier1Rejected = tier1VerificationStatus === "rejected"
  const rejectionDisplay = tier1Rejected ? getNoahRejectionDisplay(tier1RejectionReasons) : null
  const tier1FinalReject = tier1RejectionType === "Final" || rejectionDisplay?.isFinal === true
  const tier1UnderReview = tier1StatusIsInReview(tier1VerificationStatus)
  /** Submitted to Noah — nothing for the business to do until review completes. */
  const tier1AwaitingReview = tier1UnderReview && !tier1Rejected
  const tier1StartedNotSubmitted =
    !tier1Rejected && !tier1AwaitingReview && Boolean(noahKybCustomerId?.trim())
  const showTier1HostedCta =
    canManageBusinessVerification &&
    !tier1Complete &&
    !tier1FinalReject &&
    (!tier1AwaitingReview || hostedResumeAvailable === true)
  const tier1HostedCtaLabel = tier1Rejected
    ? "Retry verification"
    : tier1StartedNotSubmitted || hostedResumeAvailable === true
      ? "Continue verification"
      : "Begin verification"
  const tier1HostedCtaBusy = busy === "link" || (tier1AwaitingReview && hostedResumeAvailable === null)

  return (
    <div className="space-y-6" id="business-verification">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Compliance & verification</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tier 1 unlocks global banking for your organization once business verification is approved.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {BUSINESS_TIER_LADDER.tiers.map((t) => {
          const isT1 = t.tier === 1
          return (
            <Card
              key={t.tier}
              className={cn(isT1 && "border-primary/25 md:border-primary/40")}
            >
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">{t.title}</CardTitle>
                  <Badge variant="outline" className="text-xs">
                    Tier {t.tier}
                  </Badge>
                  {isT1 && tier1Complete ? (
                    <Badge className="border-transparent bg-success text-success-foreground hover:bg-success">
                      Approved
                    </Badge>
                  ) : isT1 ? (
                    <Badge variant="secondary">{formatTier1Status(tier1VerificationStatus)}</Badge>
                  ) : (
                    <Badge variant="secondary">Coming later</Badge>
                  )}
                </div>
                <CardDescription className="text-sm text-foreground/85">{t.description}</CardDescription>
                {t.footnote ? (
                  <p className="text-xs text-muted-foreground pt-1">{t.footnote}</p>
                ) : null}
              </CardHeader>
              {isT1 ? (
                <CardContent className="space-y-4 pt-0">
                  {error ? <p className="text-sm text-destructive">{error}</p> : null}
                  {info ? <p className="text-sm text-muted-foreground">{info}</p> : null}
                  {tier1UnderReview && !tier1Rejected ? (
                    <p className="text-sm text-muted-foreground">{NOAH_VERIFICATION_IN_REVIEW_COPY}</p>
                  ) : null}
                  {tier1Rejected && tier1FinalReject ? (
                    <p className="text-sm text-muted-foreground">
                      Verification could not be completed for this account. Please contact support if you have
                      questions.
                    </p>
                  ) : tier1Rejected && (tier1RetryGuidance?.length || rejectionDisplay?.guidanceLines.length) ? (
                    <p className="text-sm text-destructive">
                      Verification needs attention: {(tier1RetryGuidance ?? rejectionDisplay?.guidanceLines ?? []).join(" ")}
                    </p>
                  ) : tier1Rejected ? (
                    <p className="text-sm text-destructive">
                      Verification was declined. Review your documents and try again, or contact support if you need
                      help.
                    </p>
                  ) : null}
                  {!businessId ? (
                    <p className="text-xs text-muted-foreground">
                      Finishing organization setup… refresh in a moment if this persists.
                    </p>
                  ) : null}
                  {!canManageBusinessVerification ? (
                    <p className="text-sm text-muted-foreground">
                      Only an organization owner can start hosted business verification. Ask an owner to complete
                      verification.
                    </p>
                  ) : null}
                  {canManageBusinessVerification && !tier1Complete && !tier1FinalReject && !tier1AwaitingReview ? (
                    <KybRequiredDocumentsNotice />
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {showTier1HostedCta ? (
                      <Button
                        size="sm"
                        onClick={() => void openHostedVerification()}
                        disabled={tier1HostedCtaBusy || !businessId}
                      >
                        {tier1HostedCtaBusy ? "Opening…" : tier1HostedCtaLabel}
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              ) : null}
            </Card>
          )
        })}
      </div>

      <Dialog
        open={hostedOpen}
        onOpenChange={(open) => {
          if (open) {
            if (clearUrlAfterCloseRef.current) {
              clearTimeout(clearUrlAfterCloseRef.current)
              clearUrlAfterCloseRef.current = null
            }
            setHostedOpen(true)
            return
          }
          setHostedOpen(false)
          void syncBusinessTier1FromNoah()
          if (clearUrlAfterCloseRef.current) clearTimeout(clearUrlAfterCloseRef.current)
          clearUrlAfterCloseRef.current = setTimeout(() => {
            setHostedUrl(null)
            clearUrlAfterCloseRef.current = null
          }, 280)
        }}
      >
        <DialogContent
          showCloseButton
          className="flex h-[min(92vh,44rem)] w-[min(calc(100vw-1.5rem),56rem)] max-w-none flex-col gap-0 overflow-hidden p-0 duration-300 data-[state=open]:duration-300 data-[state=closed]:duration-300 sm:max-w-[min(calc(100vw-1.5rem),56rem)]"
        >
          <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12">
            <div className="flex flex-wrap items-center gap-2 gap-y-1">
              <DialogTitle className="text-left text-base leading-snug sm:text-lg">
                Business verification for {hostedTierTitle}
              </DialogTitle>
              <Badge variant="outline" className="shrink-0 text-xs">
                Tier {hostedTierLevel}
              </Badge>
            </div>
            <DialogDescription className="pt-1">
              Complete the steps in the provider window below.
            </DialogDescription>
          </DialogHeader>
          {hostedIframeSrc ? (
            <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
              <iframe
                title={`Business verification for ${hostedTierTitle} (Tier ${hostedTierLevel})`}
                src={hostedIframeSrc}
                className="absolute inset-0 size-full border-0"
                allow="payment *; publickey-credentials-get *; clipboard-read *; clipboard-write *"
                onLoad={handleHostedIframeLoad}
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
