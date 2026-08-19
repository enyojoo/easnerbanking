import { payoutReceiveAmountsMatch, resolvePayoutQuoteSettlement } from "@easner/shared"
import type { PayoutQuoteResult } from "@/lib/noah/payout-quote"
import type { SendFlowState } from "@/lib/send-flow-session"

/** Grid Review/details sent amount is live `POST /quotes` sending, not Office FX principal. */
export function payoutQuoteReviewYouSendAmount(
  pq: SendFlowState["payoutQuote"] | undefined,
  fallbackSendAmount = 0,
): number {
  if (pq?.provider === "grid") {
    const crypto = Number(pq.gridCryptoAmount ?? pq.cryptoAuthorizedAmount ?? pq.noahSendAmount)
    if (Number.isFinite(crypto) && crypto > 0) return crypto
  }
  const principal = pq?.customerPrincipal ?? pq?.sendAmount
  if (principal != null && Number.isFinite(principal) && principal > 0) return principal
  return fallbackSendAmount
}

export function mapPayoutQuoteToFlowState(
  state: SendFlowState,
  q: PayoutQuoteResult,
): SendFlowState {
  const leg = resolvePayoutQuoteSettlement(q) ?? q.settlement
  const easnerFee = q.processingFee
  const channelFee = q.channelCost
  const requestedReceiveAmount =
    state.requestedReceiveAmount ?? q.requestedReceiveAmount ?? q.receiveAmount
  return {
    ...state,
    // Keep the amount entered by the customer stable across review. YC's rounded-up
    // provider amount lives in payoutQuote.receiveAmount for execution/audit only.
    requestedReceiveAmount,
    amount: requestedReceiveAmount,
    sendAmount: q.customerPrincipal,
    totalAmount: q.totalDebited,
    payoutQuote: {
      recipientId: state.recipient.id,
      requestedReceiveAmount: q.requestedReceiveAmount,
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
  if (!payoutReceiveAmountsMatch(pq.requestedReceiveAmount ?? pq.receiveAmount, receiveAmount)) return false
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
  if (!payoutReceiveAmountsMatch(pq.requestedReceiveAmount ?? pq.receiveAmount, receiveAmount)) return false
  if (new Date(pq.expiresAt).getTime() <= Date.now()) return false
  if (pq.quotePhase === "preview") return false
  if (pq.quotePhase === "locked") {
    if (pq.provider === "grid") return Boolean(pq.lockId && pq.gridQuoteId)
    return Boolean(pq.lockId || pq.ycSendId)
  }
  return true
}
