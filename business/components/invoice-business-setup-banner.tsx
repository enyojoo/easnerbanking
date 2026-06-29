"use client"

import Link from "next/link"
import { AlertCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { InvoiceBusinessReadiness } from "@/lib/invoices/invoice-business-readiness"

type Props = {
  readiness: InvoiceBusinessReadiness
}

export function InvoiceBusinessSetupBanner({ readiness }: Props) {
  if (readiness.ready) return null

  return (
    <Alert>
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Complete business profile to invoice</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>{readiness.message}</p>
        <Button variant="outline" size="sm" asChild>
          <Link href={readiness.settingsHref}>Go to Settings → Business</Link>
        </Button>
      </AlertDescription>
    </Alert>
  )
}
