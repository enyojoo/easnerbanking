import { payoutReceiveAmountsMatch } from "@easner/shared"
import type { SendFlowState } from "@/lib/send-flow-session"
import type { WalletSendQuoteResult } from "./wallet-send-quote"

export function mapWalletQuoteToFlowState(
  state: SendFlowState,
  q: WalletSendQuoteResult,
): SendFlowState {
  return {
    ...state,
    amount: q.receiveAmount,
    sendAmount: q.sendAmount,
    totalAmount: q.totalDebited,
    walletQuote: {
      recipientId: state.recipient.id,
      receiveAmount: q.receiveAmount,
      receiveCurrency: q.receiveCurrency,
      receiveNetwork: q.receiveNetwork,
      sendAmount: q.sendAmount,
      sendCurrency: q.sendCurrency,
      totalDebited: q.totalDebited,
      marginAmount: q.marginAmount,
      channelCost: q.channelCost,
      processingFee: q.processingFee,
      displayChannelCost: q.displayChannelCost,
      networkFee: q.networkFee,
      customerRate: q.customerRate,
      bridgeMid: q.bridgeMid,
      formSessionId: q.formSessionId,
      cryptoAuthorizedAmount: q.wallet.cryptoAuthorizedAmount,
      cryptoCurrency: q.sendCurrency,
      pricingQuoteId: q.pricingQuoteId,
      expiresAt: q.expiresAt,
      executionModel: q.executionModel,
      bridgeFloor: q.wallet.bridgeFloor,
      ...(q.quotePhase ? { quotePhase: q.quotePhase } : {}),
    },
  }
}

export function isWalletQuoteFresh(
  wq: SendFlowState["walletQuote"] | undefined,
  receiveAmount: number,
  recipientId: string,
): boolean {
  if (!wq?.formSessionId || !wq.expiresAt) return false
  if (!wq.recipientId?.trim() || wq.recipientId.trim() !== recipientId.trim()) return false
  if (!payoutReceiveAmountsMatch(wq.receiveAmount, receiveAmount)) return false
  if (new Date(wq.expiresAt).getTime() <= Date.now()) return false
  if (wq.quotePhase === "locked") return true
  if (wq.quotePhase === "preview") return false
  return true
}
