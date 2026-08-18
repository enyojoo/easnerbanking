"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useBusinessProfile } from "@/lib/use-business-profile"
import {
  fetchAndCacheConnectStatus,
  readCachedConnectStatus,
  type ConnectStatusPayload,
} from "@/lib/stripe/connect-status-cache"
import {
  connectSetupChecklist,
  labelConnectRequirement,
  resolveConnectPanelPhase,
} from "@/lib/stripe/connect-panel-ux"
import { SettingsCardHeader } from "@/components/settings/settings-card-header"
import { PAYMENTS_SETTINGS_COPY } from "@/lib/copy/business-ui-copy"

function formatPayoutSchedule(schedule: Record<string, unknown> | null | undefined): string {
  if (!schedule || typeof schedule !== "object") return "Daily"
  const interval = String(schedule.interval ?? "daily").toLowerCase()
  if (interval === "daily") return "Daily"
  if (interval === "weekly") return "Weekly"
  if (interval === "monthly") return "Monthly"
  return interval.charAt(0).toUpperCase() + interval.slice(1)
}

function formatLastSynced(iso: string | null | undefined): string | null {
  if (!iso) return null
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso))
  } catch {
    return null
  }
}

type ExtendedConnectStatus = ConnectStatusPayload & {
  requirementsSnapshot?: unknown
  capabilities?: unknown
  lastSyncedAt?: string | null
  payoutDestination?: {
    last4?: string | null
    bankName?: string | null
    schedule?: Record<string, unknown> | null
  } | null
}

export function PaymentsConnectionStatusCard() {
  const { businessId, onlinePaymentsEnabled } = useBusinessProfile()
  const [status, setStatus] = useState<ExtendedConnectStatus | null>(() => {
    const cached = readCachedConnectStatus(businessId)
    return cached ? { ...cached } : null
  })
  const [loading, setLoading] = useState(!status)

  useEffect(() => {
    if (!businessId || onlinePaymentsEnabled === false) {
      setLoading(false)
      return
    }
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const res = await fetchAndCacheConnectStatus(businessId)
        if (!cancelled && res) setStatus(res as ExtendedConnectStatus)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [businessId, onlinePaymentsEnabled])

  const checklist = useMemo(
    () => (status ? connectSetupChecklist(status) : []),
    [status],
  )

  const phase = status ? resolveConnectPanelPhase(status) : null
  const payout = status?.payoutDestination
  const lastSynced = formatLastSynced(status?.lastSyncedAt ?? null)

  if (onlinePaymentsEnabled === false) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <SettingsCardHeader
          title={<CardTitle>{PAYMENTS_SETTINGS_COPY.payoutTitle}</CardTitle>}
          description={PAYMENTS_SETTINGS_COPY.payoutIntro}
        />
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {loading && !status ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading connection status…
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <p className="font-medium text-foreground">{PAYMENTS_SETTINGS_COPY.payoutDestination}</p>
              <p className="text-muted-foreground">{PAYMENTS_SETTINGS_COPY.payoutDestinationDetail}</p>
            </div>

            {payout?.last4 ? (
              <div className="space-y-1">
                <p className="font-medium text-foreground">{PAYMENTS_SETTINGS_COPY.payoutAccount}</p>
                <p className="text-muted-foreground">
                  {[payout.bankName, payout.last4 ? `••••${payout.last4}` : null]
                    .filter(Boolean)
                    .join(" · ")}{" "}
                  · {formatPayoutSchedule(payout.schedule ?? null)}
                </p>
              </div>
            ) : phase !== "ready" ? (
              <p className="text-muted-foreground">{PAYMENTS_SETTINGS_COPY.payoutPending}</p>
            ) : null}

            {status && !status.ready && checklist.length > 0 ? (
              <details className="rounded-lg border bg-muted/30 p-3">
                <summary className="cursor-pointer font-medium text-foreground">
                  {PAYMENTS_SETTINGS_COPY.requirementsSummary}
                </summary>
                <ul className="mt-3 space-y-1.5 text-muted-foreground">
                  {checklist.map((item) => (
                    <li key={item.label} className="flex items-center gap-2">
                      <span aria-hidden>{item.done ? "✓" : "○"}</span>
                      {item.label}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}

            {status?.requirementsCurrentlyDue && status.requirementsCurrentlyDue.length > 0 ? (
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer font-medium text-foreground">
                  {PAYMENTS_SETTINGS_COPY.openRequirements}
                </summary>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-muted-foreground">
                  {status.requirementsCurrentlyDue.map((key) => (
                    <li key={key}>{labelConnectRequirement(key)}</li>
                  ))}
                </ul>
              </details>
            ) : null}

            {lastSynced ? (
              <p className="text-xs text-muted-foreground">
                {PAYMENTS_SETTINGS_COPY.lastSynced} {lastSynced}
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
