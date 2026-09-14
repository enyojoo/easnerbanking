"use client"

/**
 * First-party Grid KYB on the Verification settings tab.
 * CTA opens full-page wizard (`?flow=hosted`); Back restores the tabbed hub.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Loader2, ShieldCheck } from "lucide-react"
import { syncBusinessGridStatusUntilAccountsReady } from "@/lib/grid/sync-business-grid-status"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  BUSINESS_VERIFICATION_PRODUCTS,
  USD_VERIFICATION_REQUIRED_COPY,
  VERIFICATION_COMING_LATER_LABEL,
  verificationTierLabel,
} from "@/lib/compliance-tier-ladder-copy"
import { cn } from "@/lib/utils"
import { KybRequiredDocumentsNotice } from "@/components/compliance/kyb-required-documents-notice"
import { Tier1VerificationBadge } from "@/components/compliance/tier1-verification-badge"
import { SettingsCardHeader } from "@/components/settings/settings-card-header"
import { SettingsStripeConnectPanel } from "@/components/settings/settings-stripe-connect-panel"
import { SETTINGS_TAB_COPY, VERIFICATION_SECTION_COPY } from "@/lib/copy/business-ui-copy"
import {
  emptyGridKybCompanyDraft,
  getVerificationRejectionDisplay,
  NOAH_FINAL_REJECTION_USER_MESSAGE,
  NOAH_VERIFICATION_IN_REVIEW_COPY,
  accountRestrictionVerificationBlockedCopy,
} from "@easner/shared"
import {
  SETTINGS_BRIDGE_FLOW_PARAM,
  SETTINGS_CONNECT_FLOW_PARAM,
  SETTINGS_EXPRESS_FLOW_PARAM,
  SETTINGS_VERIFICATION_FLOW_PARAM,
  type SettingsVerificationEmbeddedFlow,
} from "@/lib/compliance/cutover-comms"
import { ExpressDepositsSetup } from "@/components/compliance/express-deposits-setup"
import { BridgeHostedSetup } from "@/components/compliance/bridge-hosted-setup"
import { EXPRESS_DEPOSITS_COPY, expressDepositsVerificationCta } from "@easner/shared"
import { peekBusinessExpressOnrampStatus } from "@/lib/express-onramp-status-cache"
import { loadExpressOnramp, prefetchExpressOnramp } from "@/lib/stripe/load-crypto-onramp"
import { useBusinessExpressOnrampStatus } from "@/hooks/queries/use-express-onramp-status-query"
import { useSuspendIdleLock } from "@/hooks/use-suspend-idle-lock"
import { GridKybWizard } from "@/components/compliance/grid-kyb-wizard"
import { analytics } from "@/lib/analytics"
import { useKybPacket } from "@/lib/grid/kyb-packet-query"
import { useAccountRestriction } from "@/hooks/use-account-restriction"

function tier1StatusIsInReview(status: string | null | undefined): boolean {
  const s = (status || "").toLowerCase()
  if (s === "in_progress") return false
  return s === "pending" || s === "in_review" || s === "under_review" || s.includes("review")
}

type BusinessVerificationSectionProps = {
  /** Settings hides title/tabs when a hosted KYB or Connect flow is active. */
  fullPageFlow?: boolean
  embeddedFlow?: SettingsVerificationEmbeddedFlow | null
  onFlowOpenChange?: (open: boolean, flow?: SettingsVerificationEmbeddedFlow) => void
}

export function BusinessVerificationSection({
  fullPageFlow = false,
  embeddedFlow = null,
  onFlowOpenChange,
}: BusinessVerificationSectionProps) {
  const searchParams = useSearchParams()
  const flowFromUrl = searchParams.get("flow") === SETTINGS_VERIFICATION_FLOW_PARAM
  const connectFromUrl = searchParams.get("flow") === SETTINGS_CONNECT_FLOW_PARAM
  const expressFromUrl = searchParams.get("flow") === SETTINGS_EXPRESS_FLOW_PARAM
  const bridgeFromUrl = searchParams.get("flow") === SETTINGS_BRIDGE_FLOW_PARAM
  const {
    tier1Complete,
    tier1VerificationStatus,
    tier1RejectionReasons,
    tier1RejectionType,
    tier1CanResubmit,
    canManageBusinessVerification,
    canUseGeoPersonalRails,
    isLoading,
    hasData,
    businessId,
    noahKybCustomerId,
    bridgeKycStatus,
    bridgeKycComplete,
    onlinePaymentsEnabled,
    name,
    registrationNumber,
    taxId,
    countryCode,
    registrationCountryCode,
    addressLine1,
    city,
    state,
    postalCode,
    registeredAddressLine1,
    registeredAddressCity,
    registeredAddressState,
    registeredAddressPostalCode,
  } = useBusinessProfile()

  const restrictionQuery = useAccountRestriction()
  const accountRestricted = Boolean(restrictionQuery.data?.active)

  const showOnlinePayments = onlinePaymentsEnabled !== false
  const expressQuery = useBusinessExpressOnrampStatus()
  const showExpressCard = canUseGeoPersonalRails && expressQuery.data?.eligible === true
  const expressReady = expressQuery.data?.ready === true
  const expressStatus = expressReady
    ? "approved"
    : expressQuery.data?.status || "not_started"
  const expressSetupCta = expressDepositsVerificationCta(expressStatus)

  const openExpressSetup = useCallback(() => {
    if (accountRestricted) return
    analytics.trackKybStarted({ provider: "express_deposits" })
    const peeked = peekBusinessExpressOnrampStatus()
    if (peeked?.publishableKey) {
      void loadExpressOnramp(peeked.publishableKey).catch(() => undefined)
    } else {
      prefetchExpressOnramp()
    }
    onFlowOpenChange?.(true, "express")
    const next = new URLSearchParams(searchParams.toString())
    next.set("tab", "verification")
    next.set("flow", SETTINGS_EXPRESS_FLOW_PARAM)
    window.history.replaceState(null, "", `/settings?${next.toString()}`)
  }, [accountRestricted, onFlowOpenChange, searchParams])

  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [hostedOpen, setHostedOpen] = useState(false)
  const [opening, setOpening] = useState(false)
  const flowAutoOpenRef = useRef(false)
  const kybPacketQuery = useKybPacket(Boolean(businessId && canManageBusinessVerification))
  const kybPacket = kybPacketQuery.data ?? null

  const hostedFlowActive = hostedOpen || flowFromUrl || embeddedFlow === "hosted"
  const connectFlowActive = embeddedFlow === "connect" || connectFromUrl
  const expressFlowActive = embeddedFlow === "express" || expressFromUrl
  const bridgeFlowActive = embeddedFlow === "bridge" || bridgeFromUrl

  // SumSub runs in a cross-origin iframe; parent window does not receive pointer/keyboard events.
  useSuspendIdleLock(hostedFlowActive || connectFlowActive || expressFlowActive || bridgeFlowActive)

  const pushVerificationFlowUrl = useCallback(() => {
    onFlowOpenChange?.(true, "hosted")
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
    if (hostedFlowActive || connectFlowActive || expressFlowActive || bridgeFlowActive) {
      document.documentElement.dataset.verificationFlowOpen = "true"
      document.querySelector("main")?.scrollTo({ top: 0 })
    } else {
      delete document.documentElement.dataset.verificationFlowOpen
    }
    return () => {
      delete document.documentElement.dataset.verificationFlowOpen
    }
  }, [hostedFlowActive, connectFlowActive, expressFlowActive, bridgeFlowActive])

  const syncBusinessTier1FromGrid = useCallback(async (): Promise<boolean> => {
    const result = await syncBusinessGridStatusUntilAccountsReady()
    return result.ok
  }, [])

  const closeHostedAndSync = useCallback(() => {
    setHostedOpen(false)
    clearVerificationFlowUrl()
    void syncBusinessTier1FromGrid()
  }, [clearVerificationFlowUrl, syncBusinessTier1FromGrid])

  const openHostedVerification = useCallback(async () => {
    if (accountRestricted) return
    setError(null)
    setInfo(null)
    analytics.trackKybStarted({ provider: "hosted" })
    if (!businessId) {
      setInfo("Your organization is still being set up. Refresh and try again in a moment.")
      return
    }
    if (!kybPacket) {
      setOpening(true)
      try {
        const result = await kybPacketQuery.refetch()
        if (!result.data) {
          setError(result.error instanceof Error ? result.error.message : "Could not load verification")
          return
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load verification")
        return
      } finally {
        setOpening(false)
      }
    }
    setHostedOpen(true)
    pushVerificationFlowUrl()
  }, [accountRestricted, businessId, kybPacket, kybPacketQuery, pushVerificationFlowUrl])

  const openBridgeVerification = useCallback(() => {
    if (accountRestricted) return
    if (!tier1Complete) {
      setInfo(USD_VERIFICATION_REQUIRED_COPY)
      return
    }
    setError(null)
    analytics.trackKybStarted({ provider: "bridge" })
    onFlowOpenChange?.(true, "bridge")
    const next = new URLSearchParams(searchParams.toString())
    next.set("tab", "verification")
    next.set("flow", SETTINGS_BRIDGE_FLOW_PARAM)
    window.history.replaceState(null, "", `/settings?${next.toString()}`)
  }, [accountRestricted, onFlowOpenChange, searchParams, tier1Complete])

  const closeBridgeAndSync = useCallback(() => {
    onFlowOpenChange?.(false)
    const next = new URLSearchParams(searchParams.toString())
    next.set("tab", "verification")
    next.delete("flow")
    window.history.replaceState(null, "", `/settings?${next.toString()}`)
  }, [onFlowOpenChange, searchParams])

  useEffect(() => {
    if (!accountRestricted) return
    if (!flowFromUrl && !connectFromUrl && !expressFromUrl && !bridgeFromUrl) return
    clearVerificationFlowUrl()
    setHostedOpen(false)
    onFlowOpenChange?.(false)
  }, [
    accountRestricted,
    bridgeFromUrl,
    clearVerificationFlowUrl,
    connectFromUrl,
    expressFromUrl,
    flowFromUrl,
    onFlowOpenChange,
  ])

  useEffect(() => {
    if (!flowFromUrl || accountRestricted) {
      flowAutoOpenRef.current = false
      return
    }
    if (flowAutoOpenRef.current || hostedOpen) return
    flowAutoOpenRef.current = true
    openHostedVerification()
  }, [accountRestricted, flowFromUrl, hostedOpen, openHostedVerification])

  useEffect(() => {
    if (embeddedFlow === "hosted" || flowFromUrl || !hostedOpen) return
    setHostedOpen(false)
  }, [embeddedFlow, flowFromUrl, hostedOpen])

  const profileReady = Boolean(businessId || name.trim())
  const initialCompany = useMemo(
    () => ({
      ...emptyGridKybCompanyDraft(),
      legalName: name.trim(),
      registrationNumber: registrationNumber.trim(),
      taxId: taxId.trim(),
      country: (registrationCountryCode || countryCode || "").toUpperCase(),
      addressCountry: (countryCode || registrationCountryCode || "").toUpperCase(),
      addressLine1: (registeredAddressLine1 || addressLine1).trim(),
      city: (registeredAddressCity || city).trim(),
      state: (registeredAddressState || state).trim(),
      postalCode: (registeredAddressPostalCode || postalCode).trim(),
    }),
    [
      name,
      registrationNumber,
      taxId,
      registrationCountryCode,
      countryCode,
      registeredAddressLine1,
      addressLine1,
      registeredAddressCity,
      city,
      registeredAddressState,
      state,
      registeredAddressPostalCode,
      postalCode,
    ],
  )

  if ((isLoading && !hasData) || (hostedFlowActive && (!profileReady || !kybPacket))) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden />
        Loading verification…
      </div>
    )
  }

  const tier1Rejected = tier1VerificationStatus === "rejected"
  const tier1OnHold = tier1VerificationStatus === "hold"
  const tier1ActionRequired = tier1Rejected || tier1OnHold
  const rejectionDisplay =
    tier1ActionRequired ? getVerificationRejectionDisplay(tier1RejectionReasons) : null
  const tier1FinalReject = tier1RejectionType === "Final" || rejectionDisplay?.isFinal === true
  const tier1UnderReview = tier1StatusIsInReview(tier1VerificationStatus)
  const tier1InProgress = tier1VerificationStatus === "in_progress"
  const packetAwaitingReview =
    kybPacket?.status === "in_review" ||
    (kybPacket?.status === "submitted" && Boolean(kybPacket?.submittedAt))
  const tier1AwaitingReview =
    !tier1Rejected && !tier1OnHold && (tier1UnderReview || packetAwaitingReview)
  const hasGridCustomer = Boolean(noahKybCustomerId?.trim())
  const tier1StartedNotSubmitted =
    !tier1Rejected &&
    !tier1AwaitingReview &&
    (tier1InProgress || (tier1VerificationStatus === "not_started" && hasGridCustomer))
  const showTier1HostedCta =
    canManageBusinessVerification &&
    !accountRestricted &&
    !tier1Complete &&
    !tier1AwaitingReview &&
    tier1CanResubmit &&
    (!tier1OnHold || tier1CanResubmit)
  const tier1HostedCtaLabel =
    tier1Rejected || tier1OnHold
      ? VERIFICATION_SECTION_COPY.reviewAndFixCta
      : tier1InProgress || tier1StartedNotSubmitted
        ? VERIFICATION_SECTION_COPY.continueVerificationCta
        : VERIFICATION_SECTION_COPY.beginVerificationCta

  /** Full-page flow fills remaining main; in-tab fallback keeps title/tabs chrome. */
  const verificationFlowPanelClass =
    hostedFlowActive || expressFlowActive || bridgeFlowActive
      ? "flex min-h-0 flex-1 flex-col"
      : "h-[calc(100dvh-var(--dashboard-sticky-top,4rem)-var(--verification-settings-chrome,14rem))] max-h-[calc(100dvh-var(--dashboard-sticky-top,4rem)-var(--verification-settings-chrome,14rem))]"

  const hostedFlowPanel = kybPacket ? (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <GridKybWizard
          onClose={closeHostedAndSync}
          initialInReview={tier1AwaitingReview}
          initialCompany={initialCompany}
          initialPacket={kybPacket}
        />
      </div>
    </div>
  ) : null

  if (bridgeFlowActive) {
    return (
      <div
        id="business-verification"
        className={verificationFlowPanelClass}
        data-verification-flow="open"
      >
        <BridgeHostedSetup onClose={closeBridgeAndSync} />
      </div>
    )
  }

  if (expressFlowActive) {
    return (
      <div
        id="business-verification"
        className={verificationFlowPanelClass}
        data-verification-flow="open"
      >
        <ExpressDepositsSetup
          onClose={() => {
            onFlowOpenChange?.(false)
            const next = new URLSearchParams(searchParams.toString())
            next.set("tab", "verification")
            next.delete("flow")
            window.history.replaceState(null, "", `/settings?${next.toString()}`)
          }}
        />
      </div>
    )
  }

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
    <div
      className={connectFlowActive ? "flex min-h-0 flex-1 flex-col" : "space-y-6"}
      id="business-verification"
      data-verification-flow={connectFlowActive ? "open" : undefined}
    >
      <Card
        className={cn(
          connectFlowActive &&
            "flex min-h-0 flex-1 flex-col overflow-hidden border-0 bg-transparent shadow-none",
        )}
      >
        <CardHeader className={cn(connectFlowActive && "hidden")}>
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
            <CardContent
              className={cn(connectFlowActive && "flex min-h-0 flex-1 flex-col p-0")}
            >
              <div
                className={cn(
                  "grid gap-4 md:grid-cols-2 xl:grid-cols-3",
                  connectFlowActive && "flex min-h-0 flex-1 flex-col gap-0 md:grid-cols-1",
                )}
              >
                {BUSINESS_VERIFICATION_PRODUCTS.map((t) => {
                  const isGlobalBanking = t.id === "global_banking"
                  const isEurAccounts = t.id === "eur"
                  const isOnlinePayments = t.id === "online_payments"
                  const eurStatus = bridgeKycComplete
                    ? "approved"
                    : String(bridgeKycStatus || "not_started")
                  const showEurCta =
                    isEurAccounts &&
                    canManageBusinessVerification &&
                    !bridgeKycComplete &&
                    !accountRestricted

                  const comingLaterCard = (
                    <Card
                      key={t.id}
                      className={cn(
                        "flex h-full flex-col gap-3 py-4",
                        isGlobalBanking && "border-primary/25 md:border-primary/40",
                        connectFlowActive && "hidden",
                      )}
                    >
                      <CardHeader className="gap-1.5 px-4 pb-0 md:px-4">
                        {verificationTierLabel(t.ladderTier) ? (
                          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            {verificationTierLabel(t.ladderTier)}
                          </p>
                        ) : null}
                        <div className="flex flex-nowrap items-center gap-1.5">
                          <CardTitle className="min-w-0 text-base leading-tight">{t.title}</CardTitle>
                          {isGlobalBanking ? (
                            <Tier1VerificationBadge
                              compact
                              tier1Complete={tier1Complete}
                              tier1VerificationStatus={tier1VerificationStatus}
                              accountRestricted={accountRestricted}
                            />
                          ) : isEurAccounts ? (
                            <Tier1VerificationBadge
                              compact
                              tier1Complete={bridgeKycComplete}
                              tier1VerificationStatus={eurStatus}
                              accountRestricted={accountRestricted}
                            />
                          ) : (
                            <Badge
                              variant="secondary"
                              className="h-5 shrink-0 px-1.5 py-0 text-[10px] leading-none font-medium"
                            >
                              {VERIFICATION_COMING_LATER_LABEL}
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="text-sm">{t.description}</CardDescription>
                        {t.footnote && !(isEurAccounts && tier1Complete) ? (
                          <p className="text-xs text-muted-foreground pt-1">{t.footnote}</p>
                        ) : null}
                      </CardHeader>
                      {isGlobalBanking ? (
                        <CardContent className="mt-auto space-y-3 px-4 pt-0 md:px-4">
                          {accountRestricted ? (
                            <p className="text-xs text-muted-foreground">
                              {accountRestrictionVerificationBlockedCopy()}
                            </p>
                          ) : (
                            <>
                              {error ? <p className="text-xs text-destructive">{error}</p> : null}
                              {info ? <p className="text-xs text-muted-foreground">{info}</p> : null}
                              {tier1AwaitingReview && !tier1ActionRequired ? (
                                <p className="text-xs text-muted-foreground">
                                  {NOAH_VERIFICATION_IN_REVIEW_COPY}
                                </p>
                              ) : null}
                              {tier1Rejected && tier1FinalReject ? (
                                <p className="text-xs text-muted-foreground">
                                  {NOAH_FINAL_REJECTION_USER_MESSAGE}
                                </p>
                              ) : tier1ActionRequired ? (
                                <p className="text-xs text-destructive">
                                  {VERIFICATION_SECTION_COPY.verificationOnHold}
                                </p>
                              ) : null}
                              {!businessId ? (
                                <p className="text-xs text-muted-foreground">
                                  Setting up your organization…
                                </p>
                              ) : null}
                              {!canManageBusinessVerification ? (
                                <p className="text-xs text-muted-foreground">
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
                                    disabled={!businessId || opening}
                                  >
                                    {opening ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                                    {tier1HostedCtaLabel}
                                  </Button>
                                ) : null}
                              </div>
                            </>
                          )}
                        </CardContent>
                      ) : isEurAccounts ? (
                        <CardContent className="mt-auto space-y-3 px-4 pt-0 md:px-4">
                          {showEurCta ? (
                            <>
                              {!tier1Complete ? (
                                <p className="text-xs text-muted-foreground">{t.footnote}</p>
                              ) : null}
                              <div className="flex flex-wrap gap-2">
                                <TooltipProvider delayDuration={200}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="inline-flex">
                                        <Button
                                          size="sm"
                                          disabled={!tier1Complete || opening || !businessId}
                                          onClick={openBridgeVerification}
                                        >
                                          {opening ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                                          {eurStatus === "in_progress" || eurStatus === "pending"
                                            ? "Continue"
                                            : "Start"}
                                        </Button>
                                      </span>
                                    </TooltipTrigger>
                                    {!tier1Complete ? (
                                      <TooltipContent>{USD_VERIFICATION_REQUIRED_COPY}</TooltipContent>
                                    ) : null}
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                            </>
                          ) : null}
                        </CardContent>
                      ) : null}
                    </Card>
                  )

                  if (isOnlinePayments && showOnlinePayments) {
                    return (
                      <div
                        key={t.id}
                        className={cn(
                          "min-w-0 h-full",
                          connectFlowActive && "flex min-h-0 flex-1 flex-col",
                        )}
                      >
                        <SettingsStripeConnectPanel
                          fullPageFlow={connectFlowActive}
                          unavailableFallback={comingLaterCard}
                          onFlowOpenChange={onFlowOpenChange}
                          verificationActionsBlocked={accountRestricted}
                        />
                      </div>
                    )
                  }

                  return comingLaterCard
                })}
                {showExpressCard ? (
                  <Card className="flex h-full flex-col gap-3 border-primary/20 py-4">
                    <CardHeader className="gap-1.5 px-4 pb-0 md:px-4">
                      <div className="flex flex-nowrap items-center gap-1.5">
                        <CardTitle className="min-w-0 text-base leading-tight">
                          {EXPRESS_DEPOSITS_COPY.title}
                        </CardTitle>
                        <Tier1VerificationBadge
                          compact
                          isLoading={expressQuery.isLoading && !expressQuery.data}
                          tier1Complete={expressReady}
                          tier1VerificationStatus={expressStatus}
                        />
                      </div>
                      <CardDescription className="text-sm">
                        {EXPRESS_DEPOSITS_COPY.description}
                      </CardDescription>
                    </CardHeader>
                    {!expressReady && expressSetupCta && !accountRestricted ? (
                      <CardContent className="mt-auto space-y-3 px-4 pt-0 md:px-4">
                        {!tier1Complete ? (
                          <div className="flex flex-wrap gap-2">
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex">
                                    <Button type="button" size="sm" disabled>
                                      {EXPRESS_DEPOSITS_COPY.setupCta}
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {EXPRESS_DEPOSITS_COPY.globalBankingRequired}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        ) : !canManageBusinessVerification ? (
                          <p className="text-xs text-muted-foreground">{EXPRESS_DEPOSITS_COPY.ownerOnly}</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" size="sm" onClick={openExpressSetup}>
                              {expressSetupCta}
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    ) : null}
                  </Card>
                ) : null}
              </div>
            </CardContent>
      </Card>
    </div>
  )
}
