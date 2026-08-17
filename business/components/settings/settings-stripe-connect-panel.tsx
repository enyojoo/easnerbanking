"use client"

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { loadConnectAndInitialize } from "@stripe/connect-js"
import {
  ConnectAccountOnboarding,
  ConnectComponentsProvider,
} from "@stripe/react-connect-js"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ArrowLeft, Check, Circle, Loader2 } from "lucide-react"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { toast } from "sonner"
import { isStripePublishableConfigured } from "@/lib/stripe/public-enabled"
import { easnerStripeConnectAppearance } from "@/lib/stripe/connect-appearance"
import { browserStripeLocale } from "@/lib/stripe/elements-appearance"
import {
  EASNER_STRIPE_CONNECT_PRIVACY_URL,
  EASNER_STRIPE_CONNECT_TERMS_URL,
} from "@/lib/stripe/connect/legal-urls"
import {
  fetchAndCacheConnectStatus,
  initialConnectStatus,
  readCachedConnectStatus,
  writeCachedConnectStatus,
  type ConnectStatusPayload,
} from "@/lib/stripe/connect-status-cache"
import {
  connectPanelVerificationPresentation,
  resolveConnectPanelUx,
  type ConnectPanelAction,
  type ConnectStatusSnapshot,
} from "@/lib/stripe/connect-panel-ux"
import { BUSINESS_TIER_LADDER } from "@/lib/compliance-tier-ladder-copy"
import { Tier1VerificationBadge } from "@/components/compliance/tier1-verification-badge"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { useSuspendIdleLock } from "@/hooks/use-suspend-idle-lock"
import {
  SETTINGS_CONNECT_FLOW_PARAM,
  type SettingsVerificationEmbeddedFlow,
} from "@/lib/compliance/cutover-comms"
import { useSearchParams } from "next/navigation"
import { verificationStatusLabel } from "@easner/shared"
import { cn } from "@/lib/utils"

const ONLINE_PAYMENTS_VERIFICATION_TITLE = "Online payments Verification"

function ConnectStatusChecklistTooltip({
  status,
  complete,
  summary,
  checklist,
}: {
  status: string
  complete: boolean
  summary?: string | null
  checklist: Array<{ label: string; done: boolean }>
}) {
  const label = verificationStatusLabel(status, { complete })
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex cursor-default rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`${label}. Show setup checklist.`}
          >
            <Tier1VerificationBadge
              tier1Complete={complete}
              tier1VerificationStatus={status}
            />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start" className="max-w-[17.5rem] space-y-2 p-3">
          {summary ? <p className="text-xs leading-snug text-popover-foreground">{summary}</p> : null}
          {checklist.length > 0 ? (
            <ul className="space-y-1.5">
              {checklist.map((item, index) => (
                <li key={`${item.label}-${index}`} className="flex items-start gap-2 text-xs">
                  {item.done ? (
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
                  ) : (
                    <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-40" aria-hidden />
                  )}
                  <span className={item.done ? "text-popover-foreground" : "text-muted-foreground"}>
                    {item.label}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

let prefetchedConnectClientSecret: string | null = null
let primedConnectInstance: ReturnType<typeof loadConnectAndInitialize> | null = null

const connectOnboardingCollectionOptions = {
  fields: "eventually_due" as const,
  futureRequirements: "include" as const,
  requirements: {
    exclude: ["tos_acceptance.*"],
  },
}

export function SettingsStripeConnectPanel({
  unavailableFallback = null,
  fullPageFlow = false,
  onFlowOpenChange,
}: {
  /** Rendered when Connect is not enabled for this business/environment. */
  unavailableFallback?: ReactNode
  fullPageFlow?: boolean
  onFlowOpenChange?: (open: boolean, flow?: SettingsVerificationEmbeddedFlow) => void
} = {}) {
  const searchParams = useSearchParams()
  const { businessId, tier1Complete } = useBusinessProfile()
  const [status, setStatus] = useState<ConnectStatusPayload | null>(() => initialConnectStatus())
  const [linking, setLinking] = useState(false)
  const [openingOnboarding, setOpeningOnboarding] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [onboardingFrameReady, setOnboardingFrameReady] = useState(false)
  const [onboardingError, setOnboardingError] = useState<string | null>(null)
  const [connectInstance, setConnectInstance] = useState<ReturnType<
    typeof loadConnectAndInitialize
  > | null>(null)
  const clearInstanceAfterCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startLockRef = useRef(false)

  // Stripe Connect onboarding is a cross-origin iframe — parent activity listeners
  // never see typing/clicks. Suspend idle PIN lock for the duration of the pane.
  useSuspendIdleLock(onboardingOpen || fullPageFlow)

  const publishableKey =
    typeof process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY === "string"
      ? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.trim()
      : ""

  const applyStatus = useCallback(
    (next: ConnectStatusPayload | null) => {
      setStatus(next)
      if (next) writeCachedConnectStatus(businessId, next)
    },
    [businessId],
  )

  const refreshStatus = useCallback(async () => {
    const json = await fetchAndCacheConnectStatus(businessId)
    if (json) applyStatus(json)
    return json
  }, [applyStatus, businessId])

  useLayoutEffect(() => {
    const cached = readCachedConnectStatus(businessId)
    if (cached) applyStatus(cached)
  }, [applyStatus, businessId])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    const onFocus = () => void refreshStatus()
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [refreshStatus])

  useEffect(() => {
    return () => {
      if (clearInstanceAfterCloseRef.current) clearTimeout(clearInstanceAfterCloseRef.current)
    }
  }, [])

  const fetchClientSecret = useCallback(async () => {
    const res = await fetchWithSession("/api/business/stripe/connect/onboarding-session", {
      method: "POST",
    })
    const json = (await res.json().catch(() => ({}))) as {
      clientSecret?: string
      error?: string
    }
    if (!res.ok || !json.clientSecret) {
      throw new Error(json.error || "Failed to start onboarding")
    }
    return json.clientSecret
  }, [])

  const createConnectInstance = useCallback(() => {
    if (primedConnectInstance) return primedConnectInstance
    const instance = loadConnectAndInitialize({
      publishableKey,
      fetchClientSecret: async () => {
        const cached = prefetchedConnectClientSecret
        if (cached) {
          prefetchedConnectClientSecret = null
          return cached
        }
        return fetchClientSecret()
      },
      locale: browserStripeLocale(),
      appearance: easnerStripeConnectAppearance(),
    })
    primedConnectInstance = instance
    return instance
  }, [fetchClientSecret, publishableKey])

  const prefetchClientSecret = useCallback(async () => {
    if (!tier1Complete) return
    if (primedConnectInstance) {
      setConnectInstance((prev) => prev ?? primedConnectInstance)
      return
    }
    try {
      if (!prefetchedConnectClientSecret) {
        prefetchedConnectClientSecret = await fetchClientSecret()
      }
      if (!publishableKey || !isStripePublishableConfigured()) return
      const instance = createConnectInstance()
      setConnectInstance(instance)
    } catch {
      prefetchedConnectClientSecret = null
    }
  }, [createConnectInstance, fetchClientSecret, publishableKey, tier1Complete])

  const pushConnectFlowUrl = useCallback(() => {
    onFlowOpenChange?.(true, "connect")
    const next = new URLSearchParams(searchParams.toString())
    next.set("tab", "verification")
    next.set("flow", SETTINGS_CONNECT_FLOW_PARAM)
    window.history.replaceState(null, "", `/settings?${next.toString()}`)
  }, [onFlowOpenChange, searchParams])

  const clearConnectFlowUrl = useCallback(() => {
    onFlowOpenChange?.(false)
    const next = new URLSearchParams(searchParams.toString())
    next.set("tab", "verification")
    next.delete("flow")
    window.history.replaceState(null, "", `/settings?${next.toString()}`)
  }, [onFlowOpenChange, searchParams])

  const clearConnectInstance = useCallback(() => {
    if (clearInstanceAfterCloseRef.current) clearTimeout(clearInstanceAfterCloseRef.current)
    clearInstanceAfterCloseRef.current = setTimeout(() => {
      setConnectInstance(null)
      setOnboardingFrameReady(false)
      setOnboardingError(null)
      prefetchedConnectClientSecret = null
      primedConnectInstance = null
      clearInstanceAfterCloseRef.current = null
    }, 280)
  }, [])

  const closeOnboardingAndSync = useCallback(async () => {
    setOnboardingOpen(false)
    startLockRef.current = false
    clearConnectFlowUrl()
    await fetchWithSession("/api/business/stripe/connect/sync", { method: "POST" }).catch(() => null)
    const next = await refreshStatus()
    if (next?.ready) {
      toast.success("Online payments are ready")
    } else if (next?.externalAccountLinked && next.detailsSubmitted) {
      toast.success("Verification saved. Payout linked — finishing setup.")
    } else if (next?.detailsSubmitted && next.hasGridVa && !next.externalAccountLinked) {
      toast.message("Verification saved. Tap Link payout to connect your virtual account.")
    } else {
      toast.success("Verification updated")
    }
    clearConnectInstance()
  }, [clearConnectFlowUrl, clearConnectInstance, refreshStatus])

  const startOnboarding = useCallback(async () => {
    if (!tier1Complete) {
      toast.message("Complete Tier 1 business verification before setting up online payments.")
      return
    }
    if (!publishableKey || !isStripePublishableConfigured()) {
      toast.error("Online payments are not available yet")
      return
    }
    if (startLockRef.current) {
      setOnboardingOpen(true)
      if (primedConnectInstance) setConnectInstance((prev) => prev ?? primedConnectInstance)
      return
    }
    try {
      startLockRef.current = true
      if (clearInstanceAfterCloseRef.current) {
        clearTimeout(clearInstanceAfterCloseRef.current)
        clearInstanceAfterCloseRef.current = null
      }
      setOpeningOnboarding(true)
      setOnboardingError(null)
      setOnboardingFrameReady(false)
      if (!prefetchedConnectClientSecret && !primedConnectInstance) {
        prefetchedConnectClientSecret = await fetchClientSecret()
      }
      const instance = connectInstance ?? createConnectInstance()
      setConnectInstance(instance)
      setOnboardingOpen(true)
    } catch (e) {
      startLockRef.current = false
      setOnboardingOpen(false)
      setOnboardingFrameReady(false)
      prefetchedConnectClientSecret = null
      primedConnectInstance = null
      const message = e instanceof Error ? e.message : "Could not start onboarding"
      setOnboardingError(message)
      toast.error(message)
    } finally {
      setOpeningOnboarding(false)
    }
  }, [connectInstance, createConnectInstance, fetchClientSecret, publishableKey, tier1Complete])

  const openConnectFlow = useCallback(() => {
    if (!tier1Complete) {
      toast.message("Complete Tier 1 business verification before setting up online payments.")
      return
    }
    if (!publishableKey || !isStripePublishableConfigured()) {
      toast.error("Online payments are not available yet")
      return
    }
    if (primedConnectInstance) {
      setConnectInstance((prev) => prev ?? primedConnectInstance)
      setOnboardingOpen(true)
    }
    pushConnectFlowUrl()
    void startOnboarding()
  }, [publishableKey, pushConnectFlowUrl, startOnboarding, tier1Complete])

  useEffect(() => {
    if (!onboardingOpen || onboardingFrameReady || !connectInstance) return
    const timeoutId = window.setTimeout(() => {
      setOnboardingError(
        "Stripe verification is taking longer than expected. Check your connection and try again.",
      )
    }, 30_000)
    return () => window.clearTimeout(timeoutId)
  }, [connectInstance, onboardingFrameReady, onboardingOpen])

  const linkPayoutDestination = useCallback(async () => {
    setLinking(true)
    try {
      const res = await fetchWithSession("/api/business/stripe/connect/link-payout-destination", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency: "USD" }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        maskedDestination?: string
        payoutInterval?: string
      }
      if (!res.ok) {
        throw new Error(json.error || "Failed to link payout destination")
      }
      toast.success(
        `Payout destination linked${json.maskedDestination ? ` (${json.maskedDestination})` : ""}`,
      )
      await refreshStatus()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to link payout destination")
    } finally {
      setLinking(false)
    }
  }, [refreshStatus])

  useEffect(() => {
    if (tier1Complete) void prefetchClientSecret()
  }, [tier1Complete, prefetchClientSecret])

  const panelUx = useMemo(() => {
    if (!status) return null
    if (!status.connectEnabled) {
      return null
    }
    const statusForUx: ConnectStatusSnapshot = {
      ...(status as ConnectStatusSnapshot),
      tier1Complete,
    }
    return resolveConnectPanelUx(statusForUx)
  }, [status, tier1Complete])

  const badgePresentation = useMemo(() => {
    if (!panelUx) return { status: "not_started", complete: false }
    return connectPanelVerificationPresentation(panelUx.phase, panelUx.verificationComplete)
  }, [panelUx])

  useEffect(() => {
    if (!fullPageFlow) return
    if (!panelUx) return
    if (
      panelUx.phase === "link_payout" ||
      panelUx.phase === "missing_virtual_account" ||
      panelUx.phase === "ready" ||
      panelUx.phase === "pending_review" ||
      panelUx.phase === "activating"
    ) {
      clearConnectFlowUrl()
      return
    }
    if (connectInstance || onboardingOpen) return
    void startOnboarding()
  }, [clearConnectFlowUrl, connectInstance, fullPageFlow, onboardingOpen, panelUx, startOnboarding])

  const runAction = useCallback(
    (action: ConnectPanelAction) => {
      if (!panelUx) return
      if (action.kind === "link_payout") {
        void linkPayoutDestination()
        return
      }
      openConnectFlow()
    },
    [linkPayoutDestination, openConnectFlow, panelUx],
  )

  const connectFlowPanel = (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <div className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b px-2 py-2 sm:px-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 min-w-[8.5rem] justify-start gap-1 px-2"
          onClick={() => void closeOnboardingAndSync()}
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back
        </Button>
        <p className="truncate text-center text-sm font-medium">{ONLINE_PAYMENTS_VERIFICATION_TITLE}</p>
        <p
          className={cn(
            "min-w-[8.5rem] text-right text-xs font-medium",
            badgePresentation.complete && "text-emerald-700 dark:text-emerald-400",
            badgePresentation.status === "hold" && "text-destructive",
            (badgePresentation.status === "pending" || badgePresentation.status === "in_progress") &&
              "text-muted-foreground",
          )}
        >
          {verificationStatusLabel(badgePresentation.status, { complete: badgePresentation.complete })}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto w-full max-w-2xl">
          {onboardingError ? (
            <div className="flex min-h-[12rem] flex-col items-center justify-center gap-3 px-4 text-center">
              <p className="text-sm text-destructive">{onboardingError}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setOnboardingError(null)
                  startLockRef.current = false
                  void startOnboarding()
                }}
              >
                Try again
              </Button>
            </div>
          ) : connectInstance ? (
            <ConnectComponentsProvider connectInstance={connectInstance}>
              <ConnectAccountOnboarding
                onExit={() => void closeOnboardingAndSync()}
                onStepChange={() => setOnboardingFrameReady(true)}
                fullTermsOfServiceUrl={EASNER_STRIPE_CONNECT_TERMS_URL}
                privacyPolicyUrl={EASNER_STRIPE_CONNECT_PRIVACY_URL}
                collectionOptions={connectOnboardingCollectionOptions}
              />
            </ConnectComponentsProvider>
          ) : (
            <div className="flex min-h-[12rem] items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
            </div>
          )}
        </div>
      </div>
    </div>
  )

  if (fullPageFlow) {
    return connectFlowPanel
  }

  if (!status?.enabled || !panelUx) {
    return unavailableFallback ?? null
  }

  const tier3 = BUSINESS_TIER_LADDER.tiers.find((t) => t.tier === 3)

  return (
      <Card className="flex h-full flex-col border-primary/25 md:border-primary/40">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">{tier3?.title ?? "Online payments"}</CardTitle>
            {badgePresentation.complete ? (
              <Tier1VerificationBadge
                tier1Complete={badgePresentation.complete}
                tier1VerificationStatus={badgePresentation.status}
              />
            ) : (
              <ConnectStatusChecklistTooltip
                status={badgePresentation.status}
                complete={badgePresentation.complete}
                summary={panelUx.bodyCopy}
                checklist={panelUx.checklist}
              />
            )}
          </div>
          <CardDescription className="text-sm">
            {tier3?.description ??
              "Accept card payments on invoices. Settled to your Easner balance."}
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-auto space-y-4 pt-0">
          {panelUx?.bodyCopyDestructive ? (
            <p className="text-sm text-destructive">{panelUx.bodyCopyDestructive}</p>
          ) : null}
          {panelUx?.bodyCopy ? (
            <p className="text-sm text-muted-foreground">{panelUx.bodyCopy}</p>
          ) : null}
          {panelUx?.primary || panelUx?.secondary ? (
            <div className="flex flex-wrap gap-2">
              {panelUx?.primary ? (
                panelUx.primary.kind === "link_payout" && !status.hasGridVa ? (
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex">
                          <Button
                            type="button"
                            size="sm"
                            variant={panelUx.primary.variant}
                            disabled
                          >
                            {panelUx.primary.label}
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        Complete business verification and open a virtual account before linking payouts.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant={panelUx.primary.variant}
                    disabled={
                      openingOnboarding ||
                      (panelUx.primary.kind === "link_payout" && linking)
                    }
                    onMouseEnter={() => {
                      if (panelUx.primary?.kind === "open_onboarding") void prefetchClientSecret()
                    }}
                    onFocus={() => {
                      if (panelUx.primary?.kind === "open_onboarding") void prefetchClientSecret()
                    }}
                    onClick={() => runAction(panelUx.primary!)}
                  >
                    {panelUx.primary.kind === "link_payout" && linking ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Linking…
                      </>
                    ) : (
                      panelUx.primary.label
                    )}
                  </Button>
                )
              ) : null}
              {panelUx?.secondary ? (
                <Button
                  type="button"
                  size="sm"
                  variant={panelUx.secondary.variant}
                  disabled={openingOnboarding}
                  onMouseEnter={() => {
                    if (panelUx.secondary?.kind === "open_onboarding") void prefetchClientSecret()
                  }}
                  onFocus={() => {
                    if (panelUx.secondary?.kind === "open_onboarding") void prefetchClientSecret()
                  }}
                  onClick={() => runAction(panelUx.secondary!)}
                >
                  {panelUx.secondary.label}
                </Button>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
  )
}
