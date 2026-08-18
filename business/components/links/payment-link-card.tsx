"use client"

import { Archive, Copy, Share2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { paymentLinkTypeLabel } from "@/lib/payment-links/types"
import type { PaymentLinkListRow } from "@/hooks/use-payment-links"
import { COLLECTIONS_COPY } from "@/lib/copy/business-ui-copy"
import { formatCurrency } from "@/lib/utils"

export function PaymentLinkCard({
  row,
  onShare,
  onCopy,
  onArchive,
  onOpen,
}: {
  row: PaymentLinkListRow
  onShare: () => void
  onCopy: () => void
  onArchive: () => void
  onOpen: () => void
}) {
  const collected =
    row.totalCollectedCents != null
      ? formatCurrency(row.totalCollectedCents / 100, row.currency)
      : null

  return (
    <article className="flex flex-col gap-3 rounded-lg border p-4">
      <button type="button" className="min-w-0 text-left" onClick={onOpen}>
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-medium text-foreground">{row.label}</p>
          {row.archivedAt ? <Badge variant="secondary">{COLLECTIONS_COPY.chipClosed}</Badge> : null}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{paymentLinkTypeLabel(row)}</p>
        <p className="mt-2 text-sm tabular-nums">{formatCurrency(row.amountCents / 100, row.currency)}</p>
        <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
          {row.url.replace(/^https?:\/\//, "")}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {row.paymentCount} payments
          {collected ? ` · ${collected}` : ""}
        </p>
      </button>
      <div className="flex flex-wrap gap-1">
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1" onClick={onShare}>
          <Share2 className="h-3.5 w-3.5" aria-hidden />
          {COLLECTIONS_COPY.share}
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-8 gap-1" onClick={onCopy}>
          <Copy className="h-3.5 w-3.5" aria-hidden />
          {COLLECTIONS_COPY.copyLink}
        </Button>
        {row.archivedAt ? null : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-destructive"
            onClick={onArchive}
          >
            <Archive className="h-3.5 w-3.5" aria-hidden />
          </Button>
        )}
      </div>
    </article>
  )
}
