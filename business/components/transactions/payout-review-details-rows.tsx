"use client"

import type { ReactNode } from "react"
import {
  formatMoneyDisplay,
  formatPayoutRecipientSubtitle,
  formatSendRateLabel,
  type GlobalPayoutRecipientSnapshot,
  type GlobalPayoutReviewSnapshot,
} from "@easner/shared"
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
}: Props) {
  const hasFx =
    payoutReview.receive_currency.toUpperCase() !== payoutReview.send_currency.toUpperCase()

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
            <div className="flex items-center justify-between border-b pb-4">
              <span className="text-sm text-muted-foreground">Exchange fee</span>
              <span className="font-semibold">
                {formatMoneyDisplay(payoutReview.exchange_fee, payoutReview.send_currency)}
              </span>
            </div>

            <div className="flex items-center justify-between border-b pb-4">
              <span className="text-sm text-muted-foreground">Processing fee</span>
              <span className="font-semibold">
                {formatMoneyDisplay(payoutReview.processing_fee, payoutReview.send_currency)}
              </span>
            </div>

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

        <div className="flex items-center justify-between border-b pb-4">
          <span className="text-sm text-muted-foreground">Processing time</span>
          <span className="font-medium">{payoutReview.processing_time}</span>
        </div>

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
