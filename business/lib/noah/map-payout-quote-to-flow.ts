import { payoutReceiveAmountsMatch } from "@easner/shared"
import type { PayoutQuoteResult } from "@/lib/noah/payout-quote"
import type { SendFlowState } from "@/lib/send-flow-session"

export function mapPayoutQuoteToFlowState(
  state: SendFlowState,
  q: PayoutQuoteResult,
): SendFlowState {
  const easnerFee = q.processingFee
  const channelFee = q.channelCost
  return {
    ...state,
    amount: q.receiveAmount,
    sendAmount: q.customerPrincipal,
    totalAmount: q.totalDebited,
    payoutQuote: {
      recipientId: state.recipient.id,
      receiveAmount: q.receiveAmount,
      sendAmount: q.customerPrincipal,
      sendCurrency: q.sendCurrency,
      totalDebited: q.totalDebited,
      midRate: q.noah.rate,
      noahFee: channelFee,
      noahFeeCurrency: q.sendCurrency,
      easnerFee,
      easnerFeeCurrency: q.sendCurrency,
      formSessionId: q.noah.formSessionId,
      cryptoAuthorizedAmount: q.noah.cryptoAuthorizedAmount,
      cryptoCurrency: q.noah.cryptoCurrency,
      channelId: q.channelId,
      pricingQuoteId: q.pricingQuoteId,
      expiresAt: q.expiresAt,
      noahFloor: q.noah.noahFloor,
      noahSendAmount: q.noah.noahSendAmount,
      marginAmount: q.marginAmount,
      channelCost: q.channelCost,
      processingFee: q.processingFee,
      displayChannelCost: q.displayChannelCost,
      customerPrincipal: q.customerPrincipal,
      marginCaptureMode: q.noah.marginCaptureMode,
      noahMid: q.noah.noahMid,
      ...(q.noah.scheduleFee != null ? { scheduleFee: q.noah.scheduleFee } : {}),
      ...(q.noah.prepareChannelFee != null ? { prepareChannelFee: q.noah.prepareChannelFee } : {}),
      ...(q.noah.quoteNoahMid != null ? { quoteNoahMid: q.noah.quoteNoahMid } : {}),
      ...(q.provider ? { provider: q.provider } : {}),
      ...(q.yc?.sequenceId ? { ycSequenceId: q.yc.sequenceId } : {}),
      ...(q.yc?.sendId ? { ycSendId: q.yc.sendId } : {}),
      ...(q.yc?.walletAddress ? { ycWalletAddress: q.yc.walletAddress } : {}),
      ...(q.yc?.cryptoAmount != null ? { ycCryptoAmount: q.yc.cryptoAmount } : {}),
    },
  }
}

export function isPayoutQuoteFresh(
  pq: SendFlowState["payoutQuote"] | undefined,
  receiveAmount: number,
  recipientId: string,
): boolean {
  if (!pq?.formSessionId || !pq.expiresAt) return false
  if (!pq.recipientId?.trim() || pq.recipientId.trim() !== recipientId.trim()) return false
  if (!payoutReceiveAmountsMatch(pq.receiveAmount, receiveAmount)) return false
  return new Date(pq.expiresAt).getTime() > Date.now()
}
