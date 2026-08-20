"use client"

import Link from "next/link"
import { AlertCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { useLiveConnectStatus } from "@/lib/stripe/use-live-connect-status"
import { resolveConnectPanelPhase } from "@/lib/stripe/connect-panel-ux"
import { COLLECTIONS_COPY, INVOICE_BANNER_COPY, VERIFICATION_SECTION_COPY } from "@/lib/copy/business-ui-copy"
import { SETTINGS_VERIFICATION_HREF } from "@/lib/compliance/cutover-comms"

/**
 * Same data path as invoices: profile + cached Connect status, so the banner
 * paints with the page instead of waiting on checkout settings refetch.
 * CTA opens the Verification tab hub, not hosted KYB / Connect flow.
 */
export function CollectionsReadinessBanner() {
  const profile = useBusinessProfile()
  const liveConnect = useLiveConnectStatus(profile.businessId)

  if (!profile.hasData || profile.isLoading) return null

  if (profile.onlinePaymentsEnabled === false) {
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

  const connectIncomplete = liveConnect
    ? resolveConnectPanelPhase(liveConnect) !== "ready"
    : !profile.tier1Complete

  if (!connectIncomplete) return null
  if (!liveConnect && profile.tier1Complete) return null

  const reason =
    liveConnect?.reason?.trim() ||
    (!profile.tier1Complete ? VERIFICATION_SECTION_COPY.onlinePaymentsTier1Required : null)

  return (
    <Alert>
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{COLLECTIONS_COPY.setupTitle}</AlertTitle>
      <AlertDescription className="space-y-3">
        {reason ? <p>{reason}</p> : <p>{INVOICE_BANNER_COPY.onlinePaymentsIncomplete}</p>}
        <Button variant="outline" size="sm" asChild>
          <Link href={SETTINGS_VERIFICATION_HREF}>{INVOICE_BANNER_COPY.onlinePaymentsCta}</Link>
        </Button>
      </AlertDescription>
    </Alert>
  )
}
