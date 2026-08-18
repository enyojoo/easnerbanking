"use client"

import Link from "next/link"
import { AlertCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { useCheckoutSettings } from "@/hooks/use-checkout-settings"
import { COLLECTIONS_COPY } from "@/lib/copy/business-ui-copy"
import { SETTINGS_CONNECT_FLOW_PARAM } from "@/lib/compliance/cutover-comms"

export function CollectionsReadinessBanner() {
  const { onlinePaymentsEnabled, tier1Complete } = useBusinessProfile()
  const { data } = useCheckoutSettings()

  if (onlinePaymentsEnabled === false) {
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

  const ready = data?.readiness.ready === true
  if (ready) return null
  if (!tier1Complete && data == null) return null

  return (
    <Alert>
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{COLLECTIONS_COPY.setupTitle}</AlertTitle>
      <AlertDescription className="space-y-3">
        {data?.readiness.reason ? <p>{data.readiness.reason}</p> : null}
        <Button variant="outline" size="sm" asChild>
          <Link href={`/settings?tab=verification&flow=${SETTINGS_CONNECT_FLOW_PARAM}`}>
            {COLLECTIONS_COPY.setupCta}
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  )
}
