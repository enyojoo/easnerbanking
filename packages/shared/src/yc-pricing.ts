/**
 * Yellowcard pricing — mirror Noah `computeGlobalPayoutPricing` for three YC products.
 *
 * Pricing model:
 * - Customer rate = Easner rate (easner_sell / easner_buy / cross rate). FX margin (0.5%) is in the rate.
 * - YC provider rates (yc_sell, yc_buy) = omnibus sizing + internal surplus — never customer-facing.
 * - Display processing fee = Easner 1% leg + all YC leg fees (one row via computeDisplayProcessingFee).
 * - Pay-in solve never shrinks credit/receive — local pay-in moves up for YC fees.
 * - Easner 1% base = value customer buys/moves (usdCredit for fund balance; customerPrincipalUsd for cross-border).
 *   Never apply 1% to gross localPayIn.
 * - Pay-in fee display: local currency (Easner rate conversion, display-only).
 * - Pay-out fee display: USD.
 */

import { computeDisplayProcessingFee, computePayoutProcessingFeeBps } from "./payout-processing-fee"

function roundUsdc(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 1_000_000) / 1_000_000
}

function roundLocal(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

/** Quote TTL — YC receive locks ~10 minutes. */
export const YC_QUOTE_TTL_MS = 10 * 60 * 1000

/** Easner 1% leg in pay-in currency from USD credit (display-only). */
export function easnerFeeLocalFromUsdCredit(usdCredit: number, easnerSellRate: number): number {
  return roundLocal(usdCredit * easnerSellRate * 0.01)
}

/** Convert YC leg fees USD → pay-in currency for display (display-only). */
export function ycLegFeesLocal(ycLegFeesUsd: number, easnerRate: number): number {
  return roundLocal(ycLegFeesUsd * easnerRate)
}

export type BuildYcDisplayQuoteInput = {
  processingFee: number
  ycLegFeesUsd: number
  /** easner_sell or cross-rate-derived pay-in rate for local display */
  easnerRateForDisplay: number
  payInCurrency?: string
  /** When set (fund balance), Easner local leg uses credit value × rate × 1%. */
  usdCredit?: number
}

export type YcDisplayQuoteFees = {
  displayProcessingFee: number
  displayProcessingFeeLocal: number
  displayProcessingFeeCurrency?: string
}

/** Build canonical USD + local display processing fee (pay-in flows). */
export function buildYcDisplayQuote(input: BuildYcDisplayQuoteInput): YcDisplayQuoteFees {
  const displayProcessingFee = computeDisplayProcessingFee({
    processingFee: input.processingFee,
    exchangeFee: input.ycLegFeesUsd,
  })
  const easnerFeeLocal =
    input.usdCredit != null && input.usdCredit > 0
      ? easnerFeeLocalFromUsdCredit(input.usdCredit, input.easnerRateForDisplay)
      : roundLocal(input.processingFee * input.easnerRateForDisplay)
  const ycLocal = ycLegFeesLocal(input.ycLegFeesUsd, input.easnerRateForDisplay)
  return {
    displayProcessingFee,
    displayProcessingFeeLocal: roundLocal(easnerFeeLocal + ycLocal),
    displayProcessingFeeCurrency: input.payInCurrency,
  }
}

/** Simpler helper when usdCredit is known (fund balance). */
export function buildYcFundBalanceDisplayFees(input: {
  usdCredit: number
  processingFee: number
  ycLegFeesUsd: number
  easnerSellRate: number
  payInCurrency: string
}): YcDisplayQuoteFees {
  const displayProcessingFee = computeDisplayProcessingFee({
    processingFee: input.processingFee,
    exchangeFee: input.ycLegFeesUsd,
  })
  const easnerFeeLocal = easnerFeeLocalFromUsdCredit(input.usdCredit, input.easnerSellRate)
  const ycLocal = ycLegFeesLocal(input.ycLegFeesUsd, input.easnerSellRate)
  return {
    displayProcessingFee,
    displayProcessingFeeLocal: roundLocal(easnerFeeLocal + ycLocal),
    displayProcessingFeeCurrency: input.payInCurrency,
  }
}

/** Cross-border pay-in display fees (Easner cross rate for local conversion). */
export function buildYcCrossBorderDisplayFees(input: {
  processingFee: number
  ycLegFeesUsd: number
  easnerSellFrom: number
  payInCurrency: string
}): YcDisplayQuoteFees {
  const displayProcessingFee = computeDisplayProcessingFee({
    processingFee: input.processingFee,
    exchangeFee: input.ycLegFeesUsd,
  })
  return {
    displayProcessingFee,
    displayProcessingFeeLocal: roundLocal(displayProcessingFee * input.easnerSellFrom),
    displayProcessingFeeCurrency: input.payInCurrency,
  }
}

export type YcLegFeeInputs = {
  /** USDC crypto amount YC will settle / require */
  cryptoAmountUsd: number
  networkFeeAmountUsd?: number
  serviceFeeAmountUsd?: number
  /** Provider local↔USD rate from POST response */
  providerRate?: number
}

export type ComputeYcBalancePayoutPricingInput = {
  receiveAmount: number
  customerRate: number
  /** YC send floor in USDC (settlementInfo.cryptoAmount or converted) */
  ycFloorUsd: number
  ycMidUsd?: number
  networkFeeAmountUsd?: number
  serviceFeeAmountUsd?: number
  processingFeeBps?: number
}

export type YcBalancePayoutPricing = {
  receiveAmount: number
  customerRate: number
  customerPrincipal: number
  midNotional: number
  marginAmount: number
  ycFloorUsd: number
  channelCost: number
  processingFee: number
  displayChannelCost: number
  totalDebited: number
}

/**
 * Balance payout (USD → local via YC send). Mirror computeGlobalPayoutPricing.
 */
export function computeYcBalancePayoutPricing(
  input: ComputeYcBalancePayoutPricingInput,
): YcBalancePayoutPricing {
  const receiveAmount = input.receiveAmount
  const customerRate = input.customerRate
  const ycFloorUsd = roundUsdc(input.ycFloorUsd)
  if (!Number.isFinite(receiveAmount) || receiveAmount <= 0) {
    throw new Error("receiveAmount must be positive")
  }
  if (!Number.isFinite(customerRate) || customerRate <= 0) {
    throw new Error("customerRate must be positive")
  }
  if (!Number.isFinite(ycFloorUsd) || ycFloorUsd <= 0) {
    throw new Error("ycFloorUsd must be positive")
  }

  const midNotional = roundUsdc(
    input.ycMidUsd != null && Number.isFinite(input.ycMidUsd) && input.ycMidUsd > 0
      ? input.ycMidUsd
      : receiveAmount / (customerRate / 0.995),
  )
  const customerPrincipal = roundUsdc(receiveAmount / customerRate)
  const marginAmount = roundUsdc(Math.max(0, customerPrincipal - midNotional))
  const feeSum = roundUsdc(
    (input.networkFeeAmountUsd ?? 0) + (input.serviceFeeAmountUsd ?? 0),
  )
  const channelCost = roundUsdc(
    feeSum > 0 ? feeSum : Math.max(0, ycFloorUsd - midNotional - marginAmount),
  )
  const baseTotalDebited = roundUsdc(ycFloorUsd + marginAmount)
  const displayChannelCost = roundUsdc(Math.max(0, baseTotalDebited - customerPrincipal))
  const processingFee = computePayoutProcessingFeeBps(customerPrincipal, {
    bps: input.processingFeeBps,
  })
  const totalDebited = roundUsdc(baseTotalDebited + processingFee)

  return {
    receiveAmount,
    customerRate,
    customerPrincipal,
    midNotional,
    marginAmount,
    ycFloorUsd,
    channelCost,
    processingFee,
    displayChannelCost,
    totalDebited,
  }
}

/** Conservative YC receive leg fee estimate before POST /receive returns actual fees. */
export function estimateYcReceiveLegFeesUsd(input: {
  omnibusUsd: number
  customerSellRate: number
  ycSellRate: number
}): number {
  const omnibusUsd = roundUsdc(input.omnibusUsd)
  if (omnibusUsd <= 0) return 0
  if (!Number.isFinite(input.ycSellRate) || input.ycSellRate <= 0) return 0
  if (!Number.isFinite(input.customerSellRate) || input.customerSellRate <= 0) return 0
  const spread = Math.max(0, input.customerSellRate / input.ycSellRate - 1)
  return roundUsdc(Math.max(omnibusUsd * spread * 1.25, omnibusUsd * 0.02))
}

/** Fund balance receive leg estimate from locked USD credit target. */
export function estimateYcFundBalanceReceiveLegFeesUsd(input: {
  usdCredit: number
  customerSellRate: number
  ycSellRate: number
  processingFeeBps?: number
}): number {
  const usdCredit = roundUsdc(input.usdCredit)
  if (usdCredit <= 0) return 0
  const processingFee = computePayoutProcessingFeeBps(usdCredit, { bps: input.processingFeeBps })
  return estimateYcReceiveLegFeesUsd({
    omnibusUsd: roundUsdc(usdCredit + processingFee),
    customerSellRate: input.customerSellRate,
    ycSellRate: input.ycSellRate,
  })
}

/** Send exactly = locked USD credit at Easner rate + all processing fees (local). */
export function computeYcFundBalanceSendExactlyLocal(input: {
  usdCredit: number
  customerSellRate: number
  displayProcessingFeeLocal: number
}): number {
  return roundLocal(input.usdCredit * input.customerSellRate + input.displayProcessingFeeLocal)
}

export type ComputeYcFundBalancePricingInput = {
  /** Desired USD credit (user-facing) or omit and solve from pay-in */
  usdCredit?: number
  /** Local pay-in amount if fixed */
  localPayIn?: number
  /** Customer easner_sell (local per USDC) */
  customerSellRate: number
  /** Provider yc_sell */
  ycSellRate: number
  receiveLeg: YcLegFeeInputs
  processingFeeBps?: number
}

export type YcFundBalancePricing = {
  localPayIn: number
  usdCredit: number
  customerSellRate: number
  ycSellRate: number
  omnibusInUsd: number
  ycLegFeesUsd: number
  processingFee: number
  marginAmount: number
}

/**
 * Local fund balance: user pays local → USD balance credit.
 * Pay-in solved upward for YC receive fees + Easner 1% when usdCredit is the target.
 */
export function computeYcFundBalancePricing(
  input: ComputeYcFundBalancePricingInput,
): YcFundBalancePricing {
  const customerSellRate = input.customerSellRate
  const ycSellRate = input.ycSellRate
  if (!Number.isFinite(customerSellRate) || customerSellRate <= 0) {
    throw new Error("customerSellRate must be positive")
  }
  if (!Number.isFinite(ycSellRate) || ycSellRate <= 0) {
    throw new Error("ycSellRate must be positive")
  }

  const ycLegFeesUsd = roundUsdc(
    (input.receiveLeg.networkFeeAmountUsd ?? 0) + (input.receiveLeg.serviceFeeAmountUsd ?? 0),
  )
  const omnibusFromResponse = roundUsdc(input.receiveLeg.cryptoAmountUsd)

  let localPayIn: number
  let usdCredit: number
  let omnibusInUsd: number

  if (input.localPayIn != null && input.localPayIn > 0) {
    localPayIn = roundLocal(input.localPayIn)

    const bps = input.processingFeeBps ?? 100
    const grossUsd = roundUsdc(localPayIn / customerSellRate)
    usdCredit = roundUsdc((grossUsd - ycLegFeesUsd) / (1 + bps / 10_000))
    const processingFee = computePayoutProcessingFeeBps(usdCredit, {
      bps: input.processingFeeBps,
    })
    const omnibusFromResponse = roundUsdc(input.receiveLeg.cryptoAmountUsd)
    omnibusInUsd =
      omnibusFromResponse > 0
        ? omnibusFromResponse
        : roundUsdc(usdCredit + processingFee)
    const marginAmount = roundUsdc(
      Math.max(0, localPayIn / customerSellRate - (usdCredit + processingFee + ycLegFeesUsd)),
    )
    return {
      localPayIn,
      usdCredit,
      customerSellRate,
      ycSellRate,
      omnibusInUsd,
      ycLegFeesUsd,
      processingFee,
      marginAmount,
    }
  }

  usdCredit = roundUsdc(input.usdCredit ?? 0)
  if (usdCredit <= 0) throw new Error("usdCredit or localPayIn required")

  // Solve: pay-in so that after YC fees + processing, user gets usdCredit
  const processingFee = computePayoutProcessingFeeBps(usdCredit, { bps: input.processingFeeBps })
  const neededOmnibus = roundUsdc(usdCredit + processingFee)
  const grossUsd = roundUsdc(neededOmnibus + ycLegFeesUsd)
  localPayIn = roundLocal(grossUsd * customerSellRate)
  omnibusInUsd = omnibusFromResponse > 0 ? omnibusFromResponse : neededOmnibus
  const marginAmount = roundUsdc(Math.max(0, localPayIn / customerSellRate - grossUsd))

  return {
    localPayIn,
    usdCredit,
    customerSellRate,
    ycSellRate,
    omnibusInUsd,
    ycLegFeesUsd,
    processingFee,
    marginAmount,
  }
}

export type ComputeYcCrossBorderPricingInput = {
  /** Locked receive amount in destination local */
  receiveAmount: number
  /** Customer cross rate (dest per source), from yellowcard_rates */
  customerRate: number
  receiveLeg: YcLegFeeInputs
  sendLeg: YcLegFeeInputs
  /** Provider sell for pay-in currency */
  ycSellFrom: number
  /** Provider buy for receive currency */
  ycBuyTo: number
  processingFeeBps?: number
}

export type YcCrossBorderPricing = {
  receiveAmount: number
  customerRate: number
  provisionalPayIn: number
  localPayIn: number
  receiveCryptoUsd: number
  sendCryptoUsd: number
  ycLegFeesUsd: number
  processingFee: number
  marginAmount: number
  omnibusSurplusUsd: number
}

/**
 * Cross-border: customer rate fixed; solve pay-in so omnibus covers leg 2 + fees.
 */
export function computeYcCrossBorderPricing(
  input: ComputeYcCrossBorderPricingInput,
): YcCrossBorderPricing {
  const receiveAmount = input.receiveAmount
  const customerRate = input.customerRate
  if (!Number.isFinite(receiveAmount) || receiveAmount <= 0) {
    throw new Error("receiveAmount must be positive")
  }
  if (!Number.isFinite(customerRate) || customerRate <= 0) {
    throw new Error("customerRate must be positive")
  }
  if (!Number.isFinite(input.ycSellFrom) || input.ycSellFrom <= 0) {
    throw new Error("ycSellFrom must be positive")
  }
  if (!Number.isFinite(input.ycBuyTo) || input.ycBuyTo <= 0) {
    throw new Error("ycBuyTo must be positive")
  }

  const provisionalPayIn = roundLocal(receiveAmount / customerRate)
  const sendCryptoUsd = roundUsdc(
    input.sendLeg.cryptoAmountUsd > 0
      ? input.sendLeg.cryptoAmountUsd
      : receiveAmount / input.ycBuyTo,
  )
  const ycLegFeesUsd = roundUsdc(
    (input.receiveLeg.networkFeeAmountUsd ?? 0) +
      (input.receiveLeg.serviceFeeAmountUsd ?? 0) +
      (input.sendLeg.networkFeeAmountUsd ?? 0) +
      (input.sendLeg.serviceFeeAmountUsd ?? 0),
  )
  const midNotional = roundUsdc(receiveAmount / (input.ycBuyTo / input.ycSellFrom))
  const customerPrincipalUsd = roundUsdc(provisionalPayIn / input.ycSellFrom)
  const marginAmount = roundUsdc(Math.max(0, customerPrincipalUsd - midNotional))
  const processingFee = computePayoutProcessingFeeBps(customerPrincipalUsd, {
    bps: input.processingFeeBps,
  })

  // Needed omnibus inflow ≈ send crypto + receive leg fees already deducted by YC + processing + FX margin
  const neededGrossUsd = roundUsdc(sendCryptoUsd + ycLegFeesUsd + processingFee + marginAmount)
  const localPayIn = roundLocal(neededGrossUsd * input.ycSellFrom)

  const receiveCryptoUsd = roundUsdc(
    input.receiveLeg.cryptoAmountUsd > 0
      ? input.receiveLeg.cryptoAmountUsd
      : localPayIn / input.ycSellFrom - (input.receiveLeg.networkFeeAmountUsd ?? 0) - (input.receiveLeg.serviceFeeAmountUsd ?? 0),
  )
  const omnibusSurplusUsd = roundUsdc(
    Math.max(0, receiveCryptoUsd - sendCryptoUsd),
  )

  return {
    receiveAmount,
    customerRate,
    provisionalPayIn,
    localPayIn,
    receiveCryptoUsd,
    sendCryptoUsd,
    ycLegFeesUsd,
    processingFee,
    marginAmount,
    omnibusSurplusUsd,
  }
}

/**
 * Cross-border pay-in before POST /receive: pad receive leg fees from send leg quote.
 */
export function computeYcCrossBorderPricingBeforeReceive(input: {
  receiveAmount: number
  customerRate: number
  ycSellFrom: number
  ycBuyTo: number
  easnerSellFrom: number
  sendLeg: YcLegFeeInputs
  processingFeeBps?: number
}): YcCrossBorderPricing {
  const preview = computeYcCrossBorderPricing({
    receiveAmount: input.receiveAmount,
    customerRate: input.customerRate,
    ycSellFrom: input.ycSellFrom,
    ycBuyTo: input.ycBuyTo,
    processingFeeBps: input.processingFeeBps,
    receiveLeg: { cryptoAmountUsd: 0, networkFeeAmountUsd: 0, serviceFeeAmountUsd: 0 },
    sendLeg: input.sendLeg,
  })
  const omnibusBase = roundUsdc(
    preview.sendCryptoUsd + preview.ycLegFeesUsd + preview.processingFee + preview.marginAmount,
  )
  const estimatedReceiveFees = estimateYcReceiveLegFeesUsd({
    omnibusUsd: omnibusBase,
    customerSellRate: input.easnerSellFrom,
    ycSellRate: input.ycSellFrom,
  })
  return computeYcCrossBorderPricing({
    receiveAmount: input.receiveAmount,
    customerRate: input.customerRate,
    ycSellFrom: input.ycSellFrom,
    ycBuyTo: input.ycBuyTo,
    processingFeeBps: input.processingFeeBps,
    receiveLeg: {
      cryptoAmountUsd: 0,
      networkFeeAmountUsd: estimatedReceiveFees,
      serviceFeeAmountUsd: 0,
    },
    sendLeg: input.sendLeg,
  })
}
