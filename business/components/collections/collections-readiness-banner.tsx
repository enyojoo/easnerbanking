"use client"

import Link from "next/link"
import { useIsRestoring } from "@tanstack/react-query"
import { AlertCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useCheckoutSettingsQuery } from "@/hooks/queries/use-checkout-settings-query"
import { COLLECTIONS_COPY } from "@/lib/copy/business-ui-copy"
import { SETTINGS_CONNECT_FLOW_PARAM } from "@/lib/compliance/cutover-comms"

function isKybReason(reason: string | null | undefined): boolean {
  return Boolean(reason?.toLowerCase().includes("business verification"))
}

/**
 * Operator warning for card/bank collection. Never flash from empty/stale cache:
 * hide until a fetch after mount confirms the gap; persisted "ready" hides immediately.
 */
export function CollectionsReadinessBanner() {
  const query = useCheckoutSettingsQuery()
  const isRestoring = useIsRestoring()
  const data = query.data ?? null

  if (isRestoring && !data) return null
  if (query.isPending && !data) return null

  const paymentsOn = data?.settings.onlinePaymentsEnabled !== false
  if (data?.readiness.ready === true && paymentsOn) return null

  if (!query.isFetchedAfterMount || !data) return null

  if (data.settings.onlinePaymentsEnabled === false) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>{COLLECTIONS_COPY.masterOffTitle}</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{COLLECTIONS_COPY.masterOffBody}</p>
          <Button variant="outline" size="sm" asChild>
            <Link href="/settings?tab=payments">{COLLECTIONS_COPY.masterOffCta}</Link>
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  if (data.readiness.ready) return null

  const kyb = isKybReason(data.readiness.reason)
  const href = kyb
    ? `/settings?tab=verification&flow=${SETTINGS_CONNECT_FLOW_PARAM}`
    : "/settings?tab=payments"
  const cta = kyb ? COLLECTIONS_COPY.setupCta : COLLECTIONS_COPY.masterOffCta

  return (
    <Alert>
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{COLLECTIONS_COPY.setupTitle}</AlertTitle>
      <AlertDescription className="space-y-3">
        {data.readiness.reason ? <p>{data.readiness.reason}</p> : null}
        <Button variant="outline" size="sm" asChild>
          <Link href={href}>{cta}</Link>
        </Button>
      </AlertDescription>
    </Alert>
  )
}
