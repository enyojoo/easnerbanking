"use client"

import Link from "next/link"
import { AlertCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { InvoiceBusinessReadiness } from "@/lib/invoices/invoice-business-readiness"
import { BANNER_COPY, INVOICE_BANNER_COPY } from "@/lib/copy/business-ui-copy"

type Props = {
  readiness: InvoiceBusinessReadiness
  /** When online payments are enabled in settings but Connect is not ready. */
  onlinePaymentsIncomplete?: boolean
}

export function InvoiceBusinessSetupBanner({
  readiness,
  onlinePaymentsIncomplete = false,
}: Props) {
  if (!readiness.ready) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>{BANNER_COPY.invoiceProfileTitle}</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{readiness.message}</p>
          <Button variant="outline" size="sm" asChild>
            <Link href={readiness.settingsHref}>Go to Settings → Business</Link>
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  if (!onlinePaymentsIncomplete) return null

  return (
    <Alert>
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Online payments</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>{INVOICE_BANNER_COPY.onlinePaymentsIncomplete}</p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/settings?tab=verification">{INVOICE_BANNER_COPY.onlinePaymentsCta}</Link>
        </Button>
      </AlertDescription>
    </Alert>
  )
}
