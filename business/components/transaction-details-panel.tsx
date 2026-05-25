"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import type { Transaction } from "@/lib/finance-types"
import { formatCurrency } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Copy, Check, Download, FileText, Activity } from "lucide-react"
import { downloadTransactionReceiptPdf } from "@/lib/use-transaction-receipt-pdf"
import { currentLocationPath, withReturnTo } from "@/lib/invoice-navigation"
import { Card, CardContent } from "@/components/ui/card"
import { transactionWebDetailPath } from "@/lib/easner-transaction-id"
import { TransactionLifecycleTracker } from "@/components/transactions/transaction-lifecycle-tracker"
import { TransactionDetailHero } from "@/components/transactions/transaction-detail-hero"
import { PayoutReviewDetailsRows } from "@/components/transactions/payout-review-details-rows"

export interface TransactionDetailsPanelProps {
  transaction: Transaction | null
  /** When true, omit "Track status" (e.g. already on full-page `/transactions/[etid]`). */
  omitTrackStatus?: boolean
}

function TransactionDetailActions({
  transaction,
  omitTrackStatus,
  txHere,
  etidForLink,
  showLifecycleTracker,
  downloadingReceipt,
  onDownloadReceipt,
}: {
  transaction: Transaction
  omitTrackStatus: boolean
  txHere: string
  etidForLink: string
  showLifecycleTracker: boolean
  downloadingReceipt: boolean
  onDownloadReceipt: () => void
}) {
  return (
    <Card className="border-border shadow-sm">
      <CardContent className="space-y-2 p-6">
        {transaction.invoiceId ? (
          <Button variant="outline" className="w-full gap-2 bg-transparent" asChild>
            <Link href={withReturnTo(`/invoices/${transaction.invoiceId}`, txHere)}>
              <FileText className="h-4 w-4" />
              View invoice
            </Link>
          </Button>
        ) : null}
        {!omitTrackStatus &&
          !showLifecycleTracker &&
          (transaction.transferId || transaction.id.startsWith("ETID")) &&
          (transaction.status === "pending" || transaction.status === "processing") && (
            <Button variant="outline" className="w-full gap-2 bg-transparent" asChild>
              <Link href={etidForLink}>
                <Activity className="h-4 w-4" />
                Track status
              </Link>
            </Button>
          )}
        {transaction.status === "completed" ? (
          <Button
            variant="outline"
            className="w-full gap-2 bg-transparent"
            type="button"
            onClick={onDownloadReceipt}
            disabled={downloadingReceipt}
          >
            <Download className="h-4 w-4" />
            {downloadingReceipt ? "Downloading..." : "Download Receipt"}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function TransactionDetailsPanel({
  transaction,
  omitTrackStatus = false,
}: TransactionDetailsPanelProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const txHere = currentLocationPath(pathname, searchParams)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [downloadingReceipt, setDownloadingReceipt] = useState(false)

  if (!transaction) return null

  const cardLast4 = transaction.cardLast4
  const descLower = transaction.description.toLowerCase()
  const isStablecoin =
    transaction.type === "stablecoin" ||
    descLower.startsWith("stablecoin") ||
    String(transaction.collectionChannel ?? "").toLowerCase() === "autopayout"
  const isBank =
    !isStablecoin &&
    (transaction.type === "book" || transaction.type === "ach" || transaction.type === "wire") &&
    Boolean(transaction.paymentRail)
  const isCard = Boolean(cardLast4) || transaction.type === "card"
  const partyLabel = transaction.direction === "credit" ? "Sender" : "Recipient"
  const isGlobalPayout = Boolean(transaction.payoutReview)
  const showLifecycleTracker = Boolean(transaction.lifecycle?.length)

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 2000)
    } catch {
      // ignore
    }
  }

  const handleDownloadReceipt = async () => {
    setDownloadingReceipt(true)
    try {
      await downloadTransactionReceiptPdf(transaction, cardLast4)
    } finally {
      setDownloadingReceipt(false)
    }
  }

  const etidForLink = transactionWebDetailPath(transaction.id)
  const displayCurrency = transaction.postedCurrency || transaction.displayCurrency || "USD"

  if (isGlobalPayout && transaction.payoutReview) {
    return (
      <div className="space-y-4">
        <TransactionDetailHero transaction={transaction} />
        <PayoutReviewDetailsRows
          transactionId={transaction.id}
          payoutReview={transaction.payoutReview}
          recipientSnapshot={transaction.recipientSnapshot}
          sendNote={transaction.sendNote}
          copiedKey={copiedKey}
          onCopy={handleCopy}
        />
        {showLifecycleTracker && transaction.lifecycle ? (
          <Card className="border-border shadow-sm">
            <CardContent className="p-6">
              <TransactionLifecycleTracker
                lifecycle={transaction.lifecycle}
                title="Transfer status"
              />
            </CardContent>
          </Card>
        ) : null}
        <TransactionDetailActions
          transaction={transaction}
          omitTrackStatus={omitTrackStatus}
          txHere={txHere}
          etidForLink={etidForLink}
          showLifecycleTracker={showLifecycleTracker}
          downloadingReceipt={downloadingReceipt}
          onDownloadReceipt={handleDownloadReceipt}
        />
      </div>
    )
  }

  return (
    <Card className="border-border shadow-sm">
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center justify-between border-b pb-4">
          <div>
            <p className="text-sm text-muted-foreground">Amount</p>
            <p
              className={`text-2xl font-semibold tabular-nums ${transaction.direction === "credit" ? "text-primary" : "text-foreground"}`}
            >
              {transaction.direction === "credit" ? "+" : "-"}
              {formatCurrency(Math.abs(transaction.amount), transaction.displayCurrency || "USD")}
            </p>
          </div>
          <Badge
            variant={
              transaction.status === "completed"
                ? "default"
                : transaction.status === "pending" || transaction.status === "processing"
                  ? "secondary"
                  : "destructive"
            }
            className="capitalize"
          >
            {transaction.status}
          </Badge>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between gap-4 text-sm">
            <span className="shrink-0 text-muted-foreground">What</span>
            <span className="text-right font-medium">{transaction.description}</span>
          </div>

          <div className="flex justify-between gap-4 text-sm">
            <span className="shrink-0 text-muted-foreground">Transaction ID</span>
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-medium">{transaction.id}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                type="button"
                onClick={() => handleCopy(transaction.id, "transactionId")}
              >
                {copiedKey === "transactionId" ? (
                  <Check className="h-3 w-3 text-primary" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </div>
          </div>

          {transaction.paymentScheme ? (
            <div className="flex justify-between gap-4 text-sm">
              <span className="shrink-0 text-muted-foreground">Scheme</span>
              <span className="text-right font-medium">{transaction.paymentScheme}</span>
            </div>
          ) : null}

          <div className="flex justify-between gap-4 text-sm">
            <span className="shrink-0 text-muted-foreground">When</span>
            <span className="text-right font-medium">
              {new Date(transaction.date).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>

          {isCard && cardLast4 ? (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Card</span>
              <span className="font-medium">•••• {cardLast4}</span>
            </div>
          ) : transaction.category ? (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Category</span>
              <span className="font-medium">{transaction.category}</span>
            </div>
          ) : null}

          {isBank && transaction.paymentRail ? (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Payment Rail</span>
              <span className="font-medium">{transaction.paymentRail.toUpperCase()}</span>
            </div>
          ) : null}

          {(isBank || isStablecoin || isCard) &&
          transaction.counterpartyName &&
          !showLifecycleTracker ? (
            <div className="flex justify-between gap-4 text-sm">
              <span className="shrink-0 text-muted-foreground">{partyLabel}</span>
              <span className="text-right font-medium">{transaction.counterpartyName}</span>
            </div>
          ) : null}

          {transaction.sendNote ? (
            <div className="flex justify-between gap-4 text-sm">
              <span className="shrink-0 text-muted-foreground">Note</span>
              <span className="text-right font-medium">{transaction.sendNote}</span>
            </div>
          ) : null}

          {transaction.fee !== undefined && transaction.fee > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Fee</span>
              <span className="font-medium">
                {formatCurrency(transaction.fee, transaction.displayCurrency || "USD")}
              </span>
            </div>
          )}

          {showLifecycleTracker && transaction.narration ? (
            <div className="flex justify-between gap-4 text-sm">
              <span className="shrink-0 text-muted-foreground">Narration</span>
              <span className="text-right font-medium">{transaction.narration}</span>
            </div>
          ) : null}

          {showLifecycleTracker &&
          transaction.postedAmount != null &&
          transaction.postedAmount > 0 ? (
            <div className="flex justify-between gap-4 text-sm">
              <span className="shrink-0 text-muted-foreground">Amount credited</span>
              <span className="text-right font-medium">
                {formatCurrency(transaction.postedAmount, displayCurrency)}
              </span>
            </div>
          ) : null}
        </div>

        {showLifecycleTracker && transaction.lifecycle ? (
          <div className="border-t pt-4">
            <TransactionLifecycleTracker lifecycle={transaction.lifecycle} />
          </div>
        ) : null}

        {transaction.collectionChannel === "autopayout" && transaction.autopayoutConfigId ? (
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-3 text-sm">
            <p className="font-medium text-foreground">QR Pay</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Collected via an in-person placard linked to your QR Pay configuration.
            </p>
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              Config: {transaction.autopayoutConfigId}
            </p>
            <Button variant="link" className="h-auto px-0 pt-2 text-primary" asChild>
              <Link href="/qr-pay">Open QR Pay</Link>
            </Button>
          </div>
        ) : null}

        <div className="space-y-2 border-t pt-4">
          {transaction.invoiceId && (
            <Button variant="outline" className="w-full gap-2 bg-transparent" asChild>
              <Link href={withReturnTo(`/invoices/${transaction.invoiceId}`, txHere)}>
                <FileText className="h-4 w-4" />
                View invoice
              </Link>
            </Button>
          )}
          {!omitTrackStatus &&
            !showLifecycleTracker &&
            (transaction.transferId || transaction.id.startsWith("ETID")) &&
            (transaction.status === "pending" || transaction.status === "processing") && (
              <Button variant="outline" className="w-full gap-2 bg-transparent" asChild>
                <Link href={etidForLink}>
                  <Activity className="h-4 w-4" />
                  Track status
                </Link>
              </Button>
            )}
          {transaction.status === "completed" && (
            <Button
              variant="outline"
              className="w-full gap-2 bg-transparent"
              type="button"
              onClick={handleDownloadReceipt}
              disabled={downloadingReceipt}
            >
              <Download className="h-4 w-4" />
              {downloadingReceipt ? "Downloading..." : "Download Receipt"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
