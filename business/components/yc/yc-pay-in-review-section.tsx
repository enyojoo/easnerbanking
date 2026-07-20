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
  type YcLocalPayInReviewPhase,
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

  const { quote: lockedQuote, isLocked, isLoading, error: lockError } = useYcPayInLock<YcPayInLockedQuote>({
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

  const reviewPhase: YcLocalPayInReviewPhase = isLocked ? "locked" : "preview"
  const transactionId = lockedQuote?.easnerTransactionId ?? lockedQuote?.transactionId ?? ""

  if (props.flowMode === "fund_balance") {
    const customerRate = lockedQuote?.customerRate ?? props.previewCustomerRate
    const localPayIn = lockedQuote?.localPayIn ?? props.previewLocalPayIn
    const usdCredit = lockedQuote?.usdCredit ?? props.previewUsdCredit
    const breakdown = resolveYcFundBalanceLocalPayInBreakdownForDisplay({
      localPayIn,
      localCurrency: props.payInCurrency,
      usdCredit,
      exchangeRate: customerRate,
      displayProcessingFeeLocal: lockedQuote?.displayProcessingFeeLocal,
      processingFee: lockedQuote?.processingFee,
      exchangeFee: lockedQuote?.ycChannelFeeUsd ?? lockedQuote?.ycLegFeesUsd,
    })
    const principalLocal =
      breakdown.principalLocal ??
      computeYcFundBalancePrincipalLocalPayIn({ usdCredit, exchangeRate: customerRate })

    const ctaDisabled =
      !isLocked ||
      attestLoading ||
      Boolean(lockError) ||
      !lockedQuote?.transferId

    return (
      <div className="space-y-4">
        <YcLocalPayInReview
          mode="fund_balance"
          phase={reviewPhase}
          rail={props.payInRail}
          payInCurrency={props.payInCurrency}
          receiveCurrency="USD"
          customerRate={customerRate}
          localPayIn={localPayIn}
          receiveAmount={usdCredit}
          processingFeeLocal={breakdown.feeLocal}
          processingFeeUsd={lockedQuote?.processingFee}
          exchangeFeeUsd={lockedQuote?.ycChannelFeeUsd ?? lockedQuote?.ycLegFeesUsd}
          principalLocal={principalLocal}
          usdCredit={usdCredit}
          transactionId={transactionId || undefined}
          copiedField={copiedField}
          onCopy={handleCopy}
          creditDestinationNode={
            <CreditDestinationRow
              label={REVIEW_ROW_LABELS.creditTo}
              currency="USD"
              balanceLabel="USD Balance"
            />
          }
        />

        {isLocked && lockedQuote ? (
          <>
            {lockedQuote.expiresAt ? (
              <YcPayInAwaitingPaymentCountdown
                depositExpiresAt={lockedQuote.expiresAt}
                context="review"
              />
            ) : null}
            <YcPayInPaymentInstructions
              payInRail={props.payInRail}
              localPayIn={localPayIn}
              localCurrency={props.payInCurrency}
              bankInfo={lockedQuote.bankInfo}
              sourcePhone={lockedQuote.sourcePhone}
              sourceNetworkName={lockedQuote.sourceNetworkName}
              transactionId={transactionId}
              copiedField={copiedField}
              onCopy={handleCopy}
            />
          </>
        ) : null}

        {lockError ? <p className="text-sm text-destructive text-center">{lockError}</p> : null}
        {attestError ? <p className="text-sm text-destructive text-center">{attestError}</p> : null}
        <Button
          className="w-full"
          type="button"
          disabled={ctaDisabled}
          onClick={() => {
            if (!lockedQuote?.transferId || !transactionId) return
            void attestPayment(transactionId, lockedQuote.transferId)
          }}
        >
          {attestLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Confirming…
            </>
          ) : (
            ycPayInCompleteCta(props.payInRail)
          )}
        </Button>
      </div>
    )
  }

  const receiveAmount = props.receiveAmount
  const customerRate = lockedQuote?.customerRate ?? props.clientCustomerRate ?? 0
  const localPayIn = lockedQuote?.localPayIn ?? props.clientProvisionalLocalPayIn ?? 0
  const breakdown = resolveYcCrossBorderLocalPayInBreakdownForDisplay({
    localPayIn,
    payInCurrency: props.payInCurrency,
    receiveAmount,
    customerRate,
    provisionalPayIn: lockedQuote?.provisionalPayIn ?? props.clientProvisionalLocalPayIn,
    displayProcessingFeeLocal: lockedQuote?.displayProcessingFeeLocal,
  })
  const processingTime = getGlobalPayoutProcessingTime(TLC_LOCAL_TRANSFER_METHOD)

  const ctaDisabled =
    !isLocked ||
    attestLoading ||
    Boolean(lockError) ||
    !lockedQuote?.transferId

  return (
    <div className="space-y-4">
      <YcLocalPayInReview
        mode="cross_border_send"
        phase={reviewPhase}
        rail={props.payInRail}
        payInCurrency={props.payInCurrency}
        receiveCurrency={props.receiveCurrency}
        customerRate={customerRate}
        localPayIn={localPayIn}
        receiveAmount={receiveAmount}
        processingFeeLocal={breakdown.feeLocal}
        processingFeeUsd={lockedQuote?.processingFee}
        exchangeFeeUsd={lockedQuote?.ycLegFeesUsd}
        principalLocal={breakdown.principalLocal}
        transactionId={transactionId || undefined}
        processingTime={isLocked ? processingTime : undefined}
        recipientNode={props.recipientNode}
        copiedField={copiedField}
        onCopy={handleCopy}
      />

      {isLocked && lockedQuote ? (
        <>
          {lockedQuote.expiresAt ? (
            <YcPayInAwaitingPaymentCountdown
              depositExpiresAt={lockedQuote.expiresAt}
              context="review"
            />
          ) : null}
          <YcPayInPaymentInstructions
            payInRail={props.payInRail}
            localPayIn={localPayIn}
            localCurrency={props.payInCurrency}
            bankInfo={lockedQuote.bankInfo}
            sourcePhone={lockedQuote.sourcePhone}
            sourceNetworkName={lockedQuote.sourceNetworkName}
            transactionId={transactionId}
            copiedField={copiedField}
            onCopy={handleCopy}
          />
        </>
      ) : null}

      {lockError ? <p className="text-sm text-destructive text-center">{lockError}</p> : null}
      {attestError ? <p className="text-sm text-destructive text-center">{attestError}</p> : null}
      <Button
        className="w-full"
        type="button"
        disabled={ctaDisabled}
        onClick={() => {
          if (!lockedQuote?.transferId || !transactionId) return
          void attestPayment(transactionId, lockedQuote.transferId)
        }}
      >
        {attestLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Confirming…
          </>
        ) : (
          ycPayInCompleteCta(props.payInRail)
        )}
      </Button>
    </div>
  )
}
