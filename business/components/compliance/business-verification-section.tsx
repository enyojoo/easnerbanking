"use client"

/**
 * Hosted KYB on the Verification settings tab. Prefer SumSub WebSDK via Grid `kyc_token`.
 * Fall back to iframing `kyc_link` if no token. Full-bleed in-tab — no dialog.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { createSupabaseBrowser } from "@/lib/supabase/browser"
import { syncBusinessGridStatusUntilAccountsReady } from "@/lib/grid/sync-business-grid-status"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { BUSINESS_TIER_LADDER } from "@/lib/compliance-tier-ladder-copy"
import { isGridCompleteUrl } from "@/lib/grid/grid-complete-url"
import { cn } from "@/lib/utils"
import { KybRequiredDocumentsNotice } from "@/components/compliance/kyb-required-documents-notice"
import { GridSumsubWebSdk } from "@/components/compliance/grid-sumsub-websdk"
import { SettingsTabIntro } from "@/components/settings/settings-tab-intro"
import { SettingsCardHeader } from "@/components/settings/settings-card-header"
import { SETTINGS_TAB_COPY, VERIFICATION_SECTION_COPY } from "@/lib/copy/business-ui-copy"
import {
  getNoahRejectionDisplay,
  NOAH_FINAL_REJECTION_USER_MESSAGE,
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
  const [info, setInfo] = useState<string | null>(null)
  const [hostedResumeAvailable, setHostedResumeAvailable] = useState<boolean | null>(() =>
    businessId ? hostedResumeAvailableCache.get(businessId) ?? null : null,
  )
  const probedHostedUrlRef = useRef<string | null>(null)
  const probedHostedTokenRef = useRef<string | null>(null)
  const [hostedOpen, setHostedOpen] = useState(false)
  const [hostedUrl, setHostedUrl] = useState<string | null>(null)
  const [hostedToken, setHostedToken] = useState<string | null>(null)
  const [hostedTierLevel, setHostedTierLevel] = useState<1 | 2 | 3>(1)
  const clearSessionAfterCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const useSumsubSdk = Boolean(hostedToken?.trim())
  const hostedIframeSrc = !useSumsubSdk ? hostedUrl : null

  useEffect(() => {
    return () => {
      if (clearSessionAfterCloseRef.current) clearTimeout(clearSessionAfterCloseRef.current)
    }
  }, [])

  const tier1RejectedForProbe = tier1VerificationStatus === "rejected"
  const tier1UnderReviewForProbe = tier1StatusIsInReview(tier1VerificationStatus)
  const tier1AwaitingReviewForProbe = tier1UnderReviewForProbe && !tier1RejectedForProbe

  useEffect(() => {
    probedHostedUrlRef.current = null
    probedHostedTokenRef.current = null
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
    setHostedResumeAvailable(hostedResumeAvailableCache.get(businessId) ?? null)
    void (async () => {
      try {
        const res = await fetchWithSession("/api/grid/kyc-links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "business" }),
        })
        const json = (await res.json().catch(() => ({}))) as {
          kyc_link?: string | null
          kyc_token?: string | null
        }
        if (cancelled) return
        const link = typeof json.kyc_link === "string" ? json.kyc_link.trim() : ""
        const token = typeof json.kyc_token === "string" ? json.kyc_token.trim() : ""
        probedHostedUrlRef.current = link || null
        probedHostedTokenRef.current = token || null
        const resumable = Boolean(link || token)
        hostedResumeAvailableCache.set(businessId, resumable)
        setHostedResumeAvailable(resumable)
      } catch {
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

  const syncBusinessTier1FromGrid = useCallback(async (): Promise<boolean> => {
    const result = await syncBusinessGridStatusUntilAccountsReady()
    return result.ok
  }, [])

  const closeHostedAndSync = useCallback(() => {
    setHostedOpen(false)
    void syncBusinessTier1FromGrid()
    if (clearSessionAfterCloseRef.current) clearTimeout(clearSessionAfterCloseRef.current)
    clearSessionAfterCloseRef.current = setTimeout(() => {
      setHostedUrl(null)
      setHostedToken(null)
      clearSessionAfterCloseRef.current = null
    }, 280)
  }, [syncBusinessTier1FromGrid])

  useEffect(() => {
    if (!hostedOpen) return
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data as
        | { type?: string; kycCompleted?: boolean; gridHostedComplete?: boolean; noahHostedComplete?: boolean }
        | null
      if (
        data?.type === "kycCompleted" ||
        data?.kycCompleted ||
        data?.gridHostedComplete ||
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
        if (href && isGridCompleteUrl(href)) {
          closeHostedAndSync()
        }
      } catch {
        // Cross-origin until Grid redirects to our ReturnURL.
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
    const probedToken = probedHostedTokenRef.current
    if (probedUrl || probedToken) {
      if (clearSessionAfterCloseRef.current) {
        clearTimeout(clearSessionAfterCloseRef.current)
        clearSessionAfterCloseRef.current = null
      }
      setHostedTierLevel(1)
      setHostedToken(probedToken)
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
      const res = await fetchWithSession("/api/grid/kyc-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "business" }),
      })
      const text = await res.text()
      let json = {} as {
        kyc_link?: string | null
        kyc_token?: string | null
        error?: string
        alreadyOnboarded?: boolean
        kyc_status?: string
        canResubmit?: boolean
      }
      if (text) {
        try {
          json = JSON.parse(text) as { kyc_link?: string; kyc_token?: string; error?: string }
        } catch {
          setError(
            res.status === 431
              ? "Request headers too large. Sign out, sign in again, or clear site data for localhost."
              : "Invalid response from server.",
          )
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
      if (json.alreadyOnboarded || (!json.kyc_link && !json.kyc_token)) {
        void syncBusinessTier1FromGrid()
        if (json.kyc_status === "approved") {
          setError(null)
          setInfo(null)
          return
        }
        if (json.kyc_status === "rejected") {
          setError("Verification was declined. Review the message above or contact support.")
          return
        }
        if (tier1StatusIsInReview(json.kyc_status)) {
          setInfo(
            tier1StatusIsInReview(tier1VerificationStatus) ? null : NOAH_VERIFICATION_IN_REVIEW_COPY,
          )
          return
        }
        setInfo("No additional verification steps are available right now. We'll update your status shortly.")
        return
      }
      if (clearSessionAfterCloseRef.current) {
        clearTimeout(clearSessionAfterCloseRef.current)
        clearSessionAfterCloseRef.current = null
      }
      const link = typeof json.kyc_link === "string" ? json.kyc_link.trim() : ""
      const token = typeof json.kyc_token === "string" ? json.kyc_token.trim() : ""
      setHostedTierLevel(1)
      setHostedToken(token || null)
      setHostedUrl(link || null)
      setHostedOpen(true)
      probedHostedUrlRef.current = link || null
      probedHostedTokenRef.current = token || null
      if (businessId) hostedResumeAvailableCache.set(businessId, true)
      setHostedResumeAvailable(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong.")
    } finally {
      setBusy(null)
    }
  }, [businessId, syncBusinessTier1FromGrid, tier1VerificationStatus])

  if (isLoading && !hasData) {
    return <div className="text-sm text-muted-foreground">Loading verification status…</div>
  }

  const hostedTierMeta = tierLadderCopy(hostedTierLevel)
  const hostedTierTitle = hostedTierMeta?.title ?? `Tier ${hostedTierLevel}`
  const tier1Rejected = tier1VerificationStatus === "rejected"
  const rejectionDisplay = tier1Rejected ? getNoahRejectionDisplay(tier1RejectionReasons) : null
  const tier1FinalReject = tier1RejectionType === "Final" || rejectionDisplay?.isFinal === true
  const tier1UnderReview = tier1StatusIsInReview(tier1VerificationStatus)
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

  if (hostedOpen && (hostedToken || hostedUrl)) {
    return (
      <div className="flex min-h-[min(70vh,40rem)] flex-col overflow-hidden rounded-lg border bg-[#1a1a1a]" id="business-verification">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 bg-[#1a1a1a] px-4 py-3 sm:px-6">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold leading-snug text-white sm:text-lg">
                Business verification for {hostedTierTitle}
              </h2>
              <Badge variant="outline" className="shrink-0 border-white/20 text-xs text-white/90">
                Tier {hostedTierLevel}
              </Badge>
            </div>
            <p className="text-sm text-white/70">Close when finished.</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 text-white hover:bg-white/10 hover:text-white"
            onClick={closeHostedAndSync}
            aria-label="Close verification"
          >
            <X className="size-5" />
          </Button>
        </div>
        <div className="relative min-h-0 flex-1">
          {error ? (
            <p className="absolute left-4 right-4 top-2 z-10 rounded-md bg-destructive/90 px-3 py-2 text-sm text-destructive-foreground">
              {error}
            </p>
          ) : null}
          {useSumsubSdk && hostedToken ? (
            <GridSumsubWebSdk
              accessToken={hostedToken}
              onComplete={closeHostedAndSync}
              onError={(message) => setError(message)}
            />
          ) : hostedIframeSrc ? (
            <iframe
              title={`Business verification for ${hostedTierTitle} (Tier ${hostedTierLevel})`}
              src={hostedIframeSrc}
              className="absolute inset-0 size-full border-0"
              allow="camera *; microphone *; payment *; publickey-credentials-get *; clipboard-read *; clipboard-write *"
              onLoad={handleHostedIframeLoad}
            />
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6" id="business-verification">
      <SettingsTabIntro
        title={SETTINGS_TAB_COPY.verification.title}
        description={SETTINGS_TAB_COPY.verification.intro}
      />

      <div className="space-y-3">
        <SettingsCardHeader title="Compliance tiers" description={VERIFICATION_SECTION_COPY.complianceTiers} />
        <div className="grid gap-4 md:grid-cols-2">
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
                <CardDescription className="text-sm">{t.description}</CardDescription>
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
                    <p className="text-sm text-muted-foreground">{NOAH_FINAL_REJECTION_USER_MESSAGE}</p>
                  ) : tier1Rejected && (tier1RetryGuidance?.length || rejectionDisplay?.guidanceLines.length) ? (
                    <p className="text-sm text-destructive">
                      {(tier1RetryGuidance ?? rejectionDisplay?.guidanceLines ?? []).join(" ")}
                    </p>
                  ) : tier1Rejected ? (
                    <p className="text-sm text-destructive">
                      Verification was declined. Review your documents and try again.
                    </p>
                  ) : null}
                  {!businessId ? (
                    <p className="text-xs text-muted-foreground">Setting up your organization…</p>
                  ) : null}
                  {!canManageBusinessVerification ? (
                    <p className="text-sm text-muted-foreground">
                      Only the organization owner can start verification.
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
      </div>
    </div>
  )
}
