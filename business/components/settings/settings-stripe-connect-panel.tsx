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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Check, Circle, Loader2 } from "lucide-react"
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
  resolveConnectPanelUx,
  type ConnectPanelAction,
  type ConnectStatusSnapshot,
} from "@/lib/stripe/connect-panel-ux"
import { BUSINESS_TIER_LADDER } from "@/lib/compliance-tier-ladder-copy"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { useSuspendIdleLock } from "@/hooks/use-suspend-idle-lock"

type StatusKind = "ready" | "almost_ready" | "pending" | "in_progress" | "not_started" | "blocked"

function StripeConnectStatusBadge({
  label,
  kind,
}: {
  label: string
  kind: StatusKind
}) {
  if (kind === "ready") {
    return (
      <Badge className="shrink-0 border-transparent bg-success font-medium text-success-foreground hover:bg-success text-xs">
        {label}
      </Badge>
    )
  }
  if (kind === "blocked") {
    return (
      <Badge variant="destructive" className="shrink-0 font-medium text-xs">
        {label}
      </Badge>
    )
  }
  if (kind === "pending" || kind === "almost_ready" || kind === "in_progress") {
    return (
      <Badge variant="secondary" className="shrink-0 font-medium text-xs">
        {label}
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="shrink-0 font-medium text-muted-foreground text-xs">
      {label}
    </Badge>
  )
}

function ConnectStatusChecklistTooltip({
  label,
  kind,
  summary,
  checklist,
}: {
  label: string
  kind: StatusKind
  summary?: string | null
  checklist: Array<{ label: string; done: boolean }>
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex cursor-default rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`${label}. Show setup checklist.`}
          >
            <StripeConnectStatusBadge label={label} kind={kind} />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="end"
          collisionPadding={16}
          className="max-w-[min(17.5rem,calc(100vw-2rem))] space-y-2 p-3"
        >
          {summary ? <p className="text-xs leading-snug text-popover-foreground">{summary}</p> : null}
          {checklist.length > 0 ? (
            <ul className="space-y-1.5">
              {checklist.map((item) => (
                <li key={item.label} className="flex items-start gap-2 text-xs">
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

const connectDialogContentClass =
  "flex h-[min(94vh,52rem)] w-[min(calc(100vw-1.5rem),56rem)] max-w-none flex-col gap-0 overflow-hidden p-0 duration-300 data-[state=open]:duration-300 data-[state=closed]:duration-300 sm:max-w-[min(calc(100vw-1.5rem),56rem)]"

const connectOnboardingCollectionOptions = {
  fields: "eventually_due" as const,
  futureRequirements: "include" as const,
  requirements: {
    exclude: ["tos_acceptance.*"],
  },
}

export function SettingsStripeConnectPanel({
  unavailableFallback = null,
}: {
  /** Rendered when Connect is not enabled for this business/environment. */
  unavailableFallback?: ReactNode
} = {}) {
  const { businessId } = useBusinessProfile()
  const [status, setStatus] = useState<ConnectStatusPayload | null>(() => initialConnectStatus())
  const [linking, setLinking] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [onboardingLoading, setOnboardingLoading] = useState(false)
  const [dialogCopy, setDialogCopy] = useState({ title: "", description: "" })
  const [connectInstance, setConnectInstance] = useState<ReturnType<
    typeof loadConnectAndInitialize
  > | null>(null)
  const clearInstanceAfterCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Stripe Connect onboarding is a cross-origin iframe — parent activity listeners
  // never see typing/clicks. Suspend idle PIN lock for the duration of the dialog.
  useSuspendIdleLock(onboardingOpen)

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

  const clearConnectInstance = useCallback(() => {
    if (clearInstanceAfterCloseRef.current) clearTimeout(clearInstanceAfterCloseRef.current)
    clearInstanceAfterCloseRef.current = setTimeout(() => {
      setConnectInstance(null)
      setOnboardingLoading(false)
      clearInstanceAfterCloseRef.current = null
    }, 280)
  }, [])

  const closeOnboardingAndSync = useCallback(async () => {
    setOnboardingOpen(false)
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
  }, [clearConnectInstance, refreshStatus])

  const handleDialogOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        if (clearInstanceAfterCloseRef.current) {
          clearTimeout(clearInstanceAfterCloseRef.current)
          clearInstanceAfterCloseRef.current = null
        }
        setOnboardingOpen(true)
        return
      }
      setOnboardingOpen(false)
      void fetchWithSession("/api/business/stripe/connect/sync", { method: "POST" })
        .catch(() => null)
        .then(() => refreshStatus())
      clearConnectInstance()
    },
    [clearConnectInstance, refreshStatus],
  )

  const startOnboarding = useCallback(
    async (copy: { title: string; description: string }) => {
      if (!publishableKey || !isStripePublishableConfigured()) {
        toast.error("Online payments are not available yet")
        return
      }
      try {
        if (clearInstanceAfterCloseRef.current) {
          clearTimeout(clearInstanceAfterCloseRef.current)
          clearInstanceAfterCloseRef.current = null
        }
        setDialogCopy(copy)
        setOnboardingLoading(true)
        setOnboardingOpen(true)
        const instance = loadConnectAndInitialize({
          publishableKey,
          fetchClientSecret,
          locale: browserStripeLocale(),
          appearance: easnerStripeConnectAppearance(),
        })
        setConnectInstance(instance)
        setOnboardingLoading(false)
      } catch (e) {
        setOnboardingOpen(false)
        setOnboardingLoading(false)
        toast.error(e instanceof Error ? e.message : "Could not start onboarding")
      }
    },
    [fetchClientSecret, publishableKey],
  )

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

  const panelUx = useMemo(() => {
    if (!status) return null
    if (!status.connectEnabled) {
      return {
        phase: "disabled" as const,
        badgeLabel: "Not enabled",
        badgeKind: "blocked" as const,
        summary: "Online payments are not enabled.",
        checklist: [],
      }
    }
    return resolveConnectPanelUx(status as ConnectStatusSnapshot)
  }, [status])

  const runAction = useCallback(
    (action: ConnectPanelAction) => {
      if (!panelUx) return
      if (action.kind === "link_payout") {
        void linkPayoutDestination()
        return
      }
      void startOnboarding({
        title: action.dialogTitle,
        description: action.dialogDescription ?? "",
      })
    },
    [linkPayoutDestination, panelUx, startOnboarding],
  )

  if (!status?.enabled || !panelUx) {
    return unavailableFallback ?? null
  }

  const tier3 = BUSINESS_TIER_LADDER.tiers.find((t) => t.tier === 3)
  const tooltipSummary =
    (!status.ready && status.reason && panelUx.phase !== "requirements_due"
      ? status.reason
      : null) ||
    panelUx.summary ||
    null

  return (
    <>
      <Card className="flex h-full flex-col">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">{tier3?.title ?? "Online payments"}</CardTitle>
            <ConnectStatusChecklistTooltip
              label={panelUx.badgeLabel}
              kind={panelUx.badgeKind}
              summary={tooltipSummary}
              checklist={panelUx.checklist}
            />
          </div>
          <CardDescription className="text-sm">
            {tier3?.description ??
              "Accept card payments on invoices. Settled to your Easner balance."}
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-auto space-y-3 pt-0">
          {panelUx.primary || panelUx.secondary ? (
            <div className="flex flex-wrap gap-2">
              {panelUx.primary ? (
                <Button
                  type="button"
                  size="sm"
                  variant={panelUx.primary.variant}
                  disabled={panelUx.primary.kind === "link_payout" && (linking || !status.hasGridVa)}
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
              ) : null}
              {panelUx.secondary ? (
                <Button
                  type="button"
                  size="sm"
                  variant={panelUx.secondary.variant}
                  onClick={() => runAction(panelUx.secondary!)}
                >
                  {panelUx.secondary.label}
                </Button>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={onboardingOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent showCloseButton className={connectDialogContentClass}>
          <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12">
            <DialogTitle className="text-left text-base leading-snug sm:text-lg">
              {dialogCopy.title || "Verification"}
            </DialogTitle>
            {dialogCopy.description ? (
              <DialogDescription className="pt-1">{dialogCopy.description}</DialogDescription>
            ) : null}
          </DialogHeader>
          <div className="relative min-h-0 flex-1 overflow-y-auto bg-[#faf9f6] px-4 pb-6 pt-2">
            {onboardingLoading || !connectInstance ? (
              <div className="flex size-full min-h-[16rem] flex-col items-center justify-center gap-3 text-muted-foreground">
                <Loader2 className="size-8 animate-spin" aria-hidden />
                <p className="text-sm">Opening verification…</p>
              </div>
            ) : (
              <ConnectComponentsProvider connectInstance={connectInstance}>
                <ConnectAccountOnboarding
                  onExit={() => void closeOnboardingAndSync()}
                  fullTermsOfServiceUrl={EASNER_STRIPE_CONNECT_TERMS_URL}
                  privacyPolicyUrl={EASNER_STRIPE_CONNECT_PRIVACY_URL}
                  collectionOptions={connectOnboardingCollectionOptions}
                />
              </ConnectComponentsProvider>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
