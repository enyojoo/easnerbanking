"use client"

import type { ReactNode } from "react"
import {
  computeDisplayProcessingFee,
  computeFootedDisplayProcessingFee,
  formatMoneyDisplay,
  formatReviewRowMoneyDisplay,
  formatPayoutRecipientSubtitle,
  formatSendRateLabel,
  hasPayoutCrossCurrencyFx,
  hasWalletSendFxDisplay,
  normalizeTransferMethodLabel,
  pickVisibleProcessingFee,
  shouldShowPayoutReviewFeeRow,
  REVIEW_ROW_LABELS,
  reviewPrimaryAmountLabel,
  shouldShowReviewTotalDebited,
  formatAccountBalanceLabel,
  type GlobalPayoutRecipientSnapshot,
  type GlobalPayoutReviewSnapshot,
  type ReviewFlowKind,
  type TransactionTimingRow,
} from "@easner/shared"
import { CreditDestinationRow } from "@/components/transactions/credit-destination-row"
import {
  TransactionDetailSummaryRow,
  TRANSACTION_DETAIL_MONEY_VALUE_CLASS,
} from "@/components/transactions/transaction-detail-summary-row"
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
  showRecipientGets?: boolean
  timingRows?: TransactionTimingRow[] | null
  mode?: "confirm" | "detail"
  reviewFlow?: ReviewFlowKind
  globalFiatPayout?: boolean
  receiveNetwork?: string | null
  walletSendExecutionModel?: "direct_turnkey" | "relay_bridge" | null
  recipientDisplayName?: string | null
  counterpartyAddress?: string | null
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
  receiveNetwork,
  recipientDisplayName,
  counterpartyAddress,
  whenAt,
  mode = "detail",
  reviewFlow = "balance_payout",
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
  const localPayInFee =
    reviewFlow === "local_pay_in"
      ? pickVisibleProcessingFee(payoutReview.display_processing_fee_local)
      : null
  const feeDisplayAmount =
    reviewFlow === "local_pay_in"
      ? payoutReview.principal_local_pay_in != null
        ? computeFootedDisplayProcessingFee({
            sendingAmount: payoutReview.principal_local_pay_in,
            totalDebited: payoutReview.total_debited,
            fallbackFee: localPayInFee ?? displayProcessingFee,
          })
        : localPayInFee ?? displayProcessingFee
      : computeFootedDisplayProcessingFee({
          sendingAmount: payoutReview.you_send_amount,
          totalDebited: payoutReview.total_debited,
          fallbackFee: displayProcessingFee,
        })
  const feeDisplayCurrency = localPayInFee != null ? payoutReview.send_currency : payoutReview.send_currency
  const showProcessingFee = shouldShowPayoutReviewFeeRow({
    processingFee: payoutReview.processing_fee,
    exchangeFee: payoutReview.exchange_fee,
  })
  const transferMethodLabel = normalizeTransferMethodLabel(payoutReview.transfer_method)

  return (
    <Card className="border-border shadow-sm">
      <CardContent className="p-6">
        {transactionId ? (
          <TransactionDetailSummaryRow label={REVIEW_ROW_LABELS.transactionId}>
            {onCopy ? (
              <button
                type="button"
                className="flex items-center gap-2 font-mono text-sm font-normal transition-colors hover:text-primary"
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
              <span className="font-mono text-sm font-normal">{transactionId}</span>
            )}
          </TransactionDetailSummaryRow>
        ) : null}

        <TransactionDetailSummaryRow
          label={reviewPrimaryAmountLabel(reviewFlow, mode)}
          value={formatMoneyDisplay(payoutReview.you_send_amount, payoutReview.send_currency)}
          valueClassName={TRANSACTION_DETAIL_MONEY_VALUE_CLASS}
        />

        {showFeeBreakdown ? (
          <>
            {showProcessingFee ? (
              <TransactionDetailSummaryRow
                label={REVIEW_ROW_LABELS.processingFee}
                value={formatReviewRowMoneyDisplay(
                  REVIEW_ROW_LABELS.processingFee,
                  feeDisplayAmount,
                  feeDisplayCurrency,
                )}
              />
            ) : null}

            {hasFx ? (
              <TransactionDetailSummaryRow
                label={REVIEW_ROW_LABELS.exchangeRate}
                value={formatSendRateLabel(
                  payoutReview.send_currency,
                  payoutReview.receive_currency,
                  payoutReview.exchange_rate,
                )}
              />
            ) : null}

            {shouldShowReviewTotalDebited(reviewFlow) ? (
              <TransactionDetailSummaryRow
                label={REVIEW_ROW_LABELS.totalDebited}
                value={formatReviewRowMoneyDisplay(
                  REVIEW_ROW_LABELS.totalDebited,
                  payoutReview.total_debited,
                  payoutReview.send_currency,
                )}
                valueClassName={TRANSACTION_DETAIL_MONEY_VALUE_CLASS}
              />
            ) : null}
          </>
        ) : null}

        {sourceAccountCurrency && shouldShowReviewTotalDebited(reviewFlow) ? (
          <CreditDestinationRow
            label={REVIEW_ROW_LABELS.debitedFrom}
            currency={sourceAccountCurrency}
            balanceLabel={formatAccountBalanceLabel(sourceAccountCurrency)}
          />
        ) : null}

        {showRecipientGets ? (
          <TransactionDetailSummaryRow
            label={REVIEW_ROW_LABELS.recipientGets}
            value={formatMoneyDisplay(
              payoutReview.requested_receive_amount ?? payoutReview.receive_amount,
              payoutReview.receive_currency,
            )}
            valueClassName={TRANSACTION_DETAIL_MONEY_VALUE_CLASS}
          />
        ) : null}

        <TransactionDetailSummaryRow label={REVIEW_ROW_LABELS.recipient}>
          {recipientNode ? (
            recipientNode
          ) : recipientSnapshot ? (
            <div className="min-w-0 max-w-[70%] shrink-0 text-right">
              <p className="font-normal">{recipientSnapshot.full_name}</p>
              {recipientSubtitle(recipientSnapshot, receiveNetwork) ? (
                <p className="text-sm text-muted-foreground">
                  {recipientSubtitle(recipientSnapshot, receiveNetwork)}
                </p>
              ) : null}
            </div>
          ) : recipientDisplayName || counterpartyAddress ? (
            <div className="min-w-0 max-w-[70%] shrink-0 text-right">
              {recipientDisplayName ? <p className="font-normal">{recipientDisplayName}</p> : null}
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
        </TransactionDetailSummaryRow>

        <TransactionDetailSummaryRow
          label={REVIEW_ROW_LABELS.transferMethod}
          value={transferMethodLabel}
        />

        {whenAt ? (
          <TransactionDetailSummaryRow
            label={REVIEW_ROW_LABELS.when}
            value={formatTransactionRowDateTime(whenAt)}
          />
        ) : null}

        {timingRows?.length ? (
          <TransactionTimingRows rows={timingRows} />
        ) : mode === "confirm" && payoutReview.processing_time ? (
          <TransactionDetailSummaryRow
            label={REVIEW_ROW_LABELS.arrival}
            value={payoutReview.processing_time}
          />
        ) : null}

        {sendNote ? (
          <TransactionDetailSummaryRow
            label={REVIEW_ROW_LABELS.note}
            value={sendNote}
            valueClassName="max-w-[70%] text-sm"
          />
        ) : null}
      </CardContent>
    </Card>
  )
}
