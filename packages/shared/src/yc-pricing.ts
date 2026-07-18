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
export const YC_FUND_BALANCE_OMNIBUS_SOLVE_BUFFER_USDC = 3

/** Fund balance confirm: one retry only when the first POST /receive is under-funded. */
export const YC_FUND_BALANCE_RECEIVE_MAX_ATTEMPTS = 2

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
  const bufferUsd = Math.max(
    YC_FUND_BALANCE_OMNIBUS_SOLVE_BUFFER_USDC,
    roundUsdc(neededOmnibus * 0.005),
  )
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
  const tolerance = input.tolerance ?? YC_OMNIBUS_SUFFICIENCY_TOLERANCE_USDC
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
 * Fund balance pay-in before POST /receive: pad receive leg fees from estimate.
 */
export type YcFundBalanceAmountPreview = {
  usdCredit: number
  localPayIn: number
  feeInclusive: true
}

/** Client/server amount-screen preview: padded pay-in aligned with confirm submit. */
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

  const padded =
    input.amountEntryMode === "usd"
      ? computeYcFundBalancePricingBeforeReceive({
          usdCredit: input.enteredAmount,
          customerSellRate: input.customerSellRate,
          ycSellRate: input.ycSellRate,
          processingFeeBps: input.processingFeeBps,
          rail: input.rail,
        })
      : computeYcFundBalancePricingBeforeReceive({
          localPayIn: input.enteredAmount,
          customerSellRate: input.customerSellRate,
          ycSellRate: input.ycSellRate,
          processingFeeBps: input.processingFeeBps,
          rail: input.rail,
        })

  return {
    usdCredit: padded.usdCredit,
    localPayIn: padded.localPayIn,
    feeInclusive: true,
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
