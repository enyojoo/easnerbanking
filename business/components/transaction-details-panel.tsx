"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import type { Transaction } from "@/lib/finance-types"
import { formatCurrency } from "@/lib/utils"
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
  const showInvoice = Boolean(transaction.invoiceId)
  const showTrackStatus =
    !omitTrackStatus &&
    !showLifecycleTracker &&
    (Boolean(transaction.transferId) || transaction.id.startsWith("ETID")) &&
    (transaction.status === "pending" || transaction.status === "processing")
  // Easetag transfers/deposits are free, 1:1 wallet-to-wallet with no fee/FX detail,
  // so they don't get a downloadable receipt.
  const showDownloadReceipt =
    transaction.status === "completed" && transaction.paymentScheme !== "Easetag"

  // Nothing to offer (e.g. a completed Easetag transfer) — don't render an empty card.
  if (!showInvoice && !showTrackStatus && !showDownloadReceipt) return null

  return (
    <Card className="border-border shadow-sm">
      <CardContent className="space-y-2 p-6">
        {showInvoice ? (
          <Button variant="outline" className="w-full gap-2 bg-transparent" asChild>
            <Link href={withReturnTo(`/invoices/${transaction.invoiceId}`, txHere)}>
              <FileText className="h-4 w-4" />
              View invoice
            </Link>
          </Button>
        ) : null}
        {showTrackStatus ? (
          <Button variant="outline" className="w-full gap-2 bg-transparent" asChild>
            <Link href={etidForLink}>
              <Activity className="h-4 w-4" />
              Track status
            </Link>
          </Button>
        ) : null}
        {showDownloadReceipt ? (
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

function TransactionSummaryDetails({
  transaction,
  copiedKey,
  onCopy,
}: {
  transaction: Transaction
  copiedKey: string | null
  onCopy: (text: string, key: string) => void
}) {
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
  const isDeposit = transaction.direction === "credit"
  const partyLabel = isDeposit ? "Sender" : "Recipient"
  const showLifecycleTracker = Boolean(transaction.lifecycle?.length)
  const displayCurrency = transaction.postedCurrency || transaction.displayCurrency || "USD"
  const showParty =
    (isBank || isStablecoin || isCard) &&
    Boolean(transaction.counterpartyName) &&
    (isDeposit || !showLifecycleTracker)

  return (
    <Card className="border-border shadow-sm">
      <CardContent className="space-y-3 p-6">
        <div className="flex justify-between gap-4 border-b pb-4 text-sm">
          <span className="shrink-0 text-muted-foreground">Transaction ID</span>
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium">{transaction.id}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              type="button"
              onClick={() => onCopy(transaction.id, "transactionId")}
            >
              {copiedKey === "transactionId" ? (
                <Check className="h-3 w-3 text-primary" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          </div>
        </div>

        <div className="flex justify-between gap-4 text-sm">
          <span className="shrink-0 text-muted-foreground">When</span>
          <span className="text-right font-medium">
            {new Date(transaction.ledgerCreatedAt ?? transaction.date).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>

        {transaction.paymentScheme ? (
          <div className="flex justify-between gap-4 text-sm">
            <span className="shrink-0 text-muted-foreground">Scheme</span>
            <span className="text-right font-medium">{transaction.paymentScheme}</span>
          </div>
        ) : null}

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

        {showParty ? (
          <div className="flex justify-between gap-4 text-sm">
            <span className="shrink-0 text-muted-foreground">{partyLabel}</span>
            <span className="text-right font-medium">{transaction.counterpartyName}</span>
          </div>
        ) : null}

        {transaction.narration ? (
          <div className="flex justify-between gap-4 text-sm">
            <span className="shrink-0 text-muted-foreground">Narration</span>
            <span className="text-right font-medium">{transaction.narration}</span>
          </div>
        ) : null}

        {transaction.fee !== undefined && transaction.fee > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Processing fee</span>
            <span className="font-medium">
              {formatCurrency(transaction.fee, transaction.displayCurrency || "USD")}
            </span>
          </div>
        )}

        {transaction.postedAmount != null && transaction.postedAmount > 0 ? (
          <div className="flex justify-between gap-4 text-sm">
            <span className="shrink-0 text-muted-foreground">Amount credited</span>
            <span className="text-right font-medium">
              {formatCurrency(transaction.postedAmount, displayCurrency)}
            </span>
          </div>
        ) : null}

        {transaction.sendNote ? (
          <div className="flex justify-between gap-4 text-sm">
            <span className="shrink-0 text-muted-foreground">Note</span>
            <span className="text-right font-medium">{transaction.sendNote}</span>
          </div>
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

  const isGlobalPayout = Boolean(transaction.payoutReview)
  const isWalletSendPayout =
    transaction.payoutReview?.execution_model === "direct_turnkey" ||
    transaction.payoutReview?.execution_model === "lifi_bridge"
  const walletSendExecutionModel = transaction.payoutReview?.execution_model
  const walletReceiveNetwork =
    transaction.chain?.trim() ||
    String(
      (transaction as { metadata?: { receive_network?: string } }).metadata?.receive_network ??
        "",
    ).trim() ||
    undefined
  // Stablecoin deposits settle on-chain in a single event, so the Processing → Completed
  // tracker would always render both steps complete. Skip it (bank deposits keep it).
  const isStablecoinDeposit =
    transaction.type === "stablecoin" && transaction.direction === "credit"
  const showLifecycleTracker = Boolean(transaction.lifecycle?.length) && !isStablecoinDeposit
  const lifecycleTitle = isGlobalPayout ? "Transfer status" : "Deposit status"

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
      await downloadTransactionReceiptPdf(transaction, transaction.cardLast4)
    } finally {
      setDownloadingReceipt(false)
    }
  }

  const etidForLink = transactionWebDetailPath(transaction.id)

  return (
    <div className="space-y-4">
      <TransactionDetailHero transaction={transaction} />

      {isGlobalPayout && transaction.payoutReview ? (
        <PayoutReviewDetailsRows
          transactionId={transaction.id}
          payoutReview={transaction.payoutReview}
          recipientSnapshot={transaction.recipientSnapshot}
          sendNote={transaction.sendNote}
          timingRows={transaction.transactionTiming}
          copiedKey={copiedKey}
          onCopy={handleCopy}
          showRecipientGets={false}
          globalFiatPayout={isGlobalPayout && !isWalletSendPayout}
          receiveNetwork={walletReceiveNetwork}
          walletSendExecutionModel={walletSendExecutionModel}
          recipientDisplayName={
            isWalletSendPayout
              ? transaction.counterpartyName ?? transaction.description
              : undefined
          }
          counterpartyAddress={
            isWalletSendPayout
              ? transaction.counterpartyAddress ?? transaction.walletAddress
              : undefined
          }
          whenAt={transaction.ledgerCreatedAt ?? transaction.date}
          mode="detail"
        />
      ) : (
        <TransactionSummaryDetails
          transaction={transaction}
          copiedKey={copiedKey}
          onCopy={handleCopy}
        />
      )}

      {showLifecycleTracker && transaction.lifecycle ? (
        <Card className="border-border shadow-sm">
          <CardContent className="p-6">
            <TransactionLifecycleTracker
              lifecycle={transaction.lifecycle}
              title={lifecycleTitle}
            />
          </CardContent>
        </Card>
      ) : null}

      {transaction.collectionChannel === "autopayout" && transaction.autopayoutConfigId ? (
        <Card className="border-border shadow-sm">
          <CardContent className="px-3 py-3 text-sm">
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
