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
import { useQuoteCountdown } from "@/hooks/use-quote-countdown"
import {
  isStashedCrossBorderQuoteFresh,
  isCompleteCrossBorderQuote,
  peekCrossBorderQuote,
  type CrossBorderQuoteStashMeta,
} from "@/lib/yc-cross-border-quote-cache"
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
  receiveAmount?: number
  requestedReceiveAmount?: number
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
  crossBorderMeta?: CrossBorderQuoteStashMeta
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
  clientProcessingFee?: number
  clientDisplayProcessingFeeLocal?: number
  clientYcLegFeesUsd?: number
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

  if (props.flowMode === "fund_balance") {
    const cachedLocked = props.getCachedLocked()
    const stashedLocked =
      cachedLocked && isCompleteLockedQuote(cachedLocked) ? cachedLocked : null
    const activeLockedQuote = lockedQuote ?? stashedLocked
    const displayLocked = isLocked || Boolean(stashedLocked)
    const reviewPhase: YcLocalPayInReviewPhase = displayLocked ? "locked" : "preview"
    const customerRate = activeLockedQuote?.customerRate ?? props.previewCustomerRate
    const localPayIn = activeLockedQuote?.localPayIn ?? props.previewLocalPayIn
    const usdCredit = activeLockedQuote?.usdCredit ?? props.previewUsdCredit
    const transactionId =
      activeLockedQuote?.easnerTransactionId ?? activeLockedQuote?.transactionId ?? ""
    const breakdown = resolveYcFundBalanceLocalPayInBreakdownForDisplay({
      localPayIn,
      localCurrency: props.payInCurrency,
      usdCredit,
      exchangeRate: customerRate,
      displayProcessingFeeLocal: activeLockedQuote?.displayProcessingFeeLocal,
      processingFee: activeLockedQuote?.processingFee,
      exchangeFee: activeLockedQuote?.ycChannelFeeUsd ?? activeLockedQuote?.ycLegFeesUsd,
    })
    const principalLocal =
      breakdown.principalLocal ??
      computeYcFundBalancePrincipalLocalPayIn({ usdCredit, exchangeRate: customerRate })

    const ctaDisabled =
      !displayLocked ||
      attestLoading ||
      Boolean(lockError) ||
      !activeLockedQuote?.transferId

    if (!displayLocked && isLoading) {
      return (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )
    }

    return (
      <div className="space-y-4">
        {displayLocked ? (
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
          processingFeeUsd={activeLockedQuote?.processingFee}
          exchangeFeeUsd={activeLockedQuote?.ycChannelFeeUsd ?? activeLockedQuote?.ycLegFeesUsd}
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
        ) : null}

        {displayLocked && activeLockedQuote ? (
          <>
            {activeLockedQuote.expiresAt ? (
              <YcPayInAwaitingPaymentCountdown
                depositExpiresAt={activeLockedQuote.expiresAt}
                context="review"
              />
            ) : null}
            <YcPayInPaymentInstructions
              payInRail={props.payInRail}
              localPayIn={localPayIn}
              localCurrency={props.payInCurrency}
              bankInfo={activeLockedQuote.bankInfo}
              sourcePhone={activeLockedQuote.sourcePhone}
              sourceNetworkName={activeLockedQuote.sourceNetworkName}
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
            if (!activeLockedQuote?.transferId || !transactionId) return
            void attestPayment(transactionId, activeLockedQuote.transferId)
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

  const requestedReceiveAmount = props.receiveAmount
  const stashedQuote =
    props.crossBorderMeta && isStashedCrossBorderQuoteFresh(props.crossBorderMeta)
      ? peekCrossBorderQuote()
      : null
  const stashedLocked =
    stashedQuote && isCompleteCrossBorderQuote(stashedQuote) ? stashedQuote : null
  const activeLockedQuote = lockedQuote ?? stashedLocked
  const displayLocked = isLocked || Boolean(stashedLocked)
  const crossBorderReviewPhase: YcLocalPayInReviewPhase = displayLocked ? "locked" : "preview"
  const displayQuote = activeLockedQuote ?? stashedQuote
  const receiveAmount = displayQuote?.receiveAmount ?? requestedReceiveAmount
  const crossBorderTransactionId =
    activeLockedQuote?.easnerTransactionId ?? activeLockedQuote?.transactionId ?? ""
  const quoteCountdown = useQuoteCountdown(displayQuote?.expiresAt)
  const customerRate =
    displayQuote?.customerRate ?? props.clientCustomerRate ?? 0
  const localPayIn =
    displayQuote?.localPayIn ??
    props.clientProvisionalLocalPayIn ??
    0
  const breakdown = resolveYcCrossBorderLocalPayInBreakdownForDisplay({
    localPayIn,
    payInCurrency: props.payInCurrency,
    receiveAmount,
    customerRate,
    provisionalPayIn:
      displayQuote?.provisionalPayIn ?? props.clientProvisionalLocalPayIn,
    displayProcessingFeeLocal:
      displayQuote?.displayProcessingFeeLocal ?? props.clientDisplayProcessingFeeLocal,
  })
  const processingTime = getGlobalPayoutProcessingTime(TLC_LOCAL_TRANSFER_METHOD)

  const ctaDisabled =
    !displayLocked ||
    attestLoading ||
    quoteCountdown.expired ||
    Boolean(lockError) ||
    !activeLockedQuote?.transferId

  return (
    <div className="space-y-4">
      <YcLocalPayInReview
        mode="cross_border_send"
        phase={crossBorderReviewPhase}
        rail={props.payInRail}
        payInCurrency={props.payInCurrency}
        receiveCurrency={props.receiveCurrency}
        customerRate={customerRate}
        localPayIn={localPayIn}
        receiveAmount={receiveAmount}
        requestedReceiveAmount={
          displayQuote?.requestedReceiveAmount ?? requestedReceiveAmount
        }
        processingFeeLocal={breakdown.feeLocal}
        processingFeeUsd={
          displayQuote?.processingFee ?? props.clientProcessingFee
        }
        exchangeFeeUsd={
          activeLockedQuote?.ycLegFeesUsd ??
          displayQuote?.ycLegFeesUsd ??
          props.clientYcLegFeesUsd
        }
        principalLocal={breakdown.principalLocal}
        transactionId={crossBorderTransactionId || undefined}
        processingTime={displayLocked ? processingTime : undefined}
        recipientNode={props.recipientNode}
        copiedField={copiedField}
        onCopy={handleCopy}
      />

      {displayLocked && activeLockedQuote ? (
        <>
          {activeLockedQuote.expiresAt ? (
            <YcPayInAwaitingPaymentCountdown
              depositExpiresAt={activeLockedQuote.expiresAt}
              context="review"
            />
          ) : null}
          <YcPayInPaymentInstructions
            payInRail={props.payInRail}
            localPayIn={localPayIn}
            localCurrency={props.payInCurrency}
            bankInfo={activeLockedQuote.bankInfo}
            sourcePhone={activeLockedQuote.sourcePhone}
            sourceNetworkName={activeLockedQuote.sourceNetworkName}
            transactionId={crossBorderTransactionId}
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
          if (!activeLockedQuote?.transferId || !crossBorderTransactionId) return
          void attestPayment(crossBorderTransactionId, activeLockedQuote.transferId)
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
