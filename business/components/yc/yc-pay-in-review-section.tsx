"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  computeYcFundBalancePrincipalLocalPayIn,
  getGlobalPayoutProcessingTime,
  resolveYcCrossBorderLocalPayInBreakdownForDisplay,
  resolveYcFundBalanceLocalPayInBreakdownForDisplay,
  REVIEW_ROW_LABELS,
  TLC_LOCAL_TRANSFER_METHOD,
  useYcPayInLock,
  useYcPayInAttest,
  ycPayInCompleteCta,
  type YcPayInRail,
} from "@easner/shared"
import { YcLocalPayInReview } from "@/components/yc-local-pay-in-review"
import { YcPayInPaymentInstructions } from "@/components/yc/yc-pay-in-payment-instructions"
import { YcPayInAwaitingPaymentCountdown } from "@/components/yc/yc-pay-in-awaiting-payment-countdown"
import { CreditDestinationRow } from "@/components/transactions/credit-destination-row"
import type { ReactNode } from "react"

export type YcPayInLockedQuote = {
  ok: true
  transferId: string | null
  transactionId?: string | null
  easnerTransactionId?: string | null
  localPayIn: number
  usdCredit?: number
  customerRate: number
  processingFee?: number
  ycChannelFeeUsd?: number
  ycLegFeesUsd?: number
  displayProcessingFeeLocal?: number
  provisionalPayIn?: number
  bankInfo?: Record<string, unknown> | null
  expiresAt: string
  sourcePhone?: string
  sourceNetworkName?: string
}

type FundBalanceLockInput = {
  flowMode: "fund_balance"
  lockKey: string
  getCachedLocked: () => YcPayInLockedQuote | null
  confirmOrder: () => Promise<YcPayInLockedQuote | null>
  getErrorMessage?: () => string | null
  payInCurrency: string
  payInRail: YcPayInRail
  amountEntryMode: "usd" | "local"
  enteredAmount: number
  previewUsdCredit: number
  previewLocalPayIn: number
  previewCustomerRate: number
}

type CrossBorderLockInput = {
  flowMode: "cross_border_send"
  lockKey: string
  getCachedLocked: () => YcPayInLockedQuote | null
  confirmOrder: () => Promise<YcPayInLockedQuote | null>
  getErrorMessage?: () => string | null
  payInCurrency: string
  receiveCurrency: string
  receiveAmount: number
  payInRail: YcPayInRail
  recipientNode?: ReactNode
  clientCustomerRate?: number
  clientProvisionalLocalPayIn?: number
}

type AttestInput = {
  onAttest: (input: { transactionId: string; transferId: string }) => Promise<{ attestedAt: string }>
  onSuccess: (transactionId: string) => void
}

type Props = (FundBalanceLockInput | CrossBorderLockInput) & {
  attest: AttestInput
  copiedField?: string | null
  onCopy?: (text: string, field: string) => void
}

function isCompleteLockedQuote(q: YcPayInLockedQuote | null | undefined): q is YcPayInLockedQuote {
  return Boolean(q?.ok && q.transferId && q.localPayIn > 0 && q.customerRate > 0)
}

export function YcPayInReviewSection(props: Props) {
  const [copiedFieldLocal, setCopiedFieldLocal] = useState<string | null>(null)
  const copiedField = props.copiedField ?? copiedFieldLocal

  const handleCopy = props.onCopy
    ? props.onCopy
    : async (text: string, field: string) => {
        try {
          await navigator.clipboard.writeText(text)
          setCopiedFieldLocal(field)
          setTimeout(() => setCopiedFieldLocal(null), 2000)
        } catch {
          // ignore
        }
      }

  const { quote, isLocked, isLoading, error: lockError } = useYcPayInLock<YcPayInLockedQuote>({
    enabled: Boolean(props.lockKey),
    lockKey: props.lockKey,
    getCachedLocked: props.getCachedLocked,
    isLocked: isCompleteLockedQuote,
    lock: props.confirmOrder,
    getErrorMessage: props.getErrorMessage,
    defaultErrorMessage:
      props.flowMode === "fund_balance"
        ? "Could not lock deposit details"
        : "Could not lock transfer details",
  })

  const { attestLoading, attestError, attestPayment } = useYcPayInAttest({
    attest: props.attest.onAttest,
    onSuccess: props.attest.onSuccess,
  })

  if (isLoading && !isLocked) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Confirming rate…</p>
      </div>
    )
  }

  if (!isLocked || !quote?.transferId) {
    return lockError ? <p className="text-sm text-destructive">{lockError}</p> : null
  }

  const transactionId = quote.easnerTransactionId ?? quote.transactionId ?? ""
  const customerRate = quote.customerRate
  const localPayIn = quote.localPayIn

  if (props.flowMode === "fund_balance") {
    const usdCredit = quote.usdCredit ?? props.previewUsdCredit
    const breakdown = resolveYcFundBalanceLocalPayInBreakdownForDisplay({
      localPayIn,
      localCurrency: props.payInCurrency,
      usdCredit,
      exchangeRate: customerRate,
      displayProcessingFeeLocal: quote.displayProcessingFeeLocal,
      processingFee: quote.processingFee,
      exchangeFee: quote.ycChannelFeeUsd ?? quote.ycLegFeesUsd,
    })
    const principalLocal =
      breakdown.principalLocal ??
      computeYcFundBalancePrincipalLocalPayIn({ usdCredit, exchangeRate: customerRate })

    return (
      <div className="space-y-4">
        <YcLocalPayInReview
          mode="fund_balance"
          phase="locked"
          rail={props.payInRail}
          payInCurrency={props.payInCurrency}
          receiveCurrency="USD"
          customerRate={customerRate}
          localPayIn={localPayIn}
          receiveAmount={usdCredit}
          processingFeeLocal={breakdown.feeLocal}
          processingFeeUsd={quote.processingFee}
          exchangeFeeUsd={quote.ycChannelFeeUsd ?? quote.ycLegFeesUsd}
          principalLocal={principalLocal}
          usdCredit={usdCredit}
          transactionId={transactionId || undefined}
          creditDestinationNode={
            <CreditDestinationRow
              label={REVIEW_ROW_LABELS.creditTo}
              currency="USD"
              balanceLabel="USD Balance"
            />
          }
        />
        {quote.expiresAt ? <YcPayInAwaitingPaymentCountdown depositExpiresAt={quote.expiresAt} /> : null}
        <YcPayInPaymentInstructions
          payInRail={props.payInRail}
          localPayIn={localPayIn}
          localCurrency={props.payInCurrency}
          bankInfo={quote.bankInfo}
          sourcePhone={quote.sourcePhone}
          sourceNetworkName={quote.sourceNetworkName}
          transactionId={transactionId}
          copiedField={copiedField}
          onCopy={handleCopy}
        />
        {attestError ? <p className="text-sm text-destructive text-center">{attestError}</p> : null}
        <Button
          className="w-full"
          type="button"
          disabled={attestLoading}
          onClick={() => void attestPayment(transactionId, quote.transferId!)}
        >
          {attestLoading ? "Confirming…" : ycPayInCompleteCta(props.payInRail)}
        </Button>
      </div>
    )
  }

  const receiveAmount = props.receiveAmount
  const breakdown = resolveYcCrossBorderLocalPayInBreakdownForDisplay({
    localPayIn,
    payInCurrency: props.payInCurrency,
    receiveAmount,
    customerRate,
    provisionalPayIn: quote.provisionalPayIn ?? props.clientProvisionalLocalPayIn,
    displayProcessingFeeLocal: quote.displayProcessingFeeLocal,
  })
  const processingTime = getGlobalPayoutProcessingTime(TLC_LOCAL_TRANSFER_METHOD)

  return (
    <div className="space-y-4">
      <YcLocalPayInReview
        mode="cross_border_send"
        phase="locked"
        rail={props.payInRail}
        payInCurrency={props.payInCurrency}
        receiveCurrency={props.receiveCurrency}
        customerRate={customerRate}
        localPayIn={localPayIn}
        receiveAmount={receiveAmount}
        processingFeeLocal={breakdown.feeLocal}
        processingFeeUsd={quote.processingFee}
        exchangeFeeUsd={quote.ycLegFeesUsd}
        principalLocal={breakdown.principalLocal}
        transactionId={transactionId || undefined}
        processingTime={processingTime}
        recipientNode={props.recipientNode}
      />
      {quote.expiresAt ? <YcPayInAwaitingPaymentCountdown depositExpiresAt={quote.expiresAt} /> : null}
      <YcPayInPaymentInstructions
        payInRail={props.payInRail}
        localPayIn={localPayIn}
        localCurrency={props.payInCurrency}
        bankInfo={quote.bankInfo}
        sourcePhone={quote.sourcePhone}
        sourceNetworkName={quote.sourceNetworkName}
        transactionId={transactionId}
        copiedField={copiedField}
        onCopy={handleCopy}
      />
      {attestError ? <p className="text-sm text-destructive text-center">{attestError}</p> : null}
      <Button
        className="w-full"
        type="button"
        disabled={attestLoading}
        onClick={() => void attestPayment(transactionId, quote.transferId!)}
      >
        {attestLoading ? "Confirming…" : ycPayInCompleteCta(props.payInRail)}
      </Button>
    </div>
  )
}
