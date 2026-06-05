"use client"

import type { ReactNode } from "react"
import {
  formatMoneyDisplay,
  formatPayoutRecipientSubtitle,
  formatSendRateLabel,
  hasPayoutCrossCurrencyFx,
  hasWalletSendFxDisplay,
  shouldShowPayoutExchangeFee,
  shouldShowGlobalPayoutProcessingFee,
  shouldShowWalletSendNetworkFee,
  shouldShowWalletSendProcessingFee,
  type GlobalPayoutRecipientSnapshot,
  type GlobalPayoutReviewSnapshot,
  type TransactionTimingRow,
} from "@easner/shared"
import { TransactionTimingRows } from "@/components/transactions/transaction-timing-rows"
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
  /** Dynamic timing (Expected / Started / Arrived). Omit on send confirm. */
  timingRows?: TransactionTimingRow[] | null
  /** When true, Noah global fiat — margin is in customer rate; hide processing fee row. */
  globalFiatPayout?: boolean
  /** When set, uses wallet-send FX rules (direct Turnkey Solana stables hide rate). */
  receiveNetwork?: string | null
  walletSendExecutionModel?: "direct_turnkey" | "lifi_bridge" | null
}

function recipientSubtitle(snapshot: GlobalPayoutRecipientSnapshot): string {
  return formatPayoutRecipientSubtitle({
    bankName: snapshot.bank_name,
    phone: snapshot.phone,
    mobileProvider: snapshot.mobile_provider,
    accountNumber: snapshot.account_number,
    fullAccountNumber: snapshot.account_number,
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
}: Props) {
  const hasFx = receiveNetwork
    ? hasWalletSendFxDisplay(
        payoutReview.send_currency,
        payoutReview.receive_currency,
        receiveNetwork,
      )
    : hasPayoutCrossCurrencyFx(payoutReview.send_currency, payoutReview.receive_currency)
  const showExchangeFee = shouldShowPayoutExchangeFee({
    sendCurrency: payoutReview.send_currency,
    receiveCurrency: payoutReview.receive_currency,
    exchangeFee: payoutReview.exchange_fee,
  })
  const showProcessingFee = globalFiatPayout
    ? shouldShowGlobalPayoutProcessingFee({ processingFee: payoutReview.processing_fee })
    : shouldShowWalletSendProcessingFee({
        executionModel:
          walletSendExecutionModel ?? payoutReview.execution_model ?? null,
        processingFee: payoutReview.processing_fee,
      })
  const showNetworkFee = shouldShowWalletSendNetworkFee({
    executionModel:
      walletSendExecutionModel ?? payoutReview.execution_model ?? null,
    networkFee: payoutReview.network_fee,
  })

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
          <span className="text-sm text-muted-foreground">You send</span>
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
            {showExchangeFee ? (
              <div className="flex items-center justify-between border-b pb-4">
                <span className="text-sm text-muted-foreground">Exchange fee</span>
                <span className="font-semibold">
                  {formatMoneyDisplay(payoutReview.exchange_fee, payoutReview.send_currency)}
                </span>
              </div>
            ) : null}

            {showProcessingFee ? (
              <div className="flex items-center justify-between border-b pb-4">
                <span className="text-sm text-muted-foreground">Processing fee</span>
                <span className="font-semibold">
                  {formatMoneyDisplay(payoutReview.processing_fee, payoutReview.send_currency)}
                </span>
              </div>
            ) : null}

            {showNetworkFee ? (
              <div className="flex items-center justify-between border-b pb-4">
                <span className="text-sm text-muted-foreground">Network fee</span>
                <span className="font-semibold">
                  {formatMoneyDisplay(payoutReview.network_fee!, payoutReview.send_currency)}
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
              {recipientSubtitle(recipientSnapshot) ? (
                <p className="text-sm text-muted-foreground">{recipientSubtitle(recipientSnapshot)}</p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-b pb-4">
          <span className="text-sm text-muted-foreground">Transfer method</span>
          <span className="font-medium">{payoutReview.transfer_method}</span>
        </div>

        {timingRows?.length ? (
          <TransactionTimingRows rows={timingRows} />
        ) : payoutReview.processing_time ? (
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
