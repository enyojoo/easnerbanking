"use client"

import Link from "next/link"
import { Check, Copy, Landmark, Smartphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  formatMoneyDisplay,
  formatReviewRowMoneyDisplay,
  formatSendRateLabel,
  REVIEW_ROW_LABELS,
  computeYcFundBalancePrincipalLocalPayIn,
  shouldShowPayoutReviewFeeRow,
  YC_PAY_IN_MOMO_AUTHORIZE_CTA,
  YC_PAY_IN_SEND_EXACTLY_LABEL,
  ycPayInCompleteNotice,
  type YcPayInRail,
} from "@easner/shared"
import { ycBankInfoFields } from "@/lib/yc-bank-info-fields"
import { CreditDestinationRow } from "@/components/transactions/credit-destination-row"
import { transactionWebDetailPath } from "@/lib/easner-transaction-id"

export type YcCompleteDepositPanelProps = {
  flowMode: "fund_balance" | "cross_border_send"
  transactionId: string
  localPayIn: number
  localCurrency: string
  creditOrReceiveAmount: number
  creditOrReceiveCurrency: string
  customerRate: number
  processingFeeLocal?: number
  payInRail: YcPayInRail
  bankInfo?: Record<string, unknown> | null
  sourcePhone?: string
  sourceNetworkName?: string
  recipientName?: string
  payInNotice?: string
  copiedField?: string | null
  onCopy?: (text: string, field: string) => void
  /** Where transaction detail back should land after YC pay-in complete. */
  returnTo?: "dashboard" | "transactions"
}

export function YcCompleteDepositPanel({
  flowMode,
  transactionId,
  localPayIn,
  localCurrency,
  creditOrReceiveAmount,
  creditOrReceiveCurrency,
  customerRate,
  processingFeeLocal = 0,
  payInRail,
  bankInfo,
  sourcePhone,
  sourceNetworkName,
  recipientName,
  payInNotice,
  copiedField,
  onCopy,
  returnTo = "dashboard",
}: YcCompleteDepositPanelProps) {
  const isFundBalance = flowMode === "fund_balance"
  const isMomo = payInRail === "mobile_money"
  const showFundBalanceQuoteSummary = isFundBalance && isMomo
  const showFundBalanceBankCredit = isFundBalance && !isMomo
  const title = isFundBalance ? "Complete deposit" : "Complete payment"
  const payInAmount = formatMoneyDisplay(localPayIn, localCurrency)
  const creditAmount = formatMoneyDisplay(creditOrReceiveAmount, creditOrReceiveCurrency)
  const principalLocal =
    showFundBalanceQuoteSummary && customerRate > 0
      ? computeYcFundBalancePrincipalLocalPayIn({
          usdCredit: creditOrReceiveAmount,
          exchangeRate: customerRate,
        })
      : 0
  const showProcessingFee =
    showFundBalanceQuoteSummary &&
    (processingFeeLocal > 0 ||
      shouldShowPayoutReviewFeeRow({ processingFee: processingFeeLocal, exchangeFee: 0 }))
  const completeNotice = ycPayInCompleteNotice(payInRail)
  const bankFields = ycBankInfoFields(bankInfo)
  const PaymentIcon = isMomo ? Smartphone : Landmark

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">{title}</h2>

      <div className="rounded-xl border border-border p-4 space-y-1 text-sm">
        <div
          className={`flex justify-between items-center gap-4 py-2 ${showFundBalanceQuoteSummary || showFundBalanceBankCredit || !isFundBalance ? "border-b" : ""}`}
        >
          <span className="text-muted-foreground">{REVIEW_ROW_LABELS.transactionId}</span>
          {onCopy ? (
            <button
              type="button"
              onClick={() => void onCopy(transactionId.toUpperCase(), "yc-complete-txid")}
              className="flex items-center gap-2 font-mono text-sm hover:text-primary transition-colors text-right"
            >
              <span className="break-all">{transactionId.toUpperCase()}</span>
              {copiedField === "yc-complete-txid" ? (
                <Check className="h-4 w-4 text-primary shrink-0" />
              ) : (
                <Copy className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
            </button>
          ) : (
            <span className="font-mono">{transactionId.toUpperCase()}</span>
          )}
        </div>
        {showFundBalanceBankCredit ? (
          <div className="flex justify-between gap-4 py-2">
            <span className="text-muted-foreground">{REVIEW_ROW_LABELS.amountToCredit}</span>
            <span className="font-medium">{creditAmount}</span>
          </div>
        ) : null}
        {showFundBalanceQuoteSummary ? (
          <>
            {customerRate > 0 ? (
              <div className="flex justify-between gap-4 py-2 border-b">
                <span className="text-muted-foreground">{REVIEW_ROW_LABELS.exchangeRate}</span>
                <span>{formatSendRateLabel("USD", localCurrency, customerRate)}</span>
              </div>
            ) : null}
            {principalLocal > 0 ? (
              <div className="flex justify-between gap-4 py-2 border-b">
                <span className="text-muted-foreground">{REVIEW_ROW_LABELS.depositAmount}</span>
                <span>
                  {formatReviewRowMoneyDisplay(
                    REVIEW_ROW_LABELS.depositAmount,
                    principalLocal,
                    localCurrency,
                  )}
                </span>
              </div>
            ) : null}
            {showProcessingFee ? (
              <div className="flex justify-between gap-4 py-2 border-b">
                <span className="text-muted-foreground">{REVIEW_ROW_LABELS.processingFee}</span>
                <span>
                  {formatReviewRowMoneyDisplay(
                    REVIEW_ROW_LABELS.processingFee,
                    processingFeeLocal,
                    localCurrency,
                  )}
                </span>
              </div>
            ) : null}
            <div className="flex justify-between gap-4 py-2 border-b">
              <span className="text-muted-foreground">{REVIEW_ROW_LABELS.totalToPay}</span>
              <span className="font-semibold">{payInAmount}</span>
            </div>
            <div className="flex justify-between gap-4 py-2 border-b">
              <span className="text-muted-foreground">{REVIEW_ROW_LABELS.amountToCredit}</span>
              <span className="font-medium">{creditAmount}</span>
            </div>
            <CreditDestinationRow
              label={REVIEW_ROW_LABELS.creditTo}
              currency="USD"
              balanceLabel="USD Balance"
            />
            <div className="flex justify-between gap-4 py-2">
              <span className="text-muted-foreground">{REVIEW_ROW_LABELS.transferMethod}</span>
              <span>{isMomo ? "Mobile Money" : "Bank Transfer"}</span>
            </div>
          </>
        ) : !isFundBalance ? (
          <>
            {processingFeeLocal > 0 ? (
              <div className="flex justify-between gap-4 py-2 border-b">
                <span className="text-muted-foreground">{REVIEW_ROW_LABELS.processingFee}</span>
                <span>
                  {formatReviewRowMoneyDisplay(
                    REVIEW_ROW_LABELS.processingFee,
                    processingFeeLocal,
                    localCurrency,
                  )}
                </span>
              </div>
            ) : null}
            {customerRate > 0 ? (
              <div className="flex justify-between gap-4 py-2 border-b">
                <span className="text-muted-foreground">{REVIEW_ROW_LABELS.exchangeRate}</span>
                <span>
                  {formatSendRateLabel(localCurrency, creditOrReceiveCurrency, customerRate)}
                </span>
              </div>
            ) : null}
            <div className="flex justify-between gap-4 py-2 border-b">
              <span className="text-muted-foreground">{REVIEW_ROW_LABELS.recipientGets}</span>
              <span className="font-medium">{creditAmount}</span>
            </div>
            {recipientName ? (
              <div className="flex justify-between gap-4 py-2 border-b">
                <span className="text-muted-foreground">{REVIEW_ROW_LABELS.recipient}</span>
                <span>{recipientName}</span>
              </div>
            ) : null}
            <div className="flex justify-between gap-4 py-2">
              <span className="text-muted-foreground">{REVIEW_ROW_LABELS.transferMethod}</span>
              <span>{isMomo ? "Mobile Money" : "Bank Transfer"}</span>
            </div>
          </>
        ) : null}
      </div>

      {(completeNotice || !isMomo) ? (
      <div className="space-y-4">
        {completeNotice ? (
          <p className="text-sm text-center text-muted-foreground px-2">{completeNotice}</p>
        ) : null}
        {!isMomo ? (
          <p className="text-sm text-center text-foreground">
            {YC_PAY_IN_SEND_EXACTLY_LABEL}{" "}
            <span className="text-xl font-semibold">{payInAmount}</span>
          </p>
        ) : null}
      </div>
      ) : null}

      <div className="rounded-xl border border-border p-4 space-y-1">
        <div className="flex items-center gap-2 mb-3">
          <PaymentIcon className="h-5 w-5 text-primary" />
          <p className="font-medium">{isMomo ? "Mobile Money" : "Bank Account"}</p>
        </div>
        {isMomo ? (
          <>
            {sourceNetworkName ? (
              <div className="flex justify-between gap-4 py-3 border-b">
                <span className="text-sm text-muted-foreground">{REVIEW_ROW_LABELS.paymentNetwork}</span>
                <span className="font-mono text-sm">{sourceNetworkName}</span>
              </div>
            ) : null}
            {sourcePhone ? (
              <div className="flex justify-between gap-4 py-3">
                <span className="text-sm text-muted-foreground">{REVIEW_ROW_LABELS.mobileNumber}</span>
                <span className="font-mono text-sm">{sourcePhone}</span>
              </div>
            ) : null}
          </>
        ) : bankFields.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            Payment details unavailable. Contact support with reference {transactionId}.
          </p>
        ) : (
          bankFields.map((f) => (
            <div key={f.id} className="flex justify-between items-center gap-4 py-3 border-b last:border-0">
              <span className="text-sm text-muted-foreground">{f.label}</span>
              {onCopy ? (
                <button
                  type="button"
                  onClick={() => void onCopy(f.value, `yc-complete-${f.id}`)}
                  className="flex items-center gap-2 font-mono text-sm hover:text-primary transition-colors text-right"
                >
                  <span className="break-all">{f.value}</span>
                  {copiedField === `yc-complete-${f.id}` ? (
                    <Check className="h-4 w-4 text-primary shrink-0" />
                  ) : (
                    <Copy className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </button>
              ) : (
                <span className="font-mono text-sm">{f.value}</span>
              )}
            </div>
          ))
        )}
      </div>

      <Button className="w-full" asChild>
        <Link
          href={transactionWebDetailPath(transactionId, { returnTo })}
          replace
        >
          {isMomo ? YC_PAY_IN_MOMO_AUTHORIZE_CTA : "I've made the payment"}
        </Link>
      </Button>
    </div>
  )
}
