"use client"

import { Check } from "lucide-react"
import { InvoiceCustomerViewPage } from "@/components/invoice/invoice-customer-view-page"
import { CustomerPayShell } from "@/components/pay/customer-pay-shell"
import { PaymentLinkPayPanel } from "@/components/pay/payment-link-pay-panel"
import { resolveCustomerPublicKind } from "@/lib/customer-public-path"

function PayThanks() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
        <Check className="h-7 w-7 text-primary" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="text-lg font-semibold text-foreground">Payment complete</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Thank you. The business has been notified and a receipt is on its way to your email.
        </p>
      </div>
    </div>
  )
}

export function CustomerPublicView({
  parts,
  hostname,
}: {
  parts: string[]
  hostname?: string | null
}) {
  const host =
    typeof window !== "undefined" ? window.location.hostname : hostname ?? null
  const kind = resolveCustomerPublicKind(host, parts)

  if (kind === "invoice") {
    return (
      <div className="flex min-h-screen flex-col overflow-y-auto bg-background">
        <main className="flex min-h-0 w-full flex-1 flex-col items-center justify-start px-4 py-6 pb-12 sm:px-6 sm:py-8">
          <InvoiceCustomerViewPage key={parts.join("/")} mode="public" slugParts={parts} />
        </main>
      </div>
    )
  }

  if (kind === "pay_thanks") {
    return (
      <CustomerPayShell>
        <PayThanks />
      </CustomerPayShell>
    )
  }

  if (kind === "pay") {
    return (
      <CustomerPayShell>
        <PaymentLinkPayPanel key={parts.join("/")} slugParts={parts} />
      </CustomerPayShell>
    )
  }

  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4 py-16 text-center">
      <p className="text-sm text-muted-foreground">This page is not available.</p>
    </div>
  )
}
