"use client"

/**
 * Hosted KYB on the Verification settings tab. Prefer SumSub WebSDK via Grid `kyc_token`.
 * Fall back to iframing `kyc_link` if no token. One section card holds the hub;
 * CTA opens full-page flow (`?flow=hosted`); Back restores the tabbed hub.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react"
import { syncBusinessGridStatusUntilAccountsReady } from "@/lib/grid/sync-business-grid-status"
import { useBusinessProfile } from "@/lib/use-business-profile"
import {
  hostedCredentialsAreReady,
  preloadSumsubWebSdk,
  primeHostedVerificationCredentials,
  readHostedCredentialsCache,
  readHostedResumeAvailable,
  writeHostedCredentialsCache,
} from "@/lib/compliance/hosted-verification-credentials"
import { primeBusinessVerificationFlow } from "@/lib/compliance/prime-business-verification-flow"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { BUSINESS_TIER_LADDER } from "@/lib/compliance-tier-ladder-copy"
import { isGridCompleteUrl } from "@/lib/grid/grid-complete-url"
import { cn } from "@/lib/utils"
import dynamic from "next/dynamic"
import { KybRequiredDocumentsNotice } from "@/components/compliance/kyb-required-documents-notice"
import { Tier1VerificationBadge } from "@/components/compliance/tier1-verification-badge"
import { SettingsCardHeader } from "@/components/settings/settings-card-header"
import { SettingsStripeConnectPanel } from "@/components/settings/settings-stripe-connect-panel"
import { SETTINGS_TAB_COPY, VERIFICATION_SECTION_COPY } from "@/lib/copy/business-ui-copy"
import {
  getVerificationRejectionDisplay,
  NOAH_FINAL_REJECTION_USER_MESSAGE,
  NOAH_VERIFICATION_IN_REVIEW_COPY,
} from "@easner/shared"
import { SETTINGS_VERIFICATION_FLOW_PARAM } from "@/lib/compliance/cutover-comms"
import { useSuspendIdleLock } from "@/hooks/use-suspend-idle-lock"

function OpeningVerificationWait() {
  return (
    <div className="flex size-full min-h-[16rem] items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-center text-muted-foreground">
        <Loader2 className="size-8 animate-spin" aria-hidden />
        <p className="text-sm">Please wait, Opening Verification</p>
      </div>
    </div>
  )
}

const GridSumsubWebSdk = dynamic(
  () => import("@/components/compliance/grid-sumsub-websdk").then((m) => ({ default: m.GridSumsubWebSdk })),
  { ssr: false, loading: () => <OpeningVerificationWait /> },
)

function tier1StatusIsInReview(status: string | null | undefined): boolean {
  const s = (status || "").toLowerCase()
  if (s === "in_progress") return false
  return s === "pending" || s === "in_review" || s === "under_review" || s.includes("review")
}

function tierLadderCopy(tier: 1 | 2 | 3) {
  return BUSINESS_TIER_LADDER.tiers.find((x) => x.tier === tier)
}

type BusinessVerificationSectionProps = {
  /** Settings hides title/tabs when the hosted KYB flow is active. */
  fullPageFlow?: boolean
  onFlowOpenChange?: (open: boolean) => void
}

export function BusinessVerificationSection({
  fullPageFlow = false,
  onFlowOpenChange,
}: BusinessVerificationSectionProps) {
  const searchParams = useSearchParams()
  const flowFromUrl = searchParams.get("flow") === SETTINGS_VERIFICATION_FLOW_PARAM
  const {
    tier1Complete,
    tier1VerificationStatus,
    tier1RejectionReasons,
    tier1RejectionType,
    tier1CanResubmit,
    tier1RetryGuidance,
    canManageBusinessVerification,
    isLoading,
    hasData,
    businessId,
    noahKybCustomerId,
    invoiceSettings,
  } = useBusinessProfile()

  const showOnlinePayments = invoiceSettings?.showOnlinePayment !== false

  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [hostedResumeAvailable, setHostedResumeAvailable] = useState<boolean | null>(() =>
    readHostedResumeAvailable(businessId),
  )
  const probedHostedUrlRef = useRef<string | null>(null)
  const probedHostedTokenRef = useRef<string | null>(null)
  const [hostedOpen, setHostedOpen] = useState(false)
  const [hostedUrl, setHostedUrl] = useState<string | null>(null)
  const [hostedToken, setHostedToken] = useState<string | null>(null)
  const [hostedTierLevel, setHostedTierLevel] = useState<1 | 2 | 3>(1)
  const [openingVerification, setOpeningVerification] = useState(false)
  const clearSessionAfterCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flowAutoOpenRef = useRef(false)

  const useSumsubSdk = Boolean(hostedToken?.trim())
  const hostedIframeSrc = !useSumsubSdk ? hostedUrl : null
  const hostedFlowActive = fullPageFlow || flowFromUrl || hostedOpen

  // SumSub runs in a cross-origin iframe; parent window does not receive pointer/keyboard events.
  useSuspendIdleLock(hostedFlowActive)

  const pushVerificationFlowUrl = useCallback(() => {
    onFlowOpenChange?.(true)
    const next = new URLSearchParams(searchParams.toString())
    next.set("tab", "verification")
    next.set("flow", SETTINGS_VERIFICATION_FLOW_PARAM)
    window.history.replaceState(null, "", `/settings?${next.toString()}`)
  }, [onFlowOpenChange, searchParams])

  const clearVerificationFlowUrl = useCallback(() => {
    onFlowOpenChange?.(false)
    const next = new URLSearchParams(searchParams.toString())
    next.set("tab", "verification")
    next.delete("flow")
    window.history.replaceState(null, "", `/settings?${next.toString()}`)
  }, [onFlowOpenChange, searchParams])

  useEffect(() => {
    return () => {
      if (clearSessionAfterCloseRef.current) clearTimeout(clearSessionAfterCloseRef.current)
    }
  }, [])

  useEffect(() => {
    if (hostedFlowActive) {
      document.documentElement.dataset.verificationFlowOpen = "true"
      document.querySelector("main")?.scrollTo({ top: 0 })
    } else {
      delete document.documentElement.dataset.verificationFlowOpen
    }
    return () => {
      delete document.documentElement.dataset.verificationFlowOpen
    }
  }, [hostedFlowActive])

  const tier1RejectedForProbe = tier1VerificationStatus === "rejected"
  const tier1UnderReviewForProbe = tier1StatusIsInReview(tier1VerificationStatus)
  const tier1AwaitingReviewForProbe = tier1UnderReviewForProbe && !tier1RejectedForProbe
  const tier1FinalRejectForPrefetch = tier1RejectedForProbe && !tier1CanResubmit

  const syncCredentialsFromCache = useCallback(
    (id: string) => {
      const cached = readHostedCredentialsCache(id)
      probedHostedUrlRef.current = cached.link
      probedHostedTokenRef.current = cached.token
      setHostedUrl(cached.link)
      setHostedToken(cached.token)
      if (hostedCredentialsAreReady(cached)) {
        setHostedResumeAvailable(true)
      }
      return cached
    },
    [],
  )

  const primeHostedCredentials = useCallback(async () => {
    if (
      !businessId ||
      !canManageBusinessVerification ||
      tier1Complete ||
      tier1FinalRejectForPrefetch ||
      tier1AwaitingReviewForProbe
    ) {
      return readHostedCredentialsCache(businessId)
    }
    try {
      const { link, token } = await primeHostedVerificationCredentials({ businessId })
      probedHostedUrlRef.current = link
      probedHostedTokenRef.current = token
      const credentials = { link, token }
      const ready = hostedCredentialsAreReady(credentials)
      setHostedResumeAvailable(ready || readHostedResumeAvailable(businessId) === true)
      if (!hostedOpen) {
        setHostedUrl(link)
        setHostedToken(token)
      }
      return credentials
    } catch {
      if (businessId) {
        setHostedResumeAvailable(readHostedResumeAvailable(businessId) ?? false)
      }
      return readHostedCredentialsCache(businessId)
    }
  }, [
    businessId,
    canManageBusinessVerification,
    hostedOpen,
    tier1Complete,
    tier1FinalRejectForPrefetch,
    tier1AwaitingReviewForProbe,
  ])

  useEffect(() => {
    if (
      !businessId ||
      !canManageBusinessVerification ||
      tier1Complete ||
      tier1FinalRejectForPrefetch ||
      tier1AwaitingReviewForProbe
    ) {
      probedHostedUrlRef.current = null
      probedHostedTokenRef.current = null
      setHostedResumeAvailable(null)
      return
    }
    const cached = syncCredentialsFromCache(businessId)
    primeBusinessVerificationFlow({
      businessId,
      canManageBusinessVerification,
      tier1Complete,
      tier1CanResubmit,
    })
    if (hostedCredentialsAreReady(cached)) {
      return
    }
    setHostedResumeAvailable(readHostedResumeAvailable(businessId))
  }, [
    businessId,
    canManageBusinessVerification,
    syncCredentialsFromCache,
    tier1CanResubmit,
    tier1Complete,
    tier1FinalRejectForPrefetch,
    tier1AwaitingReviewForProbe,
  ])

  const applyHostedCredentials = useCallback(
    (link: string | null, token: string | null) => {
      if (clearSessionAfterCloseRef.current) {
        clearTimeout(clearSessionAfterCloseRef.current)
        clearSessionAfterCloseRef.current = null
      }
      setHostedTierLevel(1)
      setHostedToken(token)
      setHostedUrl(link)
      probedHostedUrlRef.current = link
      probedHostedTokenRef.current = token
      if (businessId) {
        writeHostedCredentialsCache(businessId, { link, token })
        setHostedResumeAvailable(hostedCredentialsAreReady({ link, token }))
      }
    },
    [businessId],
  )

  const syncBusinessTier1FromGrid = useCallback(async (): Promise<boolean> => {
    const result = await syncBusinessGridStatusUntilAccountsReady()
    return result.ok
  }, [])

  const closeHostedAndSync = useCallback(() => {
    setHostedOpen(false)
    setOpeningVerification(false)
    clearVerificationFlowUrl()
    void syncBusinessTier1FromGrid()
    if (clearSessionAfterCloseRef.current) clearTimeout(clearSessionAfterCloseRef.current)
    clearSessionAfterCloseRef.current = setTimeout(() => {
      setHostedUrl(null)
      setHostedToken(null)
      clearSessionAfterCloseRef.current = null
    }, 280)
  }, [clearVerificationFlowUrl, syncBusinessTier1FromGrid])

  const abortHostedVerification = useCallback(() => {
    setHostedOpen(false)
    setOpeningVerification(false)
    clearVerificationFlowUrl()
  }, [clearVerificationFlowUrl])

  useEffect(() => {
    if (!hostedFlowActive) return
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
  }, [hostedFlowActive, closeHostedAndSync])

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

    const resolveCachedCredentials = () => {
      const fromRefs = {
        link: probedHostedUrlRef.current ?? hostedUrl,
        token: probedHostedTokenRef.current ?? hostedToken,
      }
      if (hostedCredentialsAreReady(fromRefs)) return fromRefs
      const cached = readHostedCredentialsCache(businessId)
      if (hostedCredentialsAreReady(cached)) return cached
      return null
    }

    const beginHostedFlow = () => {
      preloadSumsubWebSdk()
      setHostedOpen(true)
      setHostedTierLevel(1)
      pushVerificationFlowUrl()
    }

    const cachedReady = resolveCachedCredentials()
    if (cachedReady) {
      applyHostedCredentials(cachedReady.link, cachedReady.token)
      setOpeningVerification(false)
      beginHostedFlow()
      return
    }

    setOpeningVerification(true)
    beginHostedFlow()

    try {
      const { link, token, json, res } = await primeHostedVerificationCredentials({ businessId })

      if (res.status === 431) {
        abortHostedVerification()
        setError(
          json.error ??
            "Session data is too large (often from a profile image stored in your account). Sign out and sign in again, or visit Personal settings after we refresh your session.",
        )
        return
      }
      if (!res.ok) {
        abortHostedVerification()
        if (json.kyc_status === "not_started") {
          setError(json.error ?? "Your previous verification session expired. Start verification again.")
          return
        }
        setError(json.error ?? "Could not start verification.")
        return
      }
      if (json.canResubmit === false) {
        abortHostedVerification()
        setInfo("Verification could not be completed for this account. Please contact support if you have questions.")
        return
      }
      if (json.alreadyOnboarded || (!link && !token)) {
        void syncBusinessTier1FromGrid()
        abortHostedVerification()
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

      applyHostedCredentials(link, token)
      setOpeningVerification(false)
    } catch (e: unknown) {
      abortHostedVerification()
      setError(e instanceof Error ? e.message : "Something went wrong.")
    }
  }, [
    abortHostedVerification,
    applyHostedCredentials,
    businessId,
    hostedToken,
    hostedUrl,
    pushVerificationFlowUrl,
    syncBusinessTier1FromGrid,
    tier1VerificationStatus,
  ])

  useEffect(() => {
    if (!flowFromUrl) {
      flowAutoOpenRef.current = false
      return
    }
    if (flowAutoOpenRef.current || hostedOpen) return
    flowAutoOpenRef.current = true
    void openHostedVerification()
  }, [flowFromUrl, hostedOpen, openHostedVerification])

  useEffect(() => {
    // replaceState updates the URL without refreshing useSearchParams. Parent
    // `fullPageFlow` is the source of truth after CTA click — do not wipe the
    // SumSub token just because `flowFromUrl` is still stale.
    if (fullPageFlow || flowFromUrl || !hostedOpen) return
    setHostedOpen(false)
    setOpeningVerification(false)
    if (clearSessionAfterCloseRef.current) clearTimeout(clearSessionAfterCloseRef.current)
    clearSessionAfterCloseRef.current = setTimeout(() => {
      setHostedUrl(null)
      setHostedToken(null)
      clearSessionAfterCloseRef.current = null
    }, 280)
  }, [fullPageFlow, flowFromUrl, hostedOpen])

  if (isLoading && !hasData) {
    return <div className="text-sm text-muted-foreground">Loading verification status…</div>
  }

  const hostedTierMeta = tierLadderCopy(hostedTierLevel)
  const hostedTierTitle = hostedTierMeta?.title ?? `Tier ${hostedTierLevel}`
  const tier1Rejected = tier1VerificationStatus === "rejected"
  const tier1OnHold = tier1VerificationStatus === "hold"
  const tier1ActionRequired = tier1Rejected || tier1OnHold
  const rejectionDisplay =
    tier1ActionRequired ? getVerificationRejectionDisplay(tier1RejectionReasons) : null
  const tier1FinalReject = tier1RejectionType === "Final" || rejectionDisplay?.isFinal === true
  const tier1UnderReview = tier1StatusIsInReview(tier1VerificationStatus)
  const tier1InProgress = tier1VerificationStatus === "in_progress"
  const tier1AwaitingReview = tier1UnderReview && !tier1Rejected
  const hasGridCustomer = Boolean(noahKybCustomerId?.trim())
  const tier1StartedNotSubmitted =
    !tier1Rejected &&
    !tier1AwaitingReview &&
    (tier1InProgress || (tier1VerificationStatus === "not_started" && hasGridCustomer))
  const showTier1HostedCta =
    canManageBusinessVerification &&
    !tier1Complete &&
    tier1CanResubmit &&
    !tier1AwaitingReview &&
    (!tier1OnHold || tier1CanResubmit)
  const tier1HostedCtaLabel =
    tier1Rejected
      ? "Retry verification"
      : tier1OnHold
        ? "Continue verification"
        : tier1StartedNotSubmitted || hostedResumeAvailable === true
          ? "Continue verification"
          : "Begin verification"

  /** Full-page flow uses the settings content area; in-tab fallback keeps title/tabs chrome. */
  const verificationFlowPanelClass = hostedFlowActive
    ? "h-[calc(100dvh-var(--dashboard-sticky-top,4rem)-2.5rem)] max-h-[calc(100dvh-var(--dashboard-sticky-top,4rem)-2.5rem)]"
    : "h-[calc(100dvh-var(--dashboard-sticky-top,4rem)-var(--verification-settings-chrome,14rem))] max-h-[calc(100dvh-var(--dashboard-sticky-top,4rem)-var(--verification-settings-chrome,14rem))]"

  const hostedFlowPanel = (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="absolute left-2 top-2 z-20 h-8 gap-1 bg-background/90 px-2 shadow-sm backdrop-blur-sm hover:bg-background"
        onClick={closeHostedAndSync}
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back
      </Button>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {error ? (
          <p className="absolute left-0 right-0 top-2 z-10 mx-auto max-w-lg rounded-md bg-destructive/90 px-3 py-2 text-center text-sm text-destructive-foreground">
            {error}
          </p>
        ) : null}
        {useSumsubSdk && hostedToken ? (
          <GridSumsubWebSdk
            accessToken={hostedToken}
            theme="light"
            onComplete={closeHostedAndSync}
            onReady={() => {
              setOpeningVerification(false)
            }}
            onError={(message) => {
              setOpeningVerification(false)
              setError(message)
            }}
          />
        ) : hostedIframeSrc ? (
          <iframe
            title={`Business verification for ${hostedTierTitle} (Tier ${hostedTierLevel})`}
            src={hostedIframeSrc}
            className="absolute inset-0 size-full border-0 bg-background"
            allow="camera *; microphone *; payment *; publickey-credentials-get *; clipboard-read *; clipboard-write *"
            onLoad={handleHostedIframeLoad}
          />
        ) : (
          <OpeningVerificationWait />
        )}
      </div>
    </div>
  )

  if (hostedFlowActive) {
    return (
      <div
        id="business-verification"
        className={verificationFlowPanelClass}
        data-verification-flow="open"
      >
        {hostedFlowPanel}
      </div>
    )
  }

  return (
    <div className="space-y-6" id="business-verification">
      <Card>
        <CardHeader>
              <SettingsCardHeader
                title={
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5" aria-hidden />
                    {SETTINGS_TAB_COPY.verification.title}
                  </CardTitle>
                }
                description={SETTINGS_TAB_COPY.verification.intro}
              />
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                {BUSINESS_TIER_LADDER.tiers.map((t) => {
                  const isT1 = t.tier === 1
                  const isT3 = t.tier === 3

                  const comingLaterCard = (
                    <Card
                      key={t.tier}
                      className={cn(
                        "flex h-full flex-col",
                        isT1 && "border-primary/25 md:border-primary/40",
                      )}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <CardTitle className="text-base">{t.title}</CardTitle>
                          {isT1 ? (
                            <Tier1VerificationBadge
                              tier1Complete={tier1Complete}
                              tier1VerificationStatus={tier1VerificationStatus}
                            />
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
                        <CardContent className="mt-auto space-y-4 pt-0">
                          {error ? <p className="text-sm text-destructive">{error}</p> : null}
                          {info ? <p className="text-sm text-muted-foreground">{info}</p> : null}
                          {tier1OnHold ? (
                            <p className="text-sm text-muted-foreground">
                              {VERIFICATION_SECTION_COPY.verificationOnHold}
                            </p>
                          ) : null}
                          {tier1UnderReview && !tier1ActionRequired ? (
                            <p className="text-sm text-muted-foreground">
                              {NOAH_VERIFICATION_IN_REVIEW_COPY}
                            </p>
                          ) : null}
                          {tier1Rejected && tier1FinalReject ? (
                            <p className="text-sm text-muted-foreground">
                              {NOAH_FINAL_REJECTION_USER_MESSAGE}
                            </p>
                          ) : tier1ActionRequired &&
                            (tier1RetryGuidance?.length || rejectionDisplay?.guidanceLines.length) ? (
                            <p className="text-sm text-destructive">
                              {(tier1RetryGuidance ?? rejectionDisplay?.guidanceLines ?? []).join(
                                " ",
                              )}
                            </p>
                          ) : tier1Rejected ? (
                            <p className="text-sm text-destructive">
                              Verification was declined. Review your documents and try again.
                            </p>
                          ) : null}
                          {!businessId ? (
                            <p className="text-xs text-muted-foreground">
                              Setting up your organization…
                            </p>
                          ) : null}
                          {!canManageBusinessVerification ? (
                            <p className="text-sm text-muted-foreground">
                              Only the organization owner can start verification.
                            </p>
                          ) : null}
                          {canManageBusinessVerification &&
                          !tier1Complete &&
                          !tier1FinalReject &&
                          !tier1AwaitingReview &&
                          !tier1OnHold ? (
                            <KybRequiredDocumentsNotice />
                          ) : null}
                          <div className="flex flex-wrap gap-2">
                            {showTier1HostedCta ? (
                              <Button
                                size="sm"
                                onClick={() => void openHostedVerification()}
                                onMouseEnter={() => void primeHostedCredentials()}
                                onFocus={() => void primeHostedCredentials()}
                                disabled={!businessId || openingVerification}
                              >
                                {openingVerification ? (
                                  <>
                                    <Loader2 className="size-4 animate-spin" aria-hidden />
                                    Opening…
                                  </>
                                ) : (
                                  tier1HostedCtaLabel
                                )}
                              </Button>
                            ) : null}
                          </div>
                        </CardContent>
                      ) : null}
                    </Card>
                  )

                  if (isT3 && showOnlinePayments) {
                    return (
                      <div key={t.tier} className="min-w-0 h-full">
                        <SettingsStripeConnectPanel
                          unavailableFallback={comingLaterCard}
                        />
                      </div>
                    )
                  }

                  return comingLaterCard
                })}
              </div>
            </CardContent>
      </Card>
    </div>
  )
}
