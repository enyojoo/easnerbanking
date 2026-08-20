import { computeDisplayProcessingFee } from "./payout-processing-fee"

export type PayoutMarginCaptureMode =
  | "surplus_send"
  | "split_debit"
  | "fee_wallet_deferred"
  | "fee_wallet_omnibus"

/** Provider-neutral crypto settlement leg for balance payout quotes. */
export type PayoutSettlementLeg = {
  totalFee: number
  feeCurrency: string
  cryptoAuthorizedAmount: string
  cryptoFloor: string
  cryptoSendAmount: string
  cryptoCurrency: string
  sessionId: string
  customerRate?: number
  providerMid?: number
  effectiveRate?: number
  marginCaptureMode: PayoutMarginCaptureMode
  channelCost: number
  marginAmount: number
  customerPrincipal: number
}

/** @deprecated Legacy Noah-shaped settlement block – prefer `settlement`. */
export type LegacyNoahPayoutSettlementLeg = {
  totalFee: number
  feeCurrency: string
  cryptoAuthorizedAmount: string
  noahFloor: string
  noahSendAmount: string
  cryptoCurrency: string
  formSessionId: string
  rate?: number
  noahMid?: number
  effectiveRate?: number
  marginCaptureMode: PayoutMarginCaptureMode
  channelCost: number
  marginAmount: number
  customerPrincipal: number
  scheduleFee?: number
  prepareChannelFee?: number
  prepareRemaining?: number
  quoteNoahMid?: number
}

export function buildLegacyNoahSettlementFromLeg(
  leg: PayoutSettlementLeg,
  extras?: Pick<
    LegacyNoahPayoutSettlementLeg,
    "scheduleFee" | "prepareChannelFee" | "prepareRemaining" | "quoteNoahMid"
  >,
): LegacyNoahPayoutSettlementLeg {
  return {
    totalFee: leg.totalFee,
    feeCurrency: leg.feeCurrency,
    cryptoAuthorizedAmount: leg.cryptoAuthorizedAmount,
    noahFloor: leg.cryptoFloor,
    noahSendAmount: leg.cryptoSendAmount,
    cryptoCurrency: leg.cryptoCurrency,
    formSessionId: leg.sessionId,
    rate: leg.customerRate,
    noahMid: leg.providerMid,
    effectiveRate: leg.effectiveRate,
    marginCaptureMode: leg.marginCaptureMode,
    channelCost: leg.channelCost,
    marginAmount: leg.marginAmount,
    customerPrincipal: leg.customerPrincipal,
    ...extras,
  }
}

export function resolvePayoutQuoteSettlement(input: {
  settlement?: PayoutSettlementLeg | null
  noah?: LegacyNoahPayoutSettlementLeg | null
  easner?: { providerRate?: number } | null
}): PayoutSettlementLeg | null {
  const s = input.settlement
  if (s?.sessionId && s.cryptoAuthorizedAmount) return s
  const n = input.noah
  if (!n?.formSessionId || !n.cryptoAuthorizedAmount) return null
  return {
    totalFee: n.totalFee,
    feeCurrency: n.feeCurrency,
    cryptoAuthorizedAmount: n.cryptoAuthorizedAmount,
    cryptoFloor: n.noahFloor,
    cryptoSendAmount: n.noahSendAmount,
    cryptoCurrency: n.cryptoCurrency,
    sessionId: n.formSessionId,
    customerRate: n.rate ?? n.effectiveRate ?? input.easner?.providerRate,
    providerMid: n.noahMid ?? n.quoteNoahMid,
    effectiveRate: n.effectiveRate ?? n.rate,
    marginCaptureMode: n.marginCaptureMode,
    channelCost: n.channelCost,
    marginAmount: n.marginAmount,
    customerPrincipal: n.customerPrincipal,
  }
}

/** Combined USD processing fee row = Easner 1% + channel/YC component. */
export function computePayoutQuoteDisplayProcessingFee(input: {
  processingFee?: number | null
  displayChannelCost?: number | null
  channelCost?: number | null
}): number {
  const channel =
    input.displayChannelCost != null && Number.isFinite(input.displayChannelCost)
      ? input.displayChannelCost
      : input.channelCost
  return computeDisplayProcessingFee({
    processingFee: input.processingFee,
    exchangeFee: channel,
  })
}

export function payoutReviewFeesFromQuote(input: {
  processingFee?: number | null
  displayChannelCost?: number | null
  channelCost?: number | null
  ycLegFeesUsd?: number | null
}): {
  easnerProcessingFee: number
  channelFee: number
  displayProcessingFee: number
  ycLegFeesUsd: number
} {
  const easnerProcessingFee = Number(input.processingFee ?? 0)
  const channelFee =
    input.displayChannelCost != null && Number.isFinite(input.displayChannelCost)
      ? Number(input.displayChannelCost)
      : Number(input.channelCost ?? 0)
  return {
    easnerProcessingFee,
    channelFee,
    displayProcessingFee: computePayoutQuoteDisplayProcessingFee(input),
    ycLegFeesUsd: Number(input.ycLegFeesUsd ?? input.channelCost ?? 0),
  }
}
