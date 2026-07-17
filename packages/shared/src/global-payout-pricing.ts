/** Margin capture math for global balance → local fiat payouts. */

import { computePayoutProcessingFeeBps } from "./payout-processing-fee"

export type GlobalPayoutMarginCaptureMode =
  | "surplus_send"
  | "split_debit"
  | "fee_wallet_deferred"
  | "fee_wallet_omnibus"

export type ComputeGlobalPayoutPricingInput = {
  receiveAmount: number
  customerRate: number
  noahMid: number
  noahFloor: number
  marginCaptureMode?: GlobalPayoutMarginCaptureMode
  /** From Noah prepare Breakdown when present — preferred for channelCost. */
  prepareChannelFee?: number
  /** From Noah prepare Breakdown when present — preferred for midNotional. */
  prepareRemaining?: number
  /** Easner processing fee in basis points (defaults to 100 = 1%). */
  processingFeeBps?: number
}

export type GlobalPayoutPricing = {
  receiveAmount: number
  customerRate: number
  noahMid: number
  customerPrincipal: number
  midNotional: number
  marginAmount: number
  noahFloor: number
  channelCost: number
  /** Explicit Easner 1% leg (uncapped), collected to the fee wallet. */
  processingFee: number
  /**
   * Display channel component so that `Total debited = Sending + (processingFee + displayChannelCost)`
   * foots exactly (= noahFloor + marginAmount − customerPrincipal). Distinct from the ops `channelCost`.
   */
  displayChannelCost: number
  totalDebited: number
  noahSendAmount: number
  triggerAmount: number
  marginCaptureMode: GlobalPayoutMarginCaptureMode
}

function roundUsdc(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 1_000_000) / 1_000_000
}

/**
 * Canonical pricing for global payout quotes and execute.
 * Wallet debit = noahFloor + marginAmount; you-send box = customerPrincipal.
 */
export function computeGlobalPayoutPricing(
  input: ComputeGlobalPayoutPricingInput,
): GlobalPayoutPricing {
  const receiveAmount = input.receiveAmount
  const customerRate = input.customerRate
  const noahMid = input.noahMid
  const noahFloor = roundUsdc(input.noahFloor)
  const marginCaptureMode: GlobalPayoutMarginCaptureMode = "fee_wallet_deferred"

  if (!Number.isFinite(receiveAmount) || receiveAmount <= 0) {
    throw new Error("receiveAmount must be positive")
  }
  if (!Number.isFinite(customerRate) || customerRate <= 0) {
    throw new Error("customerRate must be positive")
  }
  if (!Number.isFinite(noahMid) || noahMid <= 0) {
    throw new Error("noahMid must be positive")
  }
  if (!Number.isFinite(noahFloor) || noahFloor <= 0) {
    throw new Error("noahFloor must be positive")
  }

  const midNotional = roundUsdc(
    input.prepareRemaining != null &&
      Number.isFinite(input.prepareRemaining) &&
      input.prepareRemaining > 0
      ? input.prepareRemaining
      : receiveAmount / noahMid,
  )
  const customerPrincipal = roundUsdc(receiveAmount / customerRate)
  const marginAmount = roundUsdc(Math.max(0, customerPrincipal - midNotional))
  const channelCost = roundUsdc(
    input.prepareChannelFee != null &&
      Number.isFinite(input.prepareChannelFee) &&
      input.prepareChannelFee >= 0
      ? input.prepareChannelFee
      : Math.max(0, noahFloor - midNotional - marginAmount),
  )
  /** Pre-fee debit the customer already covers beyond Sending (channel cost the customer sees). */
  const baseTotalDebited = roundUsdc(noahFloor + marginAmount)
  const displayChannelCost = roundUsdc(Math.max(0, baseTotalDebited - customerPrincipal))
  const processingFee = computePayoutProcessingFeeBps(customerPrincipal, {
    bps: input.processingFeeBps,
  })
  const totalDebited = roundUsdc(baseTotalDebited + processingFee)

  const noahSendAmount = noahFloor

  return {
    receiveAmount,
    customerRate,
    noahMid,
    customerPrincipal,
    midNotional,
    marginAmount,
    noahFloor,
    channelCost,
    processingFee,
    displayChannelCost,
    totalDebited,
    noahSendAmount,
    triggerAmount: noahFloor,
    marginCaptureMode,
  }
}

/**
 * Normalize quote entry to canonical receive amount (bidirectional with convertNoahSendFlowAmounts).
 */
export function normalizeGlobalPayoutQuoteReceiveAmount(input: {
  amountEntryMode: "send" | "receive"
  receiveFiatAmount: number
  sendBudget?: number
  customerRate: number
  receiveCurrency: string
  normalizeReceive: (currency: string, amount: number) => number
}): number {
  const { amountEntryMode, receiveFiatAmount, sendBudget, customerRate, receiveCurrency, normalizeReceive } =
    input

  if (amountEntryMode === "send" && sendBudget != null && sendBudget > 0 && customerRate > 0) {
    return normalizeReceive(receiveCurrency, sendBudget * customerRate)
  }
  return normalizeReceive(receiveCurrency, receiveFiatAmount)
}
