"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { loadConnectAndInitialize } from "@stripe/connect-js"
import {
  ConnectAccountOnboarding,
  ConnectComponentsProvider,
} from "@stripe/react-connect-js"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, CreditCard } from "lucide-react"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { SettingsCardHeader } from "@/components/settings/settings-card-header"
import { toast } from "sonner"
import { isStripePublishableConfigured } from "@/lib/stripe/public-enabled"

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

function statusLabel(status: ConnectStatusResponse | null): string {
  if (!status?.connectEnabled) return "Not enabled"
  if (status.ready) return "Ready"
  if (status.externalAccountLinked && !status.ready) return "Almost ready"
  if (status.detailsSubmitted) return "Verification pending"
  if (status.stripeAccountId) return "Onboarding started"
  return "Not started"
}

export function SettingsStripeConnectPanel() {
  const [status, setStatus] = useState<ConnectStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [linking, setLinking] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [connectInstance, setConnectInstance] = useState<ReturnType<
    typeof loadConnectAndInitialize
  > | null>(null)

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

  const startOnboarding = useCallback(async () => {
    if (!publishableKey || !isStripePublishableConfigured()) {
      toast.error("Stripe publishable key is not configured")
      return
    }
    try {
      const instance = loadConnectAndInitialize({
        publishableKey,
        fetchClientSecret,
        appearance: {
          overlays: "dialog",
          variables: {
            colorPrimary: "#0f172a",
          },
        },
      })
      setConnectInstance(instance)
      setShowOnboarding(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start onboarding")
    }
  }, [fetchClientSecret, publishableKey])

  const handleOnboardingExit = useCallback(async () => {
    setShowOnboarding(false)
    await fetchWithSession("/api/business/stripe/connect/sync", { method: "POST" }).catch(() => null)
    const next = await refreshStatus()
    if (next?.detailsSubmitted && !next.externalAccountLinked && next.hasGridVa) {
      toast.message("Verification submitted. Link your virtual account as the payout destination.")
    } else {
      toast.success("Onboarding updated")
    }
  }, [refreshStatus])

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

  const label = useMemo(() => statusLabel(status), [status])

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

  return (
    <Card>
      <CardHeader>
        <SettingsCardHeader
          title={
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Online payments
            </CardTitle>
          }
          description="Complete Stripe verification so invoice payments can settle to your Easner balance via your virtual account."
        />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border p-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-foreground">Status: {label}</p>
              {!status.ready && status.reason ? (
                <p className="mt-1 text-muted-foreground">{status.reason}</p>
              ) : null}
              {status.ready ? (
                <p className="mt-1 text-muted-foreground">
                  Pay online is ready. Customer payments settle to your Grid VA, then appear in your
                  Easner balance.
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
          {!status.ready || !status.detailsSubmitted ? (
            <Button type="button" onClick={() => void startOnboarding()}>
              {status.stripeAccountId ? "Continue verification" : "Start online payment setup"}
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
                void fetchWithSession("/api/business/stripe/connect/sync", { method: "POST" }).then(
                  () => refreshStatus(),
                )
              }
            >
              Refresh status
            </Button>
          ) : null}
        </div>

        {showOnboarding && connectInstance ? (
          <div className="min-h-[420px] rounded-lg border p-2">
            <ConnectComponentsProvider connectInstance={connectInstance}>
              <ConnectAccountOnboarding
                onExit={() => void handleOnboardingExit()}
                collectionOptions={{
                  fields: "eventually_due",
                  futureRequirements: "include",
                }}
              />
            </ConnectComponentsProvider>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
