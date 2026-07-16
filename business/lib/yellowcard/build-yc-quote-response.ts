import {
  buildYcCrossBorderDisplayFees,
  buildYcFundBalanceDisplayFees,
  computeDisplayProcessingFee,
  computeYcFundBalancePricing,
  computeYcCrossBorderPricing,
  type YcPayInRail,
  type YcQuoteSummary,
} from "@easner/shared"

export function buildFundBalanceQuoteSummary(input: {
  pricing: ReturnType<typeof computeYcFundBalancePricing>
  currency: string
  customerRate: number
  rail: YcPayInRail
  expiresAt: string
  transactionId: string
  transferId: string
  bankInfo?: Record<string, unknown> | null
  sourcePhone?: string
  sourceNetworkId?: string
  sourceNetworkName?: string
}): YcQuoteSummary & { ok: true; sequenceId?: string; payInNotice?: string } {
  const displayFees = buildYcFundBalanceDisplayFees({
    usdCredit: input.pricing.usdCredit,
    processingFee: input.pricing.processingFee,
    ycLegFeesUsd: input.pricing.ycLegFeesUsd,
    easnerSellRate: input.customerRate,
    payInCurrency: input.currency,
  })
  const provisional = computeYcFundBalancePricing({
    usdCredit: input.pricing.usdCredit,
    customerSellRate: input.pricing.customerSellRate,
    ycSellRate: input.pricing.ycSellRate,
    receiveLeg: { cryptoAmountUsd: 0, networkFeeAmountUsd: 0, serviceFeeAmountUsd: 0 },
  })
  return {
    ok: true,
    customerRate: input.customerRate,
    provisionalPayIn: provisional.localPayIn,
    localPayIn: input.pricing.localPayIn,
    creditOrReceiveAmount: input.pricing.usdCredit,
    processingFee: input.pricing.processingFee,
    ycLegFeesUsd: input.pricing.ycLegFeesUsd,
    displayProcessingFee: displayFees.displayProcessingFee,
    displayProcessingFeeLocal: displayFees.displayProcessingFeeLocal,
    displayProcessingFeeCurrency: displayFees.displayProcessingFeeCurrency,
    expiresAt: input.expiresAt,
    transactionId: input.transactionId,
    transferId: input.transferId,
    payInRail: input.rail,
    bankInfo: input.bankInfo ?? null,
    sourcePhone: input.sourcePhone,
    sourceNetworkId: input.sourceNetworkId,
    sourceNetworkName: input.sourceNetworkName,
    // Legacy aliases for existing clients
    usdCredit: input.pricing.usdCredit,
    ycChannelFeeUsd: input.pricing.ycLegFeesUsd,
  }
}

export function buildCrossBorderQuoteSummary(input: {
  pricing: ReturnType<typeof computeYcCrossBorderPricing>
  payInCurrency: string
  receiveCurrency: string
  customerRate: number
  rail: YcPayInRail
  expiresAt: string
  transactionId: string
  transferId: string
  bankInfo?: Record<string, unknown> | null
  sourcePhone?: string
  sourceNetworkId?: string
  sourceNetworkName?: string
  easnerSellFrom: number
}): YcQuoteSummary & {
  ok: true
  localPayIn: number
  receiveAmount: number
  receiveCurrency: string
} {
  const displayFees = buildYcCrossBorderDisplayFees({
    processingFee: input.pricing.processingFee,
    ycLegFeesUsd: input.pricing.ycLegFeesUsd,
    easnerSellFrom: input.easnerSellFrom,
    payInCurrency: input.payInCurrency,
  })
  return {
    ok: true,
    customerRate: input.customerRate,
    provisionalPayIn: input.pricing.provisionalPayIn,
    localPayIn: input.pricing.localPayIn,
    creditOrReceiveAmount: input.pricing.receiveAmount,
    receiveAmount: input.pricing.receiveAmount,
    receiveCurrency: input.receiveCurrency,
    processingFee: input.pricing.processingFee,
    ycLegFeesUsd: input.pricing.ycLegFeesUsd,
    displayProcessingFee: displayFees.displayProcessingFee,
    displayProcessingFeeLocal: displayFees.displayProcessingFeeLocal,
    displayProcessingFeeCurrency: displayFees.displayProcessingFeeCurrency,
    expiresAt: input.expiresAt,
    transactionId: input.transactionId,
    transferId: input.transferId,
    payInRail: input.rail,
    bankInfo: input.bankInfo ?? null,
    sourcePhone: input.sourcePhone,
    sourceNetworkId: input.sourceNetworkId,
    sourceNetworkName: input.sourceNetworkName,
  }
}

export function fundBalanceDisplayProcessingFee(
  pricing: ReturnType<typeof computeYcFundBalancePricing>,
): number {
  return computeDisplayProcessingFee({
    processingFee: pricing.processingFee,
    exchangeFee: pricing.ycLegFeesUsd,
  })
}
