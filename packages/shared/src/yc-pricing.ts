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

function roundLocalUp(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.ceil(n * 100) / 100
}

/** Default USDC tolerance when comparing YC settlement vs required economics. */
export const YC_OMNIBUS_SUFFICIENCY_TOLERANCE_USDC = 0.02

/** Fund balance confirm/settle tolerance for YC conversion rounding (single POST /receive). */
export const YC_FUND_BALANCE_OMNIBUS_TOLERANCE_USDC = 1

/** Extra USDC padding on fund-balance pay-in solve before POST /receive (YC conversion slop). */
export const YC_FUND_BALANCE_OMNIBUS_SOLVE_BUFFER_USDC = 0

/** Fund balance confirm: one retry only when the first POST /receive is under-funded. */
export const YC_FUND_BALANCE_RECEIVE_MAX_ATTEMPTS = 2

/** Cross-border leg-1 confirm/settle tolerance for YC conversion rounding. */
export const YC_CROSS_BORDER_OMNIBUS_TOLERANCE_USDC = 1

/** Cross-border leg-1 confirm retries when POST /receive omnibus is short. */
export const YC_CROSS_BORDER_RECEIVE_MAX_ATTEMPTS = 3

/** Quote TTL — production 5min (YC PENDING_APPROVAL), sandbox 10min. */
export function resolveYcQuoteTtlMs(): number {
  const env = String(
    typeof process !== "undefined" ? process.env?.YELLOWCARD_ENVIRONMENT ?? "sandbox" : "sandbox",
  )
    .trim()
    .toLowerCase()
  return env === "production" ? 5 * 60 * 1000 : 10 * 60 * 1000
}

/** Prefer YC-provided expiry when valid; otherwise compute from environment TTL. */
export function resolveYcQuoteExpiresAt(preferred?: string | null): string {
  if (preferred) {
    const ms = new Date(preferred).getTime()
    if (Number.isFinite(ms) && ms > Date.now()) {
      return new Date(ms).toISOString()
    }
  }
  return new Date(Date.now() + resolveYcQuoteTtlMs()).toISOString()
}

/** @deprecated Use resolveYcQuoteTtlMs() for environment-aware TTL. */
export const YC_QUOTE_TTL_MS = resolveYcQuoteTtlMs()

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

/** Conservative YC send leg fee estimate before POST /send returns actual fees. */
export function estimateYcBalancePayoutSendLegFeesUsd(input: {
  provisionalCryptoUsd: number
  customerRate: number
  ycBuyRate?: number
}): number {
  const crypto = roundUsdc(input.provisionalCryptoUsd)
  if (crypto <= 0) return 0
  if (input.ycBuyRate != null && input.ycBuyRate > 0 && input.customerRate > 0) {
    const spread = Math.max(0, input.customerRate / input.ycBuyRate - 1)
    return roundUsdc(Math.max(crypto * spread * 1.25, crypto * 0.02))
  }
  return roundUsdc(crypto * 0.02)
}

/** Preview pricing with padded YC floor before POST /send locks actual cryptoAmount. */
export function computeYcBalancePayoutPricingBeforeSend(input: {
  receiveAmount: number
  customerRate: number
  provisionalCryptoUsd: number
  ycMidUsd?: number
  ycBuyRate?: number
  processingFeeBps?: number
}): YcBalancePayoutPricing {
  const estimatedFees = estimateYcBalancePayoutSendLegFeesUsd({
    provisionalCryptoUsd: input.provisionalCryptoUsd,
    customerRate: input.customerRate,
    ycBuyRate: input.ycBuyRate,
  })
  const paddedFloor = roundUsdc(input.provisionalCryptoUsd + estimatedFees)
  return computeYcBalancePayoutPricing({
    receiveAmount: input.receiveAmount,
    customerRate: input.customerRate,
    ycFloorUsd: paddedFloor,
    ycMidUsd: input.ycMidUsd,
    networkFeeAmountUsd: estimatedFees,
    serviceFeeAmountUsd: 0,
    processingFeeBps: input.processingFeeBps,
  })
}

export type YcBalancePayoutEconomicsCheck = {
  ok: boolean
  ledgerSurplus: number
  requiredRevenue: number
  totalDebited: number
  cryptoAmount: number
}

/** Balance payout: wallet debit must cover on-chain send + Easner revenue (margin + 1% fee). */
export function computeYcBalancePayoutLedgerSurplus(input: {
  totalDebited: number
  cryptoAuthorizedAmount: number
}): number {
  return roundUsdc(
    Math.max(0, roundUsdc(input.totalDebited) - roundUsdc(input.cryptoAuthorizedAmount)),
  )
}

export function checkYcBalancePayoutEconomicsSufficient(input: {
  totalDebited: number
  cryptoAmount: number
  marginAmount: number
  processingFee: number
  tolerance?: number
}): YcBalancePayoutEconomicsCheck {
  const tolerance = input.tolerance ?? YC_OMNIBUS_SUFFICIENCY_TOLERANCE_USDC
  const totalDebited = roundUsdc(input.totalDebited)
  const cryptoAmount = roundUsdc(input.cryptoAmount)
  const ledgerSurplus = computeYcBalancePayoutLedgerSurplus({
    totalDebited,
    cryptoAuthorizedAmount: cryptoAmount,
  })
  const requiredRevenue = roundUsdc(input.marginAmount + input.processingFee)
  return {
    ok:
      totalDebited >= cryptoAmount - tolerance &&
      ledgerSurplus >= requiredRevenue - tolerance,
    ledgerSurplus,
    requiredRevenue,
    totalDebited,
    cryptoAmount,
  }
}

export function assertYcBalancePayoutEconomicsSufficient(input: {
  totalDebited: number
  cryptoAmount: number
  marginAmount: number
  processingFee: number
  tolerance?: number
}): void {
  const result = checkYcBalancePayoutEconomicsSufficient(input)
  if (!result.ok) {
    throw new Error(
      `yc_payout_economics_invalid: surplus ${result.ledgerSurplus} < required ${result.requiredRevenue}`,
    )
  }
}

/** Fee wallet sweep capped to wallet-debit surplus after YC on-chain send. */
export function computeYcBalancePayoutCappedFeeWalletSweep(input: {
  totalDebited: number
  cryptoAuthorizedAmount: number
  marginAmount?: number
  processingFee?: number
}): number {
  const quoted = roundUsdc(Number(input.marginAmount ?? 0) + Number(input.processingFee ?? 0))
  const surplus = computeYcBalancePayoutLedgerSurplus(input)
  return Math.min(quoted, surplus)
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
  rail?: "bank_transfer" | "mobile_money"
}): number {
  const usdCredit = roundUsdc(input.usdCredit)
  if (usdCredit <= 0) return 0
  const processingFee = computePayoutProcessingFeeBps(usdCredit, { bps: input.processingFeeBps })
  const omnibusUsd = roundUsdc(usdCredit + processingFee)
  const base = estimateYcReceiveLegFeesUsd({
    omnibusUsd,
    customerSellRate: input.customerSellRate,
    ycSellRate: input.ycSellRate,
  })
  const minPct = input.rail === "bank_transfer" ? 0.025 : 0.02
  return roundUsdc(Math.max(base, omnibusUsd * minPct))
}

/**
 * YC often embeds receive leg fees in `cryptoAmount` without populating fee fields.
 * Infer missing fees from locked local pay-in vs omnibus settlement when needed.
 */
export function inferYcReceiveLegFeesUsd(input: {
  lockedLocalPayIn: number
  customerSellRate: number
  cryptoAmountUsd: number
  networkFeeAmountUsd?: number
  serviceFeeAmountUsd?: number
}): number {
  const reported = roundUsdc(
    (input.networkFeeAmountUsd ?? 0) + (input.serviceFeeAmountUsd ?? 0),
  )
  if (reported > 0) return reported
  const grossUsd = roundUsdc(input.lockedLocalPayIn / input.customerSellRate)
  const cryptoAmountUsd = roundUsdc(input.cryptoAmountUsd)
  if (
    grossUsd > 0 &&
    cryptoAmountUsd > 0 &&
    grossUsd > cryptoAmountUsd + YC_OMNIBUS_SUFFICIENCY_TOLERANCE_USDC
  ) {
    return roundUsdc(grossUsd - cryptoAmountUsd)
  }
  return 0
}

/**
 * Build receive leg from POST /receive: use reported network + service fees when present;
 * infer embedded fees only when both reported fee fields are zero.
 */
export function buildYcReceiveLegFromResponse(input: {
  cryptoAmountUsd: number
  lockedLocalPayIn: number
  customerSellRate: number
  networkFeeAmountUsd?: number
  serviceFeeAmountUsd?: number
}): YcLegFeeInputs {
  const cryptoAmountUsd = roundUsdc(input.cryptoAmountUsd)
  const networkFeeAmountUsd = roundUsdc(input.networkFeeAmountUsd ?? 0)
  const serviceFeeAmountUsd = roundUsdc(input.serviceFeeAmountUsd ?? 0)
  const reportedTotal = roundUsdc(networkFeeAmountUsd + serviceFeeAmountUsd)

  if (reportedTotal > 0) {
    return { cryptoAmountUsd, networkFeeAmountUsd, serviceFeeAmountUsd }
  }

  const inferredFees = inferYcReceiveLegFeesUsd({
    lockedLocalPayIn: input.lockedLocalPayIn,
    customerSellRate: input.customerSellRate,
    cryptoAmountUsd,
    networkFeeAmountUsd: 0,
    serviceFeeAmountUsd: 0,
  })

  return {
    cryptoAmountUsd,
    networkFeeAmountUsd: inferredFees,
    serviceFeeAmountUsd: 0,
  }
}

/** Retry POST /receive with extra local pay-in when omnibus settlement is short. */
export function bumpYcFundBalanceLocalPayInForOmnibusShortfall(input: {
  localPayIn: number
  customerSellRate: number
  requiredOmnibus: number
  cryptoAmount: number
  padRatio?: number
}): number {
  const shortfall = Math.max(0, roundUsdc(input.requiredOmnibus - input.cryptoAmount))
  if (shortfall <= YC_OMNIBUS_SUFFICIENCY_TOLERANCE_USDC) {
    return roundLocalUp(input.localPayIn)
  }
  const pad = input.padRatio ?? 1.02
  const fromShortfall = shortfall * input.customerSellRate * pad
  const minBumpLocal = input.customerSellRate * Math.max(shortfall, 1)
  return roundLocalUp(input.localPayIn + Math.max(fromShortfall, minBumpLocal))
}

/** Retry cross-border leg-1 POST /receive when receive crypto is below leg-2 + fee + margin. */
export function bumpYcCrossBorderLocalPayInForOmnibusShortfall(input: {
  localPayIn: number
  ycSellFrom: number
  requiredOmnibus: number
  cryptoAmount: number
  padRatio?: number
}): number {
  const shortfall = Math.max(0, roundUsdc(input.requiredOmnibus - input.cryptoAmount))
  if (shortfall <= YC_CROSS_BORDER_OMNIBUS_TOLERANCE_USDC) {
    return roundLocalUp(input.localPayIn)
  }
  const pad = input.padRatio ?? 1.05
  // Shortfall plus 1 USDC headroom — YC leg-1 crypto often lags local pay-in bumps slightly.
  const bumpUsd = roundUsdc(shortfall * pad + 1)
  return roundLocalUp(input.localPayIn + input.ycSellFrom * bumpUsd)
}

/** POST /receive local pay-in: leg2 + fees + margin + conversion buffer (always round up). */
export function resolveYcCrossBorderSubmitLocalPayIn(input: {
  pricing: YcCrossBorderPricing
  ycSellFrom: number
}): number {
  const requiredOmnibus = computeYcCrossBorderRequiredOmnibus({
    sendCryptoUsd: input.pricing.sendCryptoUsd,
    processingFee: input.pricing.processingFee,
    marginAmount: input.pricing.marginAmount,
  })
  const bufferUsd = roundUsdc(requiredOmnibus * 0.005)
  const grossUsd = roundUsdc(requiredOmnibus + input.pricing.ycLegFeesUsd + bufferUsd)
  const economicsLocal = roundLocalUp(grossUsd * input.ycSellFrom)
  return roundLocalUp(Math.max(input.pricing.localPayIn, economicsLocal))
}

function applyYcFundBalanceBeforeReceiveBuffer(
  pricing: YcFundBalancePricing,
  customerSellRate: number,
): YcFundBalancePricing {
  return {
    ...pricing,
    localPayIn: resolveYcFundBalanceSubmitLocalPayIn({
      pricing,
      customerSellRate,
    }),
  }
}

/** POST /receive local pay-in: credit + Easner fee + YC fees + conversion buffer (always round up). */
export function resolveYcFundBalanceSubmitLocalPayIn(input: {
  pricing: YcFundBalancePricing
  customerSellRate: number
}): number {
  const neededOmnibus = roundUsdc(input.pricing.usdCredit + input.pricing.processingFee)
  const bufferUsd = roundUsdc(neededOmnibus * 0.005)
  const grossUsd = roundUsdc(neededOmnibus + input.pricing.ycLegFeesUsd + bufferUsd)
  const economicsLocal = roundLocalUp(grossUsd * input.customerSellRate)
  return roundLocalUp(Math.max(input.pricing.localPayIn, economicsLocal))
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

  // Prefer usdCredit when both are set — padded local must not inflate the credit target.
  const usdCreditTarget = input.usdCredit != null && Number(input.usdCredit) > 0
  if (!usdCreditTarget && input.localPayIn != null && input.localPayIn > 0) {
    localPayIn = roundLocal(input.localPayIn)

    const bps = input.processingFeeBps ?? 100
    const grossUsd = roundUsdc(localPayIn / customerSellRate)
    usdCredit = roundUsdc((grossUsd - ycLegFeesUsd) / (1 + bps / 10_000))
    const processingFee = computePayoutProcessingFeeBps(usdCredit, {
      bps: input.processingFeeBps,
    })
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

export type YcOmnibusSufficiencyCheck = {
  ok: boolean
  requiredOmnibus: number
  cryptoAmount: number
}

/** Fund balance: leg1 crypto must cover user credit + Easner 1% processing fee. */
export function checkYcFundBalanceOmnibusSufficient(input: {
  cryptoAmount: number
  usdCredit: number
  processingFee: number
  tolerance?: number
}): YcOmnibusSufficiencyCheck {
  const tolerance = input.tolerance ?? YC_OMNIBUS_SUFFICIENCY_TOLERANCE_USDC
  const cryptoAmount = roundUsdc(input.cryptoAmount)
  const requiredOmnibus = roundUsdc(input.usdCredit + input.processingFee)
  return {
    ok: cryptoAmount >= requiredOmnibus - tolerance,
    requiredOmnibus,
    cryptoAmount,
  }
}

export function assertYcFundBalanceOmnibusSufficient(input: {
  cryptoAmount: number
  usdCredit: number
  processingFee: number
  tolerance?: number
}): void {
  const result = checkYcFundBalanceOmnibusSufficient(input)
  if (!result.ok) {
    throw new Error(
      `yc_omnibus_below_required: cryptoAmount ${result.cryptoAmount} < required ${result.requiredOmnibus}`,
    )
  }
}

/** Cross-border leg1 crypto must cover leg2 send + Easner 1% + FX margin. */
export function checkYcCrossBorderOmnibusSufficient(input: {
  receiveCryptoUsd: number
  sendCryptoUsd: number
  processingFee: number
  marginAmount: number
  tolerance?: number
}): YcOmnibusSufficiencyCheck {
  const tolerance = input.tolerance ?? YC_CROSS_BORDER_OMNIBUS_TOLERANCE_USDC
  const cryptoAmount = roundUsdc(input.receiveCryptoUsd)
  const requiredOmnibus = computeYcCrossBorderRequiredOmnibus({
    sendCryptoUsd: input.sendCryptoUsd,
    processingFee: input.processingFee,
    marginAmount: input.marginAmount,
  })
  return {
    ok: cryptoAmount >= requiredOmnibus - tolerance,
    requiredOmnibus,
    cryptoAmount,
  }
}

export function assertYcCrossBorderOmnibusSufficient(input: {
  receiveCryptoUsd: number
  sendCryptoUsd: number
  processingFee: number
  marginAmount: number
  tolerance?: number
}): void {
  const result = checkYcCrossBorderOmnibusSufficient(input)
  if (!result.ok) {
    throw new Error(
      `yc_omnibus_below_required: receiveCrypto ${result.cryptoAmount} < required ${result.requiredOmnibus}`,
    )
  }
}

export function computeYcCrossBorderRequiredOmnibus(input: {
  sendCryptoUsd: number
  processingFee: number
  marginAmount: number
}): number {
  return roundUsdc(input.sendCryptoUsd + input.processingFee + input.marginAmount)
}

/**
 * Fund balance amount-screen preview (Noah payout parity).
 * Shows principal at customer rate; fees appear on review/confirm.
 */
export type YcFundBalanceAmountPreview = {
  usdCredit: number
  /** Principal local at easner_sell (amount-screen display). */
  localPayIn: number
  /** Estimated all-in local pay-in for corridor min checks (fees, no flat USDC buffer). */
  estimatedTotalLocalPayIn: number
  feeInclusive: false
}

function computeYcFundBalanceEstimatedTotalLocalPayIn(input: {
  usdCredit?: number
  localPayIn?: number
  customerSellRate: number
  ycSellRate: number
  processingFeeBps?: number
  rail?: "bank_transfer" | "mobile_money"
}): YcFundBalancePricing {
  const usdCreditTarget = input.usdCredit != null && Number(input.usdCredit) > 0
  if (usdCreditTarget) {
    const estimatedReceiveFees = estimateYcFundBalanceReceiveLegFeesUsd({
      usdCredit: Number(input.usdCredit),
      customerSellRate: input.customerSellRate,
      ycSellRate: input.ycSellRate,
      processingFeeBps: input.processingFeeBps,
      rail: input.rail,
    })
    return computeYcFundBalancePricing({
      usdCredit: input.usdCredit,
      customerSellRate: input.customerSellRate,
      ycSellRate: input.ycSellRate,
      processingFeeBps: input.processingFeeBps,
      receiveLeg: {
        cryptoAmountUsd: 0,
        networkFeeAmountUsd: estimatedReceiveFees,
        serviceFeeAmountUsd: 0,
      },
    })
  }
  const localPayIn = Number(input.localPayIn)
  if (!(localPayIn > 0)) throw new Error("usdCredit or localPayIn required")
  const neededOmnibus = roundUsdc(localPayIn / input.customerSellRate)
  const bps = input.processingFeeBps ?? 100
  const usdCredit = roundUsdc(neededOmnibus / (1 + bps / 10_000))
  return computeYcFundBalanceEstimatedTotalLocalPayIn({
    usdCredit,
    customerSellRate: input.customerSellRate,
    ycSellRate: input.ycSellRate,
    processingFeeBps: input.processingFeeBps,
    rail: input.rail,
  })
}

/** Client/server amount-screen preview — principal at DB customer rate. */
export function computeYcFundBalanceAmountPreview(input: {
  amountEntryMode: "usd" | "local"
  enteredAmount: number
  customerSellRate: number
  ycSellRate: number
  processingFeeBps?: number
  rail?: "bank_transfer" | "mobile_money"
}): YcFundBalanceAmountPreview | null {
  if (!Number.isFinite(input.customerSellRate) || input.customerSellRate <= 0) return null
  if (!Number.isFinite(input.ycSellRate) || input.ycSellRate <= 0) return null
  if (!(input.enteredAmount > 0)) return null

  try {
    const estimated =
      input.amountEntryMode === "usd"
        ? computeYcFundBalanceEstimatedTotalLocalPayIn({
            usdCredit: input.enteredAmount,
            customerSellRate: input.customerSellRate,
            ycSellRate: input.ycSellRate,
            processingFeeBps: input.processingFeeBps,
            rail: input.rail,
          })
        : computeYcFundBalanceEstimatedTotalLocalPayIn({
            localPayIn: input.enteredAmount,
            customerSellRate: input.customerSellRate,
            ycSellRate: input.ycSellRate,
            processingFeeBps: input.processingFeeBps,
            rail: input.rail,
          })

    const principalLocal =
      input.amountEntryMode === "usd"
        ? roundLocal(input.enteredAmount * input.customerSellRate)
        : roundLocal(input.enteredAmount)

    return {
      usdCredit: estimated.usdCredit,
      localPayIn: principalLocal,
      estimatedTotalLocalPayIn: estimated.localPayIn,
      feeInclusive: false,
    }
  } catch {
    return null
  }
}

export function computeYcFundBalancePricingBeforeReceive(input: {
  usdCredit?: number
  localPayIn?: number
  customerSellRate: number
  ycSellRate: number
  processingFeeBps?: number
  rail?: "bank_transfer" | "mobile_money"
}): YcFundBalancePricing {
  const usdCreditTarget = input.usdCredit != null && Number(input.usdCredit) > 0
  if (usdCreditTarget) {
    const estimatedReceiveFees = estimateYcFundBalanceReceiveLegFeesUsd({
      usdCredit: Number(input.usdCredit),
      customerSellRate: input.customerSellRate,
      ycSellRate: input.ycSellRate,
      processingFeeBps: input.processingFeeBps,
      rail: input.rail,
    })
    return applyYcFundBalanceBeforeReceiveBuffer(
      computeYcFundBalancePricing({
        usdCredit: input.usdCredit,
        customerSellRate: input.customerSellRate,
        ycSellRate: input.ycSellRate,
        processingFeeBps: input.processingFeeBps,
        receiveLeg: {
          cryptoAmountUsd: 0,
          networkFeeAmountUsd: estimatedReceiveFees,
          serviceFeeAmountUsd: 0,
        },
      }),
      input.customerSellRate,
    )
  }
  const localPayIn = Number(input.localPayIn)
  if (!(localPayIn > 0)) {
    throw new Error("usdCredit or localPayIn required")
  }
  // Local entry covers credit + Easner fee; pad YC receive fees via the usdCredit solve path.
  const neededOmnibus = roundUsdc(localPayIn / input.customerSellRate)
  const bps = input.processingFeeBps ?? 100
  const usdCredit = roundUsdc(neededOmnibus / (1 + bps / 10_000))
  return computeYcFundBalancePricingBeforeReceive({
    usdCredit,
    customerSellRate: input.customerSellRate,
    ycSellRate: input.ycSellRate,
    processingFeeBps: input.processingFeeBps,
    rail: input.rail,
  })
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
  const priced = computeYcCrossBorderPricing({
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
  return {
    ...priced,
    localPayIn: resolveYcCrossBorderSubmitLocalPayIn({
      pricing: priced,
      ycSellFrom: input.ycSellFrom,
    }),
  }
}

/** Read locked local pay-in from POST /receive response (field names vary by YC API version). */
export function readYcReceiveLockedLocalAmount(
  receiveRes: Record<string, unknown> | null | undefined,
): number | null {
  if (!receiveRes) return null
  for (const key of ["localAmount", "local_amount", "convertedAmount", "converted_amount"]) {
    const n = Number(receiveRes[key] ?? 0)
    if (Number.isFinite(n) && n > 0) return roundLocal(n)
  }
  return null
}

/**
 * Authoritative user pay-in after POST /receive.
 * Never downgrade to economics-only repricing when submit padding or YC echo is higher.
 */
export function resolveYcLockedLocalPayInFromReceive(input: {
  submittedLocalAmount: number
  receiveRes?: Record<string, unknown> | null
  receiveLocalAmount?: number | null
  economicsLocalPayIn?: number
}): number {
  const submitted = roundLocalUp(input.submittedLocalAmount)
  const fromResponse =
    input.receiveLocalAmount != null && Number(input.receiveLocalAmount) > 0
      ? roundLocal(Number(input.receiveLocalAmount))
      : readYcReceiveLockedLocalAmount(input.receiveRes)
  if (fromResponse != null && fromResponse > 0) {
    return roundLocalUp(Math.max(fromResponse, submitted))
  }
  if (submitted > 0) return submitted
  const economics = roundLocal(input.economicsLocalPayIn ?? 0)
  if (economics > 0) return economics
  throw new Error("yc_locked_local_pay_in_invalid")
}

/**
 * Cross-border confirm: YC locked local pay-in is authoritative.
 * Submit padding may lock above repriced model — only reject when YC locks below submitted.
 */
export function alignYcCrossBorderLockedLocalPayIn(input: {
  pricingLocalPayIn: number
  /** @deprecated prefer submittedLocalAmount + receiveRes */
  ycLockedLocalPayIn?: number
  submittedLocalAmount?: number
  receiveRes?: Record<string, unknown> | null
}): number {
  const submitted = roundLocal(
    input.submittedLocalAmount ?? input.ycLockedLocalPayIn ?? input.pricingLocalPayIn,
  )
  const rawYcLocked =
    input.ycLockedLocalPayIn != null && Number(input.ycLockedLocalPayIn) > 0
      ? roundLocal(Number(input.ycLockedLocalPayIn))
      : readYcReceiveLockedLocalAmount(input.receiveRes)
  if (rawYcLocked != null && submitted > 0 && rawYcLocked + 0.01 < submitted) {
    throw new Error(`yc_pay_in_mismatch: YC locked ${rawYcLocked} < submitted ${submitted}`)
  }
  return resolveYcLockedLocalPayInFromReceive({
    submittedLocalAmount: submitted,
    receiveLocalAmount: input.ycLockedLocalPayIn,
    receiveRes: input.receiveRes,
    economicsLocalPayIn: input.pricingLocalPayIn,
  })
}

/** Max POST /send retries when YC locked destination fiat is below quoted receive. */
export const YC_SEND_LEG_DESTINATION_MAX_ATTEMPTS = 3

/**
 * Never underpay: net local must be >= quoted receive.
 * (Was 1 unit; that allowed 12549 for a 12550 payout — not acceptable.)
 */
export const YC_SEND_LEG_DESTINATION_TOLERANCE = 0

/**
 * Tiny over-delivery only from YC/fee rounding (e.g. 12550.01 for quoted 12550).
 * Larger excess is trimmed via retarget; we still target the exact quoted amount.
 */
export const YC_SEND_LEG_DESTINATION_EXCESS_TOLERANCE = 0.01

/**
 * Typical YC send service fee as a fraction of gross local amount.
 * Deducted before recipient credit — settlement crypto must target net receive.
 */
export const YC_SEND_LEG_SERVICE_FEE_FRACTION = 0.01

/** Shrink customerRate before sizing crypto (FX margin already in customerRate). */
export const YC_SEND_LEG_RATE_BUFFER_BPS = 50

/**
 * Extra slop — YC directSettlement conversion can be ~0.1% below customerRate
 * (prod: 1364.9 vs 1366.135 on 2000 NGN lock).
 */
export const YC_SEND_LEG_CONVERSION_SLOP_BPS = 25

function clampYcSendLegFeeFraction(feeFraction: number): number {
  if (!Number.isFinite(feeFraction) || feeFraction <= 0) return YC_SEND_LEG_SERVICE_FEE_FRACTION
  return Math.min(0.5, feeFraction)
}

/** Excess band for destination net lock (dust over quoted only). */
export function resolveYcSendLegDestinationExcessTolerance(_quotedReceive?: number): number {
  return YC_SEND_LEG_DESTINATION_EXCESS_TOLERANCE
}

/** Read locked destination fiat from YC POST /send response (gross before fee deduction). */
export function readYcSendLockedLocalAmount(
  sendRes: Record<string, unknown> | null | undefined,
): number | null {
  if (!sendRes) return null
  // Prefer convertedAmount — localAmount is often the quoted receive, not YC gross lock.
  for (const key of ["convertedAmount", "converted_amount", "localAmount", "local_amount"]) {
    const n = Number(sendRes[key] ?? 0)
    if (Number.isFinite(n) && n > 0) return roundLocal(n)
  }
  return null
}

/** Fee local for send lock when YC omits or delays serviceFeeAmountLocal on POST/GET. */
export function resolveYcSendLegFeeLocalForLock(input: {
  sendRes: Record<string, unknown> | null | undefined
  lockedLocalAmount: number
  quotedReceive: number
  tolerance?: number
}): number {
  const reported = readYcSendLegFeeLocal(input.sendRes)
  if (reported > 0) return reported

  const locked = roundLocal(input.lockedLocalAmount)
  const quoted = roundLocal(input.quotedReceive)
  const tolerance = input.tolerance ?? YC_SEND_LEG_DESTINATION_TOLERANCE
  if (!(locked > 0) || !(quoted > 0)) return 0

  // Gross above quoted receive — YC deducts ~1% service fee before crediting recipient.
  // Do not use (locked - quoted) as fee: excess gross is over-settlement crypto, not YC fee.
  if (locked > quoted + tolerance) {
    return roundLocal(locked * 0.01)
  }
  return 0
}

/** YC send leg fees deducted from gross destination fiat before recipient credit. */
export function readYcSendLegFeeLocal(
  sendRes: Record<string, unknown> | null | undefined,
): number {
  if (!sendRes) return 0
  let total = 0
  for (const key of [
    "serviceFeeAmountLocal",
    "service_fee_amount_local",
    "networkFeeAmountLocal",
    "network_fee_amount_local",
    "partnerFeeAmountLocal",
    "partner_fee_amount_local",
  ]) {
    const n = Number(sendRes[key] ?? 0)
    if (Number.isFinite(n) && n > 0) total += n
  }
  return roundLocal(total)
}

/** Resolve YC POST /send leg fees for pricing (USD + local). */
export function resolveYcSendLegFeesFromResponse(input: {
  sendRes: Record<string, unknown> | null | undefined
  destinationRate?: number
  ycRate?: number
}): {
  networkFeeAmountUsd: number
  serviceFeeAmountUsd: number
  serviceFeeAmountLocal: number
  totalFeeUsd: number
} {
  const sendRes = input.sendRes ?? {}
  const networkFeeAmountUsd = roundUsdc(
    Number(sendRes.networkFeeAmountUSD ?? sendRes.network_fee_amount_usd ?? 0),
  )
  const serviceFeeAmountUsd = roundUsdc(
    Number(sendRes.serviceFeeAmountUSD ?? sendRes.service_fee_amount_usd ?? 0),
  )
  const partnerFeeAmountUsd = roundUsdc(
    Number(sendRes.partnerFeeAmountUSD ?? sendRes.partner_fee_amount_usd ?? 0),
  )
  const serviceFeeAmountLocal = readYcSendLegFeeLocal(sendRes)
  const rate =
    Number(input.ycRate ?? sendRes.rate ?? 0) ||
    Number(input.destinationRate ?? 0) ||
    0
  const feeFromLocal =
    serviceFeeAmountLocal > 0 && rate > 0 ? roundUsdc(serviceFeeAmountLocal / rate) : 0
  const reportedTotal = roundUsdc(networkFeeAmountUsd + serviceFeeAmountUsd + partnerFeeAmountUsd)
  const totalFeeUsd = roundUsdc(Math.max(reportedTotal, feeFromLocal))
  const serviceUsd = roundUsdc(
    Math.max(serviceFeeAmountUsd + partnerFeeAmountUsd, totalFeeUsd - networkFeeAmountUsd),
  )
  return {
    networkFeeAmountUsd,
    serviceFeeAmountUsd: serviceUsd,
    serviceFeeAmountLocal,
    totalFeeUsd,
  }
}

export function checkYcSendLegDestinationAmountSufficient(input: {
  quotedReceive: number
  lockedLocalAmount: number
  /** Deducted from gross locked local before recipient credit (serviceFeeAmountLocal). */
  sendLegFeeLocal?: number
  /** Shortfall tolerance (default 0 — never underpay). */
  tolerance?: number
  /** Excess tolerance (default 0.01 dust). */
  excessTolerance?: number
}): { ok: boolean; shortfall: number; excess: number; netLocalAmount: number } {
  const shortfallTolerance = input.tolerance ?? YC_SEND_LEG_DESTINATION_TOLERANCE
  const excessTolerance =
    input.excessTolerance ?? resolveYcSendLegDestinationExcessTolerance(input.quotedReceive)
  const quoted = roundLocal(input.quotedReceive)
  const locked = roundLocal(input.lockedLocalAmount)
  const feeLocal = roundLocal(input.sendLegFeeLocal ?? 0)
  const netLocal = roundLocal(Math.max(0, locked - feeLocal))
  if (!(quoted > 0) || !(locked > 0)) {
    return {
      ok: false,
      shortfall: quoted > 0 ? quoted : 0,
      excess: 0,
      netLocalAmount: netLocal,
    }
  }
  const shortfall = roundLocal(Math.max(0, quoted - netLocal - shortfallTolerance))
  const excess = roundLocal(Math.max(0, netLocal - quoted - excessTolerance))
  return { ok: shortfall <= 0 && excess <= 0, shortfall, excess, netLocalAmount: netLocal }
}

export function assertYcSendLegDestinationAmountSufficient(input: {
  quotedReceive: number
  lockedLocalAmount: number
  sendLegFeeLocal?: number
  tolerance?: number
  excessTolerance?: number
  currency?: string
}): void {
  const check = checkYcSendLegDestinationAmountSufficient(input)
  if (check.ok) return
  const currency = String(input.currency ?? "").trim().toUpperCase() || "fiat"
  const feeLocal = roundLocal(input.sendLegFeeLocal ?? 0)
  if (check.excess > 0) {
    throw new Error(
      `yc_send_destination_excess: quoted ${input.quotedReceive} ${currency}, YC net ${check.netLocalAmount} ${currency} (gross ${input.lockedLocalAmount}, fee ${feeLocal}, over ${check.excess})`,
    )
  }
  throw new Error(
    `yc_send_destination_shortfall: quoted ${input.quotedReceive} ${currency}, YC net ${check.netLocalAmount} ${currency} (gross ${input.lockedLocalAmount}, fee ${feeLocal}, short ${check.shortfall})`,
  )
}

/**
 * Pessimistic NGN/USD (or local/USD) for directSettlement crypto sizing.
 * YC live conversion can be below customerRate — use lower rate → more crypto.
 */
export function resolveYcSendLegPessimisticDestinationRate(input: {
  customerRate: number
  rateBufferBps?: number
  conversionSlopBps?: number
}): number {
  const customerRate = input.customerRate
  if (!(customerRate > 0)) return 0
  const bufferBps = Number.isFinite(input.rateBufferBps)
    ? Math.max(0, Number(input.rateBufferBps))
    : YC_SEND_LEG_RATE_BUFFER_BPS
  const slopBps = Number.isFinite(input.conversionSlopBps)
    ? Math.max(0, Number(input.conversionSlopBps))
    : YC_SEND_LEG_CONVERSION_SLOP_BPS
  const totalBps = bufferBps + slopBps
  return customerRate * (1 - totalBps / 10_000)
}

/**
 * Initial settlement crypto so net local (after YC ~1% send fee) can meet quoted receive.
 * directSettlement forbids localAmount — crypto must be sized pessimistically.
 */
export function estimateYcSendLegSettlementCryptoForQuotedReceive(input: {
  quotedReceive: number
  destinationRate: number
  feeFraction?: number
  rateBufferBps?: number
  conversionSlopBps?: number
}): number {
  const quoted = roundLocal(input.quotedReceive)
  const rate = resolveYcSendLegPessimisticDestinationRate({
    customerRate: input.destinationRate,
    rateBufferBps: input.rateBufferBps,
    conversionSlopBps: input.conversionSlopBps,
  })
  const feeFraction = clampYcSendLegFeeFraction(
    input.feeFraction ?? YC_SEND_LEG_SERVICE_FEE_FRACTION,
  )
  if (!(quoted > 0) || !(rate > 0)) return 0
  const netFraction = 1 - feeFraction
  return roundUsdc(quoted / (rate * netFraction))
}

/**
 * Retarget settlement crypto from an observed YC lock toward quoted net receive.
 * Uses observed local/crypto rate and fee fraction; shortfall pads gross so one retry
 * clears production misses like net 1998.13 → 2000.
 */
export function retargetYcSendLegSettlementCryptoForQuotedReceive(input: {
  settlementCryptoUsd: number
  lockedLocalAmount: number
  sendLegFeeLocal: number
  quotedReceive: number
  destinationRate: number
  /** When true, size above quoted (clear shortfall). */
  preferCeil?: boolean
}): number {
  const crypto = roundUsdc(input.settlementCryptoUsd)
  const locked = roundLocal(input.lockedLocalAmount)
  const feeLocal = roundLocal(input.sendLegFeeLocal)
  const quoted = roundLocal(input.quotedReceive)
  if (!(crypto > 0) || !(locked > 0) || !(quoted > 0)) return crypto

  const netLocal = roundLocal(Math.max(0, locked - feeLocal))
  const observedRate = locked / crypto
  const rate =
    Number.isFinite(observedRate) && observedRate > 0 ? observedRate : input.destinationRate
  if (!(rate > 0)) return crypto

  const feeFraction = clampYcSendLegFeeFraction(
    feeLocal > 0 && locked > 0 ? feeLocal / locked : YC_SEND_LEG_SERVICE_FEE_FRACTION,
  )
  const netFraction = 1 - feeFraction
  const preferCeil = input.preferCeil ?? (netLocal > 0 ? netLocal < quoted : true)

  if (preferCeil) {
    // Ceil gross so net after ~% fee is >= quoted (e.g. 2000/0.99 → 2020.21).
    const targetGross = roundLocalUp(quoted / netFraction)
    let targetCrypto = roundUsdc(targetGross / rate)
    // Also cover observed shortfall explicitly (handles non-% fee components).
    if (netLocal > 0 && netLocal < quoted) {
      const shortfall = roundLocal(quoted - netLocal)
      const fromShortfall = roundUsdc(crypto + shortfall / (rate * netFraction))
      targetCrypto = roundUsdc(Math.max(targetCrypto, fromShortfall))
    }
    // Must move up by a meaningful USDC step — micro bumps can leave YC net unchanged.
    const minStep = roundUsdc(Math.max(0.001, 1 / rate))
    if (targetCrypto <= crypto) {
      targetCrypto = roundUsdc(crypto + minStep)
    }
    return targetCrypto
  }

  // Excess: aim at exact quoted net (0.01 dust is accepted by the checker).
  const targetGross = roundLocal(quoted / netFraction)
  let targetCrypto = roundUsdc(targetGross / rate)
  if (targetCrypto >= crypto) {
    targetCrypto = roundUsdc(Math.max(crypto * 0.5, crypto - Math.max(0.001, 1 / rate)))
  }
  return targetCrypto
}

/** Increase settlement crypto so YC destination fiat can meet quoted receive. */
export function bumpYcSendLegSettlementCryptoForLocalShortfall(input: {
  settlementCryptoUsd: number
  shortfallLocal: number
  destinationRate: number
  /** Observed/estimated fee as fraction of gross lock (default ~1%). */
  feeFraction?: number
}): number {
  const crypto = roundUsdc(input.settlementCryptoUsd)
  const rate = input.destinationRate
  const shortfall = roundLocal(input.shortfallLocal)
  if (crypto <= 0 || rate <= 0 || shortfall <= 0) return crypto
  const feeFraction = clampYcSendLegFeeFraction(
    input.feeFraction ?? YC_SEND_LEG_SERVICE_FEE_FRACTION,
  )
  const netFraction = 1 - feeFraction
  // Fee scales with gross — fund shortfall on the net side, not gross/rate alone.
  const bumpFromShortfall = roundUsdc(shortfall / (rate * netFraction))
  const bumpFromPct = roundUsdc(crypto * 0.005)
  return roundUsdc(crypto + Math.max(bumpFromShortfall, bumpFromPct))
}

/** Decrease settlement crypto when YC net local exceeds quoted receive. */
export function trimYcSendLegSettlementCryptoForLocalExcess(input: {
  settlementCryptoUsd: number
  excessLocal: number
  destinationRate: number
  feeFraction?: number
}): number {
  const crypto = roundUsdc(input.settlementCryptoUsd)
  const rate = input.destinationRate
  const excess = roundLocal(input.excessLocal)
  if (crypto <= 0 || rate <= 0 || excess <= 0) return crypto
  const feeFraction = clampYcSendLegFeeFraction(
    input.feeFraction ?? YC_SEND_LEG_SERVICE_FEE_FRACTION,
  )
  const netFraction = 1 - feeFraction
  const trimFromExcess = roundUsdc(excess / (rate * netFraction))
  const trimFromPct = roundUsdc(crypto * 0.005)
  const trimmed = roundUsdc(crypto - Math.max(trimFromExcess, trimFromPct))
  return roundUsdc(Math.max(trimmed, crypto * 0.5))
}
