"use client"

import { useCallback, useState } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import type { Transaction } from "@/lib/finance-types"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Copy, Check, Download, FileText, Activity } from "lucide-react"
import { downloadTransactionReceiptPdf } from "@/lib/use-transaction-receipt-pdf"
import { currentLocationPath, withReturnTo } from "@/lib/invoice-navigation"
import { transactionWebDetailPath } from "@/lib/easner-transaction-id"
import { TransactionLifecycleTracker } from "@/components/transactions/transaction-lifecycle-tracker"
import { TransactionDetailHero } from "@/components/transactions/transaction-detail-hero"
import { PayoutReviewDetailsRows } from "@/components/transactions/payout-review-details-rows"
import { CrossBorderSendDetailRows } from "@/components/transactions/cross-border-send-detail-rows"
import { TransactionRecipientSummary } from "@/components/transactions/transaction-recipient-summary"
import { DepositReviewDetailsRows } from "@/components/transactions/deposit-review-details-rows"
import { InboundReceiveDetailsRows } from "@/components/transactions/inbound-receive-details-rows"
import { CreditDestinationRow } from "@/components/transactions/credit-destination-row"
import { TransactionDetailSummaryRow } from "@/components/transactions/transaction-detail-summary-row"
import { useScope } from "@/lib/query/scope"
import { getTransactionDetailPrefetchOptions } from "@/hooks/queries/use-transactions"
import {
  REVIEW_ROW_LABELS,
  computeDisplayProcessingFee,
  formatTransactionWhen,
  isVerificationDepositMetadata,
  resolveLedgerWhenAt,
  resolvePayoutReviewFlow,
  shouldShowReviewTotalDebited,
  formatReviewRowMoneyDisplay,
  useYcPayInExpiredDetailRefetch,
} from "@easner/shared"

function resolveTransactionDetailWhenAt(transaction: Transaction): string | null {
  return (
    resolveLedgerWhenAt({
      occurredAt: transaction.date,
      createdAt: transaction.ledgerCreatedAt,
    }) ??
    transaction.ledgerCreatedAt ??
    transaction.date
  )
}

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
  const description = transaction.description.toLowerCase()
  const isStablecoinDeposit =
    transaction.direction === "credit" &&
    (transaction.type === "stablecoin" ||
      description.startsWith("stablecoin") ||
      String(transaction.collectionChannel ?? "").toLowerCase() === "autopayout")
  // Easetag transfers/deposits are free, 1:1 wallet-to-wallet with no fee/FX detail,
  // and stablecoin deposits do not get downloadable transaction receipts.
  const showDownloadReceipt =
    transaction.status === "completed" &&
    transaction.paymentScheme !== "Easetag" &&
    !isStablecoinDeposit

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
  const isStripeInvoiceSettlement =
    Boolean(transaction.invoiceId) ||
    descLower === "invoice payment" ||
    Boolean(
      transaction.lifecycle?.some(
        (step) =>
          step.id === "payment_received" || step.id === "clearing" || step.id === "available",
      ),
    )
  const isStablecoin =
    !isStripeInvoiceSettlement &&
    (transaction.type === "stablecoin" ||
      descLower.startsWith("stablecoin") ||
      String(transaction.collectionChannel ?? "").toLowerCase() === "autopayout")
  const isBank =
    !isStripeInvoiceSettlement &&
    !isStablecoin &&
    (transaction.type === "book" || transaction.type === "ach" || transaction.type === "wire") &&
    Boolean(transaction.paymentRail)
  const isCard = Boolean(cardLast4) || transaction.type === "card"
  const isEasetag = transaction.paymentScheme === "Easetag"
  const isDeposit = transaction.direction === "credit"
  const partyLabel = isDeposit ? "Sender" : "Recipient"
  const showLifecycleTracker = Boolean(transaction.lifecycle?.length)
  const displayCurrency = transaction.postedCurrency || transaction.displayCurrency || "USD"
  const showParty =
    !isStripeInvoiceSettlement &&
    (isBank || isStablecoin || isCard || isEasetag) &&
    Boolean(transaction.counterpartyName) &&
    (isDeposit || !showLifecycleTracker)
  const invoiceReference =
    transaction.reference &&
    transaction.reference !== transaction.id &&
    !transaction.reference.startsWith("ETID")
      ? transaction.reference
      : null
  const netAmount =
    transaction.postedAmount != null && transaction.postedAmount > 0
      ? transaction.postedAmount
      : Math.abs(transaction.amount)
  const grossAmount =
    transaction.depositAmount != null && transaction.depositAmount > 0
      ? transaction.depositAmount
      : null
  const settled = transaction.status === "completed"
  const whenAt = resolveTransactionDetailWhenAt(transaction)

  return (
    <Card className="border-border shadow-sm">
      <CardContent className="p-6">
        <TransactionDetailSummaryRow label={REVIEW_ROW_LABELS.transactionId}>
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
        </TransactionDetailSummaryRow>

        {isStripeInvoiceSettlement && invoiceReference ? (
          <TransactionDetailSummaryRow label="Invoice" value={invoiceReference} />
        ) : null}

        {isStripeInvoiceSettlement ? (
          <TransactionDetailSummaryRow
            label="Amount"
            value={formatReviewRowMoneyDisplay("Amount", netAmount, displayCurrency)}
          />
        ) : null}

        {isStripeInvoiceSettlement &&
        grossAmount != null &&
        Math.abs(grossAmount - netAmount) > 0.0001 ? (
          <TransactionDetailSummaryRow
            label="Payment amount"
            value={formatReviewRowMoneyDisplay("Payment amount", grossAmount, displayCurrency)}
          />
        ) : null}

        {isStripeInvoiceSettlement && transaction.paymentScheme ? (
          <TransactionDetailSummaryRow label="Payment method" value={transaction.paymentScheme} />
        ) : null}

        {isStripeInvoiceSettlement && transaction.paymentRail ? (
          <TransactionDetailSummaryRow label="Settling to" value={transaction.paymentRail} />
        ) : null}

        {!isStripeInvoiceSettlement && transaction.paymentScheme ? (
          <TransactionDetailSummaryRow label={REVIEW_ROW_LABELS.scheme} value={transaction.paymentScheme} />
        ) : null}

        {!isStripeInvoiceSettlement && isCard && cardLast4 ? (
          <TransactionDetailSummaryRow label="Card" value={`•••• ${cardLast4}`} />
        ) : !isStripeInvoiceSettlement && transaction.category ? (
          <TransactionDetailSummaryRow label="Category" value={transaction.category} />
        ) : null}

        {showParty && isEasetag && !isDeposit ? (
          <TransactionDetailSummaryRow label={partyLabel}>
            <TransactionRecipientSummary
              counterpartyName={transaction.counterpartyName}
              payeeEasetag={transaction.counterpartyName}
            />
          </TransactionDetailSummaryRow>
        ) : showParty ? (
          <TransactionDetailSummaryRow label={partyLabel} value={transaction.counterpartyName} />
        ) : null}

        {!isStripeInvoiceSettlement && transaction.narration ? (
          <TransactionDetailSummaryRow label="Narration" value={transaction.narration} />
        ) : null}

        {transaction.fee !== undefined && transaction.fee > 0 ? (
          <TransactionDetailSummaryRow
            label={REVIEW_ROW_LABELS.processingFee}
            value={formatReviewRowMoneyDisplay(
              REVIEW_ROW_LABELS.processingFee,
              transaction.fee,
              transaction.displayCurrency || "USD",
            )}
          />
        ) : null}

        {!isStripeInvoiceSettlement &&
        transaction.postedAmount != null &&
        transaction.postedAmount > 0 ? (
          <TransactionDetailSummaryRow
            label={REVIEW_ROW_LABELS.amountCredited}
            value={formatReviewRowMoneyDisplay(
              REVIEW_ROW_LABELS.amountCredited,
              transaction.postedAmount,
              displayCurrency,
            )}
          />
        ) : null}

        {!isStripeInvoiceSettlement &&
        isDeposit &&
        transaction.postedAmount != null &&
        transaction.postedAmount > 0 ? (
          <CreditDestinationRow
            label={
              isVerificationDepositMetadata(
                (transaction as { metadata?: Record<string, unknown> }).metadata,
              )
                ? REVIEW_ROW_LABELS.creditFor
                : REVIEW_ROW_LABELS.creditTo
            }
            currency={displayCurrency}
            balanceLabel={`${displayCurrency} Balance`}
          />
        ) : null}

        {isStripeInvoiceSettlement && settled ? (
          <CreditDestinationRow
            label={REVIEW_ROW_LABELS.creditTo}
            currency={displayCurrency}
            balanceLabel={`${displayCurrency} Balance`}
          />
        ) : null}

        {transaction.sendNote ? (
          <TransactionDetailSummaryRow label={REVIEW_ROW_LABELS.note} value={transaction.sendNote} />
        ) : null}

        <TransactionDetailSummaryRow
          label={REVIEW_ROW_LABELS.when}
          value={
            whenAt
              ? formatTransactionWhen(whenAt)
              : "—"
          }
        />
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
  const qc = useQueryClient()
  const { scope } = useScope()
  const txHere = currentLocationPath(pathname, searchParams)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [downloadingReceipt, setDownloadingReceipt] = useState(false)

  const refetchExpiredPayIn = useCallback(() => {
    if (!scope || !transaction?.id) return
    void qc.invalidateQueries(getTransactionDetailPrefetchOptions(scope, transaction.id))
  }, [qc, scope, transaction?.id])

  useYcPayInExpiredDetailRefetch({
    enabled: Boolean(transaction),
    ledgerStatus: transaction?.status ?? "",
    quoteExpiresAt: transaction?.quoteExpiresAt,
    awaitingPayIn: Boolean(transaction?.payInAwaitingAttestation),
    onRefetch: refetchExpiredPayIn,
  })

  if (!transaction) return null

  const isGlobalPayout = Boolean(transaction.payoutReview)
  const isYcFundBalanceDeposit = Boolean(transaction.depositReview)
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
  const payoutReviewFlow =
    transaction.payoutReviewFlow ??
    resolvePayoutReviewFlow(
      (transaction as { metadata?: Record<string, unknown> }).metadata,
    )
  // Stablecoin deposits settle on-chain in a single event, so the Processing → Completed
  // tracker would always render both steps complete. Skip it (bank deposits keep it).
  const isStablecoinDeposit =
    transaction.type === "stablecoin" && transaction.direction === "credit"
  const isEasetagReceive =
    transaction.paymentScheme === "Easetag" ||
    transaction.inboundReceive?.kind === "easetag_receive"
  const showLifecycleTracker =
    Boolean(transaction.lifecycle?.length) && !isStablecoinDeposit && !isEasetagReceive
  const isStripeInvoiceSettlement = transaction.lifecycle?.some(
    (step) => step.id === "payment_received" || step.id === "clearing" || step.id === "available",
  )
  const lifecycleTitle = isGlobalPayout
    ? "Transfer status"
    : isStripeInvoiceSettlement
      ? "Settlement status"
      : "Deposit status"

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
  const whenAt = resolveTransactionDetailWhenAt(transaction)
  const recipientSummaryNode = (
    <TransactionRecipientSummary
      recipientSnapshot={transaction.recipientSnapshot}
      counterpartyName={transaction.counterpartyName}
      counterpartyAddress={transaction.counterpartyAddress ?? transaction.walletAddress}
      receiveNetwork={walletReceiveNetwork}
      receiveCurrency={transaction.payoutReview?.receive_currency}
      payeeEasetag={
        transaction.paymentScheme === "Easetag" && transaction.direction !== "credit"
          ? transaction.counterpartyName
          : undefined
      }
    />
  )

  const tlcDetailFee =
    payoutReviewFlow === "local_pay_in" && transaction.payoutReview
      ? transaction.payoutReview.display_processing_fee_local != null &&
        transaction.payoutReview.display_processing_fee_local > 0
        ? transaction.payoutReview.display_processing_fee_local
        : Number(transaction.metadata?.display_processing_fee_local) > 0
          ? Number(transaction.metadata.display_processing_fee_local)
          : computeDisplayProcessingFee({
              processingFee: transaction.payoutReview.processing_fee,
              exchangeFee: transaction.payoutReview.exchange_fee,
            })
      : 0

  return (
    <div className="space-y-4">
      <TransactionDetailHero transaction={transaction} />

      {isGlobalPayout && transaction.payoutReview && payoutReviewFlow === "local_pay_in" ? (
        <Card className="border-border shadow-sm">
          <CardContent className="p-6 space-y-1">
            <CrossBorderSendDetailRows
              payoutReview={transaction.payoutReview}
              recipientSnapshot={transaction.recipientSnapshot}
              displayProcessingFee={tlcDetailFee}
              whenAt={whenAt}
              recipientNode={recipientSummaryNode}
            />
          </CardContent>
        </Card>
      ) : isGlobalPayout && transaction.payoutReview ? (
        <PayoutReviewDetailsRows
          transactionId={transaction.id}
          payoutReview={transaction.payoutReview}
          recipientSnapshot={transaction.recipientSnapshot}
          recipientNode={recipientSummaryNode}
          sendNote={transaction.sendNote}
          timingRows={transaction.transactionTiming}
          copiedKey={copiedKey}
          onCopy={handleCopy}
          showRecipientGets={false}
          globalFiatPayout={isGlobalPayout && !isWalletSendPayout}
          receiveNetwork={walletReceiveNetwork}
          walletSendExecutionModel={walletSendExecutionModel}
          sourceAccountCurrency={
            shouldShowReviewTotalDebited(payoutReviewFlow) && transaction.payoutReview?.send_currency
              ? transaction.payoutReview.send_currency
              : null
          }
          reviewFlow={payoutReviewFlow}
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
          whenAt={whenAt}
          mode="detail"
        />
      ) : transaction.inboundReceive ? (
        <InboundReceiveDetailsRows
          transactionId={transaction.id}
          snapshot={transaction.inboundReceive}
          timingRows={transaction.transactionTiming}
          copiedKey={copiedKey}
          onCopy={handleCopy}
        />
      ) : isYcFundBalanceDeposit && transaction.depositReview ? (
        <DepositReviewDetailsRows
          transactionId={transaction.id}
          depositReview={transaction.depositReview}
          timingRows={transaction.transactionTiming}
          copiedKey={copiedKey}
          onCopy={handleCopy}
          whenAt={whenAt}
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
              ycPayInPaymentDetails={transaction.ycPayInPaymentDetails}
              quoteExpiresAt={transaction.quoteExpiresAt}
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
