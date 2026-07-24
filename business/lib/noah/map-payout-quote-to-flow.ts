import { payoutReceiveAmountsMatch, resolvePayoutQuoteSettlement } from "@easner/shared"
import type { PayoutQuoteResult } from "@/lib/noah/payout-quote"
import type { SendFlowState } from "@/lib/send-flow-session"

export function mapPayoutQuoteToFlowState(
  state: SendFlowState,
  q: PayoutQuoteResult,
): SendFlowState {
  const leg = resolvePayoutQuoteSettlement(q) ?? q.settlement
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
      midRate: leg.customerRate,
      noahFee: channelFee,
      noahFeeCurrency: q.sendCurrency,
      easnerFee,
      easnerFeeCurrency: q.sendCurrency,
      formSessionId: leg.sessionId,
      cryptoAuthorizedAmount: leg.cryptoAuthorizedAmount,
      cryptoCurrency: leg.cryptoCurrency,
      channelId: q.channelId,
      pricingQuoteId: q.pricingQuoteId,
      expiresAt: q.expiresAt,
      noahFloor: leg.cryptoFloor,
      noahSendAmount: leg.cryptoSendAmount,
      marginAmount: q.marginAmount,
      channelCost: q.channelCost,
      processingFee: q.processingFee,
      displayChannelCost: q.displayChannelCost,
      customerPrincipal: q.customerPrincipal,
      marginCaptureMode: leg.marginCaptureMode,
      ...(leg.providerMid != null ? { noahMid: leg.providerMid } : {}),
      ...(q.noah.scheduleFee != null ? { scheduleFee: q.noah.scheduleFee } : {}),
      ...(q.noah.prepareChannelFee != null ? { prepareChannelFee: q.noah.prepareChannelFee } : {}),
      ...(q.noah.quoteNoahMid != null ? { quoteNoahMid: q.noah.quoteNoahMid } : {}),
      ...(q.provider ? { provider: q.provider } : {}),
      ...(q.displayProcessingFee != null ? { displayProcessingFee: q.displayProcessingFee } : {}),
      ...(q.ycLegFeesUsd != null ? { ycLegFeesUsd: q.ycLegFeesUsd } : {}),
      ...(q.yc?.sequenceId ? { ycSequenceId: q.yc.sequenceId } : {}),
      ...(q.yc?.sendId ? { ycSendId: q.yc.sendId } : {}),
      ...(q.yc?.walletAddress ? { ycWalletAddress: q.yc.walletAddress } : {}),
      ...(q.yc?.cryptoAmount != null ? { ycCryptoAmount: q.yc.cryptoAmount } : {}),
      ...(q.lockId ? { lockId: q.lockId } : {}),
      ...(q.quotePhase ? { quotePhase: q.quotePhase } : {}),
      ...(q.grid?.quoteId ? { gridQuoteId: q.grid.quoteId } : {}),
      ...(q.grid?.sequenceId ? { gridSequenceId: q.grid.sequenceId } : {}),
      ...(q.grid?.customerId ? { gridCustomerId: q.grid.customerId } : {}),
      ...(q.grid?.externalAccountId ? { gridExternalAccountId: q.grid.externalAccountId } : {}),
      ...(q.grid?.cryptoAmount != null ? { gridCryptoAmount: q.grid.cryptoAmount } : {}),
      ...(q.grid?.fundingAddress ? { gridFundingAddress: q.grid.fundingAddress } : {}),
    },
  }
}

export function isPayoutQuotePreviewFresh(
  pq: SendFlowState["payoutQuote"] | undefined,
  receiveAmount: number,
  recipientId: string,
): boolean {
  if (!pq?.formSessionId || !pq.expiresAt) return false
  if (!pq.recipientId?.trim() || pq.recipientId.trim() !== recipientId.trim()) return false
  if (!payoutReceiveAmountsMatch(pq.receiveAmount, receiveAmount)) return false
  if (new Date(pq.expiresAt).getTime() <= Date.now()) return false
  if (pq.quotePhase === "locked") return false
  if (pq.lockId || pq.ycSendId) return false
  return pq.quotePhase === "preview" || pq.quotePhase == null
}

export function isPayoutQuoteFresh(
  pq: SendFlowState["payoutQuote"] | undefined,
  receiveAmount: number,
  recipientId: string,
): boolean {
  if (!pq?.formSessionId || !pq.expiresAt) return false
  if (!pq.recipientId?.trim() || pq.recipientId.trim() !== recipientId.trim()) return false
  if (!payoutReceiveAmountsMatch(pq.receiveAmount, receiveAmount)) return false
  if (new Date(pq.expiresAt).getTime() <= Date.now()) return false
  if (pq.quotePhase === "preview") return false
  if (pq.quotePhase === "locked") {
    return Boolean(pq.lockId || pq.ycSendId || pq.gridQuoteId)
  }
  return true
}
