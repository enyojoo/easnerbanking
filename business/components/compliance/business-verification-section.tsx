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
import { BUSINESS_VERIFICATION_PRODUCTS } from "@/lib/compliance-tier-ladder-copy"
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
} from "@easner/shared"
import {
  SETTINGS_CONNECT_FLOW_PARAM,
  SETTINGS_EXPRESS_FLOW_PARAM,
  SETTINGS_VERIFICATION_FLOW_PARAM,
  type SettingsVerificationEmbeddedFlow,
} from "@/lib/compliance/cutover-comms"
import { ExpressDepositsSetup } from "@/components/compliance/express-deposits-setup"
import { EXPRESS_DEPOSITS_COPY } from "@easner/shared"
import { peekBusinessExpressOnrampStatus } from "@/lib/express-onramp-status-cache"
import { loadExpressOnramp, prefetchExpressOnramp } from "@/lib/stripe/load-crypto-onramp"
import { useBusinessExpressOnrampStatus } from "@/hooks/queries/use-express-onramp-status-query"
import { useSuspendIdleLock } from "@/hooks/use-suspend-idle-lock"
import { GridKybWizard } from "@/components/compliance/grid-kyb-wizard"
import { useKybPacket } from "@/lib/grid/kyb-packet-query"

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

  const showOnlinePayments = onlinePaymentsEnabled !== false
  const expressQuery = useBusinessExpressOnrampStatus()
  const showExpressCard = expressQuery.data?.eligible === true
  const expressReady = expressQuery.data?.ready === true
  const expressStatus = expressReady
    ? "approved"
    : expressQuery.data?.status || "not_started"

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

  // SumSub runs in a cross-origin iframe; parent window does not receive pointer/keyboard events.
  useSuspendIdleLock(hostedFlowActive || connectFlowActive || expressFlowActive)

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
    if (hostedFlowActive || connectFlowActive || expressFlowActive) {
      document.documentElement.dataset.verificationFlowOpen = "true"
      document.querySelector("main")?.scrollTo({ top: 0 })
    } else {
      delete document.documentElement.dataset.verificationFlowOpen
    }
    return () => {
      delete document.documentElement.dataset.verificationFlowOpen
    }
  }, [hostedFlowActive, connectFlowActive, expressFlowActive])

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
    setError(null)
    setInfo(null)
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
  }, [businessId, kybPacket, kybPacketQuery, pushVerificationFlowUrl])

  useEffect(() => {
    if (!flowFromUrl) {
      flowAutoOpenRef.current = false
      return
    }
    if (flowAutoOpenRef.current || hostedOpen) return
    flowAutoOpenRef.current = true
    openHostedVerification()
  }, [flowFromUrl, hostedOpen, openHostedVerification])

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
  const packetWaiting = kybPacket?.status === "in_review"
  const tier1AwaitingReview =
    !tier1Rejected && !tier1OnHold && (tier1UnderReview || packetWaiting)
  const hasGridCustomer = Boolean(noahKybCustomerId?.trim())
  const tier1StartedNotSubmitted =
    !tier1Rejected &&
    !tier1AwaitingReview &&
    (tier1InProgress || (tier1VerificationStatus === "not_started" && hasGridCustomer))
  const showTier1HostedCta =
    canManageBusinessVerification &&
    !tier1Complete &&
    !tier1AwaitingReview &&
    tier1CanResubmit &&
    (!tier1OnHold || tier1CanResubmit)
  const tier1HostedCtaLabel =
    tier1Rejected
      ? "Retry verification"
      : tier1OnHold
        ? "Continue verification"
        : tier1InProgress || tier1StartedNotSubmitted
          ? "Continue verification"
          : "Begin verification"

  /** Full-page flow fills remaining main; in-tab fallback keeps title/tabs chrome. */
  const verificationFlowPanelClass = hostedFlowActive || expressFlowActive
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
                  "grid gap-4 md:grid-cols-2",
                  showExpressCard ? "xl:grid-cols-4" : "xl:grid-cols-3",
                  connectFlowActive && "flex min-h-0 flex-1 flex-col gap-0 md:grid-cols-1",
                )}
              >
                {BUSINESS_VERIFICATION_PRODUCTS.map((t) => {
                  const isGlobalBanking = t.id === "global_banking"
                  const isOnlinePayments = t.id === "online_payments"

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
                        <div className="flex flex-nowrap items-center gap-1.5">
                          <CardTitle className="min-w-0 text-base leading-tight">{t.title}</CardTitle>
                          {isGlobalBanking ? (
                            <Tier1VerificationBadge
                              compact
                              tier1Complete={tier1Complete}
                              tier1VerificationStatus={tier1VerificationStatus}
                            />
                          ) : (
                            <Badge
                              variant="secondary"
                              className="h-5 shrink-0 px-1.5 py-0 text-[10px] leading-none font-medium"
                            >
                              Coming later
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="text-sm">{t.description}</CardDescription>
                        {t.footnote ? (
                          <p className="text-xs text-muted-foreground pt-1">{t.footnote}</p>
                        ) : null}
                      </CardHeader>
                      {isGlobalBanking ? (
                        <CardContent className="mt-auto space-y-3 px-4 pt-0 md:px-4">
                          {error ? <p className="text-xs text-destructive">{error}</p> : null}
                          {info ? <p className="text-xs text-muted-foreground">{info}</p> : null}
                          {tier1OnHold ? (
                            <p className="text-xs text-muted-foreground">
                              {VERIFICATION_SECTION_COPY.verificationOnHold}
                            </p>
                          ) : null}
                          {tier1AwaitingReview && !tier1ActionRequired ? (
                            <p className="text-xs text-muted-foreground">
                              {NOAH_VERIFICATION_IN_REVIEW_COPY}
                            </p>
                          ) : null}
                          {tier1Rejected && tier1FinalReject ? (
                            <p className="text-xs text-muted-foreground">
                              {NOAH_FINAL_REJECTION_USER_MESSAGE}
                            </p>
                          ) : tier1ActionRequired &&
                            (tier1RetryGuidance?.length || rejectionDisplay?.guidanceLines.length) ? (
                            <p className="text-xs text-destructive">
                              {(tier1RetryGuidance ?? rejectionDisplay?.guidanceLines ?? []).join(
                                " ",
                              )}
                            </p>
                          ) : tier1Rejected ? (
                            <p className="text-xs text-destructive">
                              Verification was declined. Review your documents and try again.
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
                    <CardContent className="mt-auto space-y-3 px-4 pt-0 md:px-4">
                      {!tier1Complete ? (
                        <Button size="sm" disabled>
                          {EXPRESS_DEPOSITS_COPY.setupCta}
                        </Button>
                      ) : !canManageBusinessVerification ? (
                        <p className="text-xs text-muted-foreground">{EXPRESS_DEPOSITS_COPY.ownerOnly}</p>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => {
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
                          }}
                        >
                          {EXPRESS_DEPOSITS_COPY.setupCta}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            </CardContent>
      </Card>
    </div>
  )
}
