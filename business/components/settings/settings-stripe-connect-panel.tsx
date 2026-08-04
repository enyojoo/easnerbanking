"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { loadConnectAndInitialize } from "@stripe/connect-js"
import {
  ConnectAccountOnboarding,
  ConnectComponentsProvider,
} from "@stripe/react-connect-js"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowLeft, CreditCard, Loader2 } from "lucide-react"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { SettingsCardHeader } from "@/components/settings/settings-card-header"
import { toast } from "sonner"
import { isStripePublishableConfigured } from "@/lib/stripe/public-enabled"
import { cn } from "@/lib/utils"

type ConnectStatusResponse = {
  enabled: boolean
  connectEnabled: boolean
  ready: boolean
  reason?: string | null
  stripeAccountId?: string | null
  onboardingStatus?: string | null
  transfersEnabled?: boolean
  payoutsEnabled?: boolean
  detailsSubmitted?: boolean
  externalAccountLinked?: boolean
  hasGridVa?: boolean
  requirementsCurrentlyDue?: string[]
  payoutDestination?: {
    stripeExternalAccountId: string
    settlementRail?: string | null
    schedule?: Record<string, unknown> | null
  } | null
}

type StatusKind = "ready" | "almost_ready" | "pending" | "in_progress" | "not_started" | "blocked"

function statusMeta(status: ConnectStatusResponse | null): { label: string; kind: StatusKind } {
  if (!status?.connectEnabled) return { label: "Not enabled", kind: "blocked" }
  if (status.ready) return { label: "Ready", kind: "ready" }
  if (status.requirementsCurrentlyDue && status.requirementsCurrentlyDue.length > 0) {
    return { label: "Action required", kind: "blocked" }
  }
  if (status.externalAccountLinked && !status.ready) {
    return { label: "Almost ready", kind: "almost_ready" }
  }
  if (status.detailsSubmitted) return { label: "Verification pending", kind: "pending" }
  if (status.stripeAccountId) return { label: "In progress", kind: "in_progress" }
  return { label: "Not started", kind: "not_started" }
}

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

const flowPanelClass =
  "h-[calc(100dvh-var(--dashboard-sticky-top,4rem)-var(--verification-settings-chrome,14rem))] max-h-[calc(100dvh-var(--dashboard-sticky-top,4rem)-var(--verification-settings-chrome,14rem))]"

export function SettingsStripeConnectPanel() {
  const [status, setStatus] = useState<ConnectStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [linking, setLinking] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [connectInstance, setConnectInstance] = useState<ReturnType<
    typeof loadConnectAndInitialize
  > | null>(null)
  const clearInstanceAfterCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const publishableKey =
    typeof process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY === "string"
      ? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.trim()
      : ""

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetchWithSession("/api/business/stripe/connect/status")
      const json = (await res.json()) as ConnectStatusResponse
      setStatus(json)
      return json
    } catch {
      setStatus(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    return () => {
      if (clearInstanceAfterCloseRef.current) clearTimeout(clearInstanceAfterCloseRef.current)
    }
  }, [])

  useEffect(() => {
    if (onboardingOpen) {
      document.documentElement.dataset.verificationFlowOpen = "true"
      document.querySelector("main")?.scrollTo({ top: 0 })
    } else {
      delete document.documentElement.dataset.verificationFlowOpen
    }
    return () => {
      delete document.documentElement.dataset.verificationFlowOpen
    }
  }, [onboardingOpen])

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

  const closeOnboardingAndSync = useCallback(async () => {
    setOnboardingOpen(false)
    await fetchWithSession("/api/business/stripe/connect/sync", { method: "POST" }).catch(() => null)
    const next = await refreshStatus()
    if (next?.detailsSubmitted && !next.externalAccountLinked && next.hasGridVa) {
      toast.message("Verification submitted. Link your virtual account as the payout destination.")
    } else {
      toast.success("Onboarding updated")
    }
    if (clearInstanceAfterCloseRef.current) clearTimeout(clearInstanceAfterCloseRef.current)
    clearInstanceAfterCloseRef.current = setTimeout(() => {
      setConnectInstance(null)
      clearInstanceAfterCloseRef.current = null
    }, 280)
  }, [refreshStatus])

  const startOnboarding = useCallback(async () => {
    if (!publishableKey || !isStripePublishableConfigured()) {
      toast.error("Stripe publishable key is not configured")
      return
    }
    try {
      if (clearInstanceAfterCloseRef.current) {
        clearTimeout(clearInstanceAfterCloseRef.current)
        clearInstanceAfterCloseRef.current = null
      }
      const instance = loadConnectAndInitialize({
        publishableKey,
        fetchClientSecret,
        appearance: {
          overlays: "none",
          variables: {
            colorPrimary: "#0f172a",
          },
        },
      })
      setConnectInstance(instance)
      setOnboardingOpen(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start onboarding")
    }
  }, [fetchClientSecret, publishableKey])

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

  const meta = useMemo(() => statusMeta(status), [status])
  const requirementsDue = status?.requirementsCurrentlyDue?.length ?? 0
  const showPrimaryOnboardingCta = Boolean(
    status && (!status.ready || requirementsDue > 0),
  )
  const primaryCtaLabel = (() => {
    if (!status) return "Start online payment setup"
    if (status.ready && requirementsDue > 0) return "Manage verification"
    if (requirementsDue > 0 || meta.kind === "blocked") return "Complete requirements"
    if (status.stripeAccountId) return "Continue verification"
    return "Start online payment setup"
  })()

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading online payment setup…
        </CardContent>
      </Card>
    )
  }

  if (!status?.enabled) {
    return null
  }

  const flowPanel = (
    <div
      className={cn("relative flex flex-col overflow-hidden", flowPanelClass)}
      style={{ "--verification-settings-chrome": "14rem" } as CSSProperties}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="absolute left-2 top-2 z-20 h-8 gap-1 bg-background/90 px-2 shadow-sm backdrop-blur-sm hover:bg-background"
        onClick={() => void closeOnboardingAndSync()}
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back
      </Button>
      <div className="relative min-h-0 flex-1 overflow-y-auto px-2 pb-4 pt-12">
        {connectInstance ? (
          <ConnectComponentsProvider connectInstance={connectInstance}>
            <ConnectAccountOnboarding
              onExit={() => void closeOnboardingAndSync()}
              collectionOptions={{
                fields: "eventually_due",
                futureRequirements: "include",
              }}
            />
          </ConnectComponentsProvider>
        ) : (
          <div className="flex size-full min-h-[16rem] flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="size-8 animate-spin" aria-hidden />
            <p className="text-sm">Opening verification…</p>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <Card
      padding={onboardingOpen ? "none" : undefined}
      className={cn(onboardingOpen && cn("overflow-hidden", flowPanelClass))}
      style={
        onboardingOpen
          ? ({ "--verification-settings-chrome": "14rem" } as CSSProperties)
          : undefined
      }
      data-verification-flow={onboardingOpen ? "open" : undefined}
    >
      {onboardingOpen ? (
        flowPanel
      ) : (
        <>
          <CardHeader>
            <SettingsCardHeader
              title={
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Online payments
                  <StripeConnectStatusBadge label={meta.label} kind={meta.kind} />
                </CardTitle>
              }
              description="Complete Stripe verification so invoice payments can settle to your Easner balance via your virtual account."
            />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border p-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  {!status.ready && status.reason ? (
                    <p className="text-muted-foreground">{status.reason}</p>
                  ) : null}
                  {status.ready ? (
                    <p className="text-muted-foreground">
                      Pay online is ready. Customer payments settle to your Grid VA, then appear in
                      your Easner balance.
                    </p>
                  ) : null}
                  {!status.ready && !status.reason && !status.stripeAccountId ? (
                    <p className="text-muted-foreground">
                      Start setup to verify your business with Stripe and enable card payments on
                      invoices.
                    </p>
                  ) : null}
                </div>
              </div>
              <ul className="mt-3 space-y-1 text-muted-foreground">
                <li>Transfers: {status.transfersEnabled ? "active" : "pending"}</li>
                <li>Payouts: {status.payoutsEnabled ? "enabled" : "pending"}</li>
                <li>Virtual account: {status.hasGridVa ? "available" : "required"}</li>
                <li>
                  Payout destination:{" "}
                  {status.externalAccountLinked
                    ? status.payoutDestination?.stripeExternalAccountId || "linked"
                    : "not linked"}
                </li>
              </ul>
            </div>

            <div className="flex flex-wrap gap-2">
              {showPrimaryOnboardingCta ? (
                <Button type="button" onClick={() => void startOnboarding()}>
                  {primaryCtaLabel}
                </Button>
              ) : null}
              {status.detailsSubmitted && !status.externalAccountLinked ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={linking || !status.hasGridVa}
                  onClick={() => void linkPayoutDestination()}
                >
                  {linking ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Linking…
                    </>
                  ) : (
                    "Link Grid VA payout destination"
                  )}
                </Button>
              ) : null}
              {status.stripeAccountId ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    void fetchWithSession("/api/business/stripe/connect/sync", {
                      method: "POST",
                    }).then(() => refreshStatus())
                  }
                >
                  Refresh status
                </Button>
              ) : null}
            </div>
          </CardContent>
        </>
      )}
    </Card>
  )
}
