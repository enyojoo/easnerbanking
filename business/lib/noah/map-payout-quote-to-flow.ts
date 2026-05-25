import { computeBalancePayoutExchangeFee } from "@easner/shared"
import type { PayoutQuoteResult } from "@/lib/noah/payout-quote"
import type { SendFlowState } from "@/lib/send-flow-session"

export function mapPayoutQuoteToFlowState(
  state: SendFlowState,
  q: PayoutQuoteResult,
): SendFlowState {
  const easnerFee =
    q.easner.pricingTotals?.total_easner_fee ?? q.easner.totalFeeAmount ?? 0
  const youSendAtMid =
    q.noah.rate && q.noah.rate > 0 ? q.receiveAmount / q.noah.rate : state.sendAmount
  const exchangeFeeInBalance = computeBalancePayoutExchangeFee(
    q.totalDebited,
    youSendAtMid,
    easnerFee,
  )
  return {
    ...state,
    payoutQuote: {
      receiveAmount: q.receiveAmount,
      sendAmount: q.sendAmount,
      sendCurrency: q.sendCurrency,
      totalDebited: q.totalDebited,
      midRate: q.noah.rate,
      noahFee: exchangeFeeInBalance,
      noahFeeCurrency: q.sendCurrency,
      easnerFee,
      easnerFeeCurrency: q.sendCurrency,
      formSessionId: q.noah.formSessionId,
      cryptoAuthorizedAmount: q.noah.cryptoAuthorizedAmount,
      cryptoCurrency: q.noah.cryptoCurrency,
      channelId: q.channelId,
      pricingQuoteId: q.pricingQuoteId,
      expiresAt: q.expiresAt,
    },
  }
}

export function isPayoutQuoteFresh(
  pq: SendFlowState["payoutQuote"] | undefined,
  receiveAmount: number,
): boolean {
  if (!pq?.formSessionId || !pq.expiresAt) return false
  if (pq.receiveAmount !== receiveAmount) return false
  return new Date(pq.expiresAt).getTime() > Date.now()
}
