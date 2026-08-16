"use client"

/**
 * First-party Grid KYB on the Verification settings tab.
 * CTA opens full-page wizard (`?flow=hosted`); Back restores the tabbed hub.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { ShieldCheck } from "lucide-react"
import { syncBusinessGridStatusUntilAccountsReady } from "@/lib/grid/sync-business-grid-status"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { BUSINESS_TIER_LADDER } from "@/lib/compliance-tier-ladder-copy"
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
  SETTINGS_VERIFICATION_FLOW_PARAM,
  type SettingsVerificationEmbeddedFlow,
} from "@/lib/compliance/cutover-comms"
import { useSuspendIdleLock } from "@/hooks/use-suspend-idle-lock"
import { GridKybWizard } from "@/components/compliance/grid-kyb-wizard"

function tier1StatusIsInReview(status: string | null | undefined): boolean {
  const s = (status || "").toLowerCase()
  if (s === "in_progress") return false
  return s === "pending" || s === "in_review" || s === "under_review" || s.includes("review")
}

function tierLadderCopy(tier: 1 | 2 | 3) {
  return BUSINESS_TIER_LADDER.tiers.find((x) => x.tier === tier)
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
    name,
    registrationNumber,
    taxId,
    countryCode,
    registrationCountryCode,
    addressLine1,
    city,
    state,
    postalCode,
  } = useBusinessProfile()

  const showOnlinePayments = invoiceSettings?.showOnlinePayment !== false

  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [hostedOpen, setHostedOpen] = useState(false)
  const flowAutoOpenRef = useRef(false)

  const hostedFlowActive = hostedOpen || flowFromUrl || embeddedFlow === "hosted"
  const connectFlowActive = embeddedFlow === "connect" || connectFromUrl

  // SumSub runs in a cross-origin iframe; parent window does not receive pointer/keyboard events.
  useSuspendIdleLock(hostedFlowActive || connectFlowActive)

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
    if (hostedFlowActive || connectFlowActive) {
      document.documentElement.dataset.verificationFlowOpen = "true"
      document.querySelector("main")?.scrollTo({ top: 0 })
    } else {
      delete document.documentElement.dataset.verificationFlowOpen
    }
    return () => {
      delete document.documentElement.dataset.verificationFlowOpen
    }
  }, [hostedFlowActive, connectFlowActive])

  const syncBusinessTier1FromGrid = useCallback(async (): Promise<boolean> => {
    const result = await syncBusinessGridStatusUntilAccountsReady()
    return result.ok
  }, [])

  const closeHostedAndSync = useCallback(() => {
    setHostedOpen(false)
    clearVerificationFlowUrl()
    void syncBusinessTier1FromGrid()
  }, [clearVerificationFlowUrl, syncBusinessTier1FromGrid])

  const openHostedVerification = useCallback(() => {
    setError(null)
    setInfo(null)
    if (!businessId) {
      setInfo("Your organization is still being set up. Refresh and try again in a moment.")
      return
    }
    setHostedOpen(true)
    pushVerificationFlowUrl()
  }, [businessId, pushVerificationFlowUrl])

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

  if (isLoading && !hasData) {
    return <div className="text-sm text-muted-foreground">Loading verification status…</div>
  }

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
    (!tier1OnHold || tier1CanResubmit)
  const tier1HostedCtaLabel =
    tier1Rejected
      ? "Retry verification"
      : tier1OnHold
        ? "Continue verification"
        : tier1AwaitingReview
          ? "View progress"
          : tier1InProgress || tier1StartedNotSubmitted
            ? "Continue verification"
            : "Begin verification"

  /** Full-page flow fills remaining main; in-tab fallback keeps title/tabs chrome. */
  const verificationFlowPanelClass = hostedFlowActive
    ? "flex min-h-0 flex-1 flex-col"
    : "h-[calc(100dvh-var(--dashboard-sticky-top,4rem)-var(--verification-settings-chrome,14rem))] max-h-[calc(100dvh-var(--dashboard-sticky-top,4rem)-var(--verification-settings-chrome,14rem))]"

  const hostedFlowPanel = (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <GridKybWizard
          onClose={closeHostedAndSync}
          initialInReview={tier1AwaitingReview}
          initialCompany={{
            ...emptyGridKybCompanyDraft(),
            legalName: name.trim(),
            registrationNumber: registrationNumber.trim(),
            taxId: taxId.trim(),
            country: (registrationCountryCode || countryCode || "").toUpperCase(),
            addressCountry: (countryCode || registrationCountryCode || "").toUpperCase(),
            addressLine1,
            city,
            state,
            postalCode,
          }}
        />
      </div>
    </div>
  )

  if (connectFlowActive) {
    return (
      <div
        id="business-verification"
        className="flex min-h-0 flex-1 flex-col"
        data-verification-flow="open"
      >
        <SettingsStripeConnectPanel
          fullPageFlow
          onFlowOpenChange={onFlowOpenChange}
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
                                onClick={() => openHostedVerification()}
                                disabled={!businessId}
                              >
                                {tier1HostedCtaLabel}
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
                          onFlowOpenChange={onFlowOpenChange}
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
