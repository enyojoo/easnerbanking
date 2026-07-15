/**
 * Yellowcard pricing — mirror Noah `computeGlobalPayoutPricing` for three YC products.
 * Customer rate is fixed; pay-in / debit solved for YC leg costs + Easner fees.
 */

import { computePayoutProcessingFeeBps } from "./payout-processing-fee"

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
    omnibusInUsd =
      omnibusFromResponse > 0
        ? omnibusFromResponse
        : roundUsdc(localPayIn / ycSellRate - ycLegFeesUsd)
    const processingFee = computePayoutProcessingFeeBps(omnibusInUsd + ycLegFeesUsd, {
      bps: input.processingFeeBps,
    })
    const marginAmount = roundUsdc(
      Math.max(0, localPayIn / customerSellRate - (omnibusInUsd + ycLegFeesUsd)),
    )
    usdCredit = roundUsdc(Math.max(0, omnibusInUsd - processingFee - marginAmount * 0))
    // User credit ≈ omnibus − processing (FX margin already in sell rate asymmetry)
    usdCredit = roundUsdc(Math.max(0, omnibusInUsd - processingFee))
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
