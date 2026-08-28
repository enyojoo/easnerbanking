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
import { loadConnectAndInitialize } from "@stripe/connect-js/pure"
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
import { analytics } from "@/lib/analytics"
import { isStripePublishableConfigured } from "@/lib/stripe/public-enabled"
import { easnerStripeConnectAppearance } from "@/lib/stripe/connect-appearance"
import { browserStripeLocale } from "@/lib/stripe/elements-appearance"
import {
  CONNECT_JS_LOAD_ERROR,
  ensureConnectJsLoaded,
  prefetchConnectJs,
} from "@/lib/stripe/load-connect-js"
import { DelayedOpeningVerificationWait } from "@/components/compliance/opening-verification-wait"
import {
  EASNER_STRIPE_CONNECT_PRIVACY_URL,
  EASNER_STRIPE_CONNECT_TERMS_URL,
} from "@/lib/stripe/connect/legal-urls"
import {
  CONNECT_STATUS_UPDATED_EVENT,
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
import { BUSINESS_VERIFICATION_PRODUCTS } from "@/lib/compliance-tier-ladder-copy"
import { Tier1VerificationBadge } from "@/components/compliance/tier1-verification-badge"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { useSuspendIdleLock } from "@/hooks/use-suspend-idle-lock"
import {
  SETTINGS_CONNECT_FLOW_PARAM,
  type SettingsVerificationEmbeddedFlow,
} from "@/lib/compliance/cutover-comms"
import { useSearchParams } from "next/navigation"
import { verificationStatusLabel } from "@easner/shared"
import { VERIFICATION_SECTION_COPY } from "@/lib/copy/business-ui-copy"
import { cn } from "@/lib/utils"

const ONLINE_PAYMENTS_VERIFICATION_TITLE = "Online payments Verification"
const CONNECT_LOAD_TIMEOUT_MS = 30_000
const CONNECT_COMPONENT_LOAD_ERROR =
  "Couldn’t load Stripe verification. Check your connection and try again."
const CONNECT_LOAD_TIMEOUT_ERROR =
  "Stripe verification is taking longer than expected. Check your connection and try again."

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
              compact
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
  const onboardingFrameReadyRef = useRef(false)
  const startGenerationRef = useRef(0)

  // Stripe Connect onboarding is a cross-origin iframe – parent activity listeners
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
    const onLive = (event: Event) => {
      const detail = (event as CustomEvent<ConnectStatusPayload | undefined>).detail
      if (detail) applyStatus(detail)
      else void refreshStatus()
    }
    window.addEventListener(CONNECT_STATUS_UPDATED_EVENT, onLive)
    return () => window.removeEventListener(CONNECT_STATUS_UPDATED_EVENT, onLive)
  }, [applyStatus, refreshStatus])

  useEffect(() => {
    if (status?.ready || !status?.stripeAccountId) return
    const onVis = () => {
      if (document.hidden) return
      void refreshStatus()
    }
    const interval = window.setInterval(() => {
      if (document.hidden) return
      void refreshStatus()
    }, 20_000)
    document.addEventListener("visibilitychange", onVis)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [refreshStatus, status?.ready, status?.stripeAccountId])

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

  const markFrameReady = useCallback(() => {
    onboardingFrameReadyRef.current = true
    setOnboardingFrameReady(true)
  }, [])

  const discardConnectRuntime = useCallback(() => {
    primedConnectInstance = null
    prefetchedConnectClientSecret = null
    onboardingFrameReadyRef.current = false
    setConnectInstance(null)
    setOnboardingFrameReady(false)
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
    prefetchConnectJs()
    if (prefetchedConnectClientSecret || primedConnectInstance) return
    try {
      prefetchedConnectClientSecret = await fetchClientSecret()
    } catch {
      prefetchedConnectClientSecret = null
    }
  }, [fetchClientSecret, tier1Complete])

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
      onboardingFrameReadyRef.current = false
      setConnectInstance(null)
      setOnboardingFrameReady(false)
      setOnboardingError(null)
      prefetchedConnectClientSecret = null
      primedConnectInstance = null
      clearInstanceAfterCloseRef.current = null
    }, 280)
  }, [])

  const closeOnboardingAndSync = useCallback(async () => {
    const sawVerificationUi = onboardingFrameReadyRef.current
    setOnboardingOpen(false)
    startLockRef.current = false
    clearConnectFlowUrl()
    await fetchWithSession("/api/business/stripe/connect/sync", { method: "POST" }).catch(() => null)
    const next = await refreshStatus()
    if (next?.ready) {
      analytics.trackStripeConnectCompleted()
      toast.success("Online payments are ready")
    } else if (next?.externalAccountLinked && next.detailsSubmitted) {
      toast.success("Verification saved. Payout linked – finishing setup.")
    } else if (next?.detailsSubmitted && next.hasGridVa && !next.externalAccountLinked) {
      toast.message("Verification saved. Tap Link payout to connect your virtual account.")
    } else if (sawVerificationUi) {
      toast.success("Verification updated")
    }
    clearConnectInstance()
  }, [clearConnectFlowUrl, clearConnectInstance, refreshStatus])

  const failOnboardingLoad = useCallback(
    (error: unknown, fallback: string) => {
      startGenerationRef.current += 1
      startLockRef.current = false
      discardConnectRuntime()
      const raw =
        error instanceof Error
          ? error.message
          : typeof error === "object" &&
              error &&
              "message" in error &&
              typeof (error as { message?: unknown }).message === "string"
            ? (error as { message: string }).message
            : ""
      const message =
        raw === CONNECT_JS_LOAD_ERROR || raw.includes("Connect.js")
          ? CONNECT_COMPONENT_LOAD_ERROR
          : fallback === CONNECT_LOAD_TIMEOUT_ERROR || fallback === CONNECT_COMPONENT_LOAD_ERROR
            ? fallback
            : raw || fallback
      setOnboardingError(message)
      setOnboardingOpen(true)
      analytics.trackError("Failed to load Stripe Connect verification component", {
        reason: raw || fallback,
      })
    },
    [discardConnectRuntime],
  )

  const startOnboarding = useCallback(async () => {
    if (!tier1Complete) {
      toast.message(VERIFICATION_SECTION_COPY.onlinePaymentsTier1Required)
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
    const generation = ++startGenerationRef.current
    try {
      startLockRef.current = true
      if (clearInstanceAfterCloseRef.current) {
        clearTimeout(clearInstanceAfterCloseRef.current)
        clearInstanceAfterCloseRef.current = null
      }
      setOpeningOnboarding(true)
      setOnboardingError(null)
      onboardingFrameReadyRef.current = false
      setOnboardingFrameReady(false)
      setOnboardingOpen(true)
      await ensureConnectJsLoaded()
      if (generation !== startGenerationRef.current) return
      if (!prefetchedConnectClientSecret && !primedConnectInstance) {
        prefetchedConnectClientSecret = await fetchClientSecret()
      }
      if (generation !== startGenerationRef.current) return
      const instance = createConnectInstance()
      setConnectInstance(instance)
    } catch (e) {
      if (generation !== startGenerationRef.current) return
      failOnboardingLoad(e, "Could not start onboarding")
    } finally {
      if (generation === startGenerationRef.current) {
        setOpeningOnboarding(false)
      }
    }
  }, [createConnectInstance, failOnboardingLoad, fetchClientSecret, publishableKey, tier1Complete])

  const openConnectFlow = useCallback(() => {
    if (!tier1Complete) {
      toast.message(VERIFICATION_SECTION_COPY.onlinePaymentsTier1Required)
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
    if (!onboardingOpen || onboardingFrameReady || onboardingError) return
    const timeoutId = window.setTimeout(() => {
      failOnboardingLoad(new Error("connect_component_timeout"), CONNECT_LOAD_TIMEOUT_ERROR)
    }, CONNECT_LOAD_TIMEOUT_MS)
    return () => window.clearTimeout(timeoutId)
  }, [failOnboardingLoad, onboardingError, onboardingFrameReady, onboardingOpen])

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
                  discardConnectRuntime()
                  void startOnboarding()
                }}
              >
                Try again
              </Button>
            </div>
          ) : (
            <div className="relative min-h-[16rem]">
              {connectInstance ? (
                <ConnectComponentsProvider connectInstance={connectInstance}>
                  <ConnectAccountOnboarding
                    onExit={() => void closeOnboardingAndSync()}
                    onLoaderStart={markFrameReady}
                    onLoadError={({ error }) => {
                      failOnboardingLoad(error, CONNECT_COMPONENT_LOAD_ERROR)
                    }}
                    onStepChange={markFrameReady}
                    fullTermsOfServiceUrl={EASNER_STRIPE_CONNECT_TERMS_URL}
                    privacyPolicyUrl={EASNER_STRIPE_CONNECT_PRIVACY_URL}
                    collectionOptions={connectOnboardingCollectionOptions}
                  />
                </ConnectComponentsProvider>
              ) : null}
              {!onboardingFrameReady ? (
                <div className="absolute inset-0 z-10 bg-background">
                  <DelayedOpeningVerificationWait />
                </div>
              ) : null}
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

  const onlinePayments = BUSINESS_VERIFICATION_PRODUCTS.find((t) => t.id === "online_payments")

  return (
      <Card className="flex h-full flex-col gap-3 border-primary/25 py-4 md:border-primary/40">
        <CardHeader className="gap-1.5 px-4 pb-0 md:px-4">
          <div className="flex flex-nowrap items-center gap-1.5">
            <CardTitle className="min-w-0 text-base leading-tight">
              {onlinePayments?.title ?? "Online payments"}
            </CardTitle>
            {badgePresentation.complete ? (
              <Tier1VerificationBadge
                compact
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
            {onlinePayments?.description ??
              "Accept card payments on checkout, links and invoices."}
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-auto space-y-3 px-4 pt-0 md:px-4">
          {panelUx?.bodyCopyDestructive ? (
            <p className="text-xs text-destructive">{panelUx.bodyCopyDestructive}</p>
          ) : null}
          {panelUx?.bodyCopy ? (
            <p className="text-xs text-muted-foreground">{panelUx.bodyCopy}</p>
          ) : null}
          {panelUx?.primary || panelUx?.secondary ? (
            <div className="flex flex-wrap gap-2">
              {panelUx?.primary ? (
                panelUx.primary.disabled ||
                (panelUx.primary.kind === "link_payout" && !status.hasGridVa) ? (
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
                        {panelUx.primary.disabledReason ||
                          "Complete business verification and open a virtual account before linking payouts."}
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
