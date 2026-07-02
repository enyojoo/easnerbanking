"use client"

import type { ReactNode } from "react"
import {
  computeDisplayProcessingFee,
  CurrencyFlag,
  formatMoneyDisplay,
  formatPayoutRecipientSubtitle,
  formatSendRateLabel,
  hasPayoutCrossCurrencyFx,
  hasWalletSendFxDisplay,
  normalizeTransferMethodLabel,
  shouldShowPayoutReviewFeeRow,
  type GlobalPayoutRecipientSnapshot,
  type GlobalPayoutReviewSnapshot,
  type TransactionTimingRow,
} from "@easner/shared"
import { TransactionTimingRows } from "@/components/transactions/transaction-timing-rows"
import { formatTransactionRowDateTime } from "@/lib/transaction-row-present"
import { Card, CardContent } from "@/components/ui/card"
import { Copy, Check } from "lucide-react"

type Props = {
  transactionId: string
  payoutReview: GlobalPayoutReviewSnapshot
  recipientSnapshot?: GlobalPayoutRecipientSnapshot | null
  recipientNode?: ReactNode
  sendNote?: string | null
  sourceAccountCurrency?: string | null
  copiedKey?: string | null
  onCopy?: (text: string, key: string) => void
  showFeeBreakdown?: boolean
  /** Detail view: hero already shows receive amount. Confirm/review keeps this row. */
  showRecipientGets?: boolean
  /** Dynamic timing (Arrived after / Failed after). Omit on send confirm. */
  timingRows?: TransactionTimingRow[] | null
  /** Confirm shows Arrival estimate; detail uses whenAt + timingRows only. */
  mode?: "confirm" | "detail"
  /** When true, Noah global fiat — margin is in customer rate; hide processing fee row. */
  globalFiatPayout?: boolean
  /** When set, uses wallet-send FX rules (direct Turnkey Solana stables hide rate). */
  receiveNetwork?: string | null
  walletSendExecutionModel?: "direct_turnkey" | "lifi_bridge" | null
  /** Wallet send fallback when snapshot is missing (older rows). */
  recipientDisplayName?: string | null
  counterpartyAddress?: string | null
  /** Settled / occurred timestamp for detail "When" row (wallet send, etc.). */
  whenAt?: string | null
}

function recipientSubtitle(
  snapshot: GlobalPayoutRecipientSnapshot,
  walletNetwork?: string | null,
): string {
  return formatPayoutRecipientSubtitle({
    bankName: snapshot.bank_name,
    phone: snapshot.phone,
    mobileProvider: snapshot.mobile_provider,
    accountNumber: snapshot.account_number,
    fullAccountNumber: snapshot.account_number,
    walletNetwork,
  })
}

function walletRecipientFallbackSubtitle(input: {
  bankName?: string | null
  accountNumber?: string | null
  walletNetwork?: string | null
}): string {
  return formatPayoutRecipientSubtitle({
    bankName: input.bankName || "Wallet",
    accountNumber: input.accountNumber,
    fullAccountNumber: input.accountNumber,
    walletNetwork: input.walletNetwork,
  })
}

export function PayoutReviewDetailsRows({
  transactionId,
  payoutReview,
  recipientSnapshot,
  recipientNode,
  sendNote,
  sourceAccountCurrency,
  copiedKey,
  onCopy,
  showFeeBreakdown = true,
  showRecipientGets = true,
  timingRows,
  globalFiatPayout,
  receiveNetwork,
  walletSendExecutionModel,
  recipientDisplayName,
  counterpartyAddress,
  whenAt,
  mode = "detail",
}: Props) {
  const hasFx = receiveNetwork
    ? hasWalletSendFxDisplay(
        payoutReview.send_currency,
        payoutReview.receive_currency,
        receiveNetwork,
      )
    : hasPayoutCrossCurrencyFx(payoutReview.send_currency, payoutReview.receive_currency)
  const displayProcessingFee = computeDisplayProcessingFee({
    processingFee: payoutReview.processing_fee,
    exchangeFee: payoutReview.exchange_fee,
  })
  const showProcessingFee = shouldShowPayoutReviewFeeRow({
    processingFee: payoutReview.processing_fee,
    exchangeFee: payoutReview.exchange_fee,
  })
  const transferMethodLabel = normalizeTransferMethodLabel(payoutReview.transfer_method)

  return (
    <Card className="border-border shadow-sm">
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center justify-between gap-2 border-b pb-4">
          <span className="text-sm text-muted-foreground">Transaction ID</span>
          {onCopy ? (
            <button
              type="button"
              className="flex items-center gap-2 font-mono text-sm font-medium transition-colors hover:text-primary"
              onClick={() => onCopy(transactionId, "transactionId")}
              aria-label="Copy transaction id"
            >
              {transactionId}
              {copiedKey === "transactionId" ? (
                <Check className="h-4 w-4 shrink-0 text-primary" />
              ) : (
                <Copy className="h-4 w-4 shrink-0" />
              )}
            </button>
          ) : (
            <span className="font-mono text-sm font-medium">{transactionId}</span>
          )}
        </div>

        <div className="flex items-center justify-between border-b pb-4">
          <span className="text-sm text-muted-foreground">
            {mode === "confirm" ? "Sending" : "Sent"}
          </span>
          <span className="text-xl font-semibold">
            {formatMoneyDisplay(payoutReview.you_send_amount, payoutReview.send_currency)}
          </span>
        </div>

        {sourceAccountCurrency ? (
          <div className="flex items-center justify-between border-b pb-4">
            <span className="text-sm text-muted-foreground">From</span>
            <div className="flex shrink-0 items-center gap-2 font-medium">
              <CurrencyFlag currency={sourceAccountCurrency} size={22} className="shrink-0" />
              <span>{sourceAccountCurrency} Balance</span>
            </div>
          </div>
        ) : null}

        {showFeeBreakdown ? (
          <>
            {showProcessingFee ? (
              <div className="flex items-center justify-between border-b pb-4">
                <span className="text-sm text-muted-foreground">Processing fee</span>
                <span className="font-semibold">
                  {formatMoneyDisplay(displayProcessingFee, payoutReview.send_currency)}
                </span>
              </div>
            ) : null}

            {hasFx ? (
              <div className="flex items-center justify-between border-b pb-4">
                <span className="text-sm text-muted-foreground">Exchange rate</span>
                <span className="font-semibold">
                  {formatSendRateLabel(
                    payoutReview.send_currency,
                    payoutReview.receive_currency,
                    payoutReview.exchange_rate,
                  )}
                </span>
              </div>
            ) : null}

            <div className="flex items-center justify-between border-b pb-4">
              <span className="text-sm text-muted-foreground">Total debited</span>
              <span className="text-xl font-semibold">
                {formatMoneyDisplay(payoutReview.total_debited, payoutReview.send_currency)}
              </span>
            </div>
          </>
        ) : null}

        {showRecipientGets ? (
          <div className="flex items-center justify-between border-b pb-4">
            <span className="text-sm text-muted-foreground">Recipient gets</span>
            <span className="font-semibold">
              {formatMoneyDisplay(payoutReview.receive_amount, payoutReview.receive_currency)}
            </span>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3 border-b pb-4">
          <span className="shrink-0 text-sm text-muted-foreground">Recipient</span>
          {recipientNode ? (
            recipientNode
          ) : recipientSnapshot ? (
            <div className="min-w-0 max-w-[70%] shrink-0 text-right">
              <p className="font-medium">{recipientSnapshot.full_name}</p>
              {recipientSubtitle(recipientSnapshot, receiveNetwork) ? (
                <p className="text-sm text-muted-foreground">
                  {recipientSubtitle(recipientSnapshot, receiveNetwork)}
                </p>
              ) : null}
            </div>
          ) : recipientDisplayName || counterpartyAddress ? (
            <div className="min-w-0 max-w-[70%] shrink-0 text-right">
              {recipientDisplayName ? (
                <p className="font-medium">{recipientDisplayName}</p>
              ) : null}
              {walletRecipientFallbackSubtitle({
                bankName: "Wallet",
                accountNumber: counterpartyAddress,
                walletNetwork: receiveNetwork,
              }) ? (
                <p className="text-sm text-muted-foreground">
                  {walletRecipientFallbackSubtitle({
                    bankName: "Wallet",
                    accountNumber: counterpartyAddress,
                    walletNetwork: receiveNetwork,
                  })}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-b pb-4">
          <span className="text-sm text-muted-foreground">Transfer method</span>
          <span className="font-medium">{transferMethodLabel}</span>
        </div>

        {whenAt ? (
          <div className="flex items-center justify-between border-b pb-4">
            <span className="text-sm text-muted-foreground">When</span>
            <span className="font-medium">{formatTransactionRowDateTime(whenAt)}</span>
          </div>
        ) : null}

        {timingRows?.length ? (
          <TransactionTimingRows rows={timingRows} />
        ) : mode === "confirm" && payoutReview.processing_time ? (
          <div className="flex items-center justify-between border-b pb-4">
            <span className="text-sm text-muted-foreground">Arrival</span>
            <span className="font-medium">{payoutReview.processing_time}</span>
          </div>
        ) : null}

        {sendNote ? (
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-muted-foreground">Note</span>
            <span className="max-w-[70%] text-right text-sm font-medium">{sendNote}</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
