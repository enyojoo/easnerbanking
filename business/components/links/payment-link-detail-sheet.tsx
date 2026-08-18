"use client"

import Link from "next/link"
import { QRCodeSVG } from "qrcode.react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { paymentLinkTypeLabel } from "@/lib/payment-links/types"
import type { PaymentLinkListRow } from "@/hooks/use-payment-links"
import { COLLECTIONS_COPY } from "@/lib/copy/business-ui-copy"
import { formatCurrency } from "@/lib/utils"

export function PaymentLinkDetailSheet({
  link,
  onOpenChange,
  onShare,
}: {
  link: PaymentLinkListRow | null
  onOpenChange: (open: boolean) => void
  onShare: () => void
}) {
  return (
    <Sheet open={Boolean(link)} onOpenChange={onOpenChange}>
      <SheetContent>
        {link ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{link.label}</SheetTitle>
              <SheetDescription>
                {paymentLinkTypeLabel(link)} · {formatCurrency(link.amountCents / 100, link.currency)}
              </SheetDescription>
            </SheetHeader>
            <div className="mx-auto rounded-xl border bg-card p-3">
              <QRCodeSVG value={link.url} size={160} includeMargin className="mx-auto h-auto" />
            </div>
            <p className="break-all font-mono text-xs text-muted-foreground">{link.url}</p>
            <p className="text-sm text-muted-foreground">
              {link.paymentCount} payments
              {link.totalCollectedCents != null
                ? ` · ${formatCurrency(link.totalCollectedCents / 100, link.currency)}`
                : ""}
            </p>
            <div className="flex flex-col gap-2">
              <Button type="button" onClick={onShare}>
                {COLLECTIONS_COPY.share}
              </Button>
              <Button type="button" variant="outline" asChild>
                <a href={link.url} target="_blank" rel="noopener noreferrer">
                  Preview
                </a>
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href={`/transactions?search=${encodeURIComponent(link.id)}`}>
                  {COLLECTIONS_COPY.viewTransactions}
                </Link>
              </Button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
