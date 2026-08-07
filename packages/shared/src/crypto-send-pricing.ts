/** Margin capture math for balance-funded crypto wallet sends. */

import { computePayoutProcessingFeeBps } from "./payout-processing-fee"

export type ComputeCryptoSendPricingInput = {
  receiveAmount: number
  customerRate: number
  bridgeMid: number
  bridgeFloor: number
  networkFee?: number
  /** Easner processing fee in basis points (defaults to 100 = 1%). */
  processingFeeBps?: number
}

export type CryptoSendPricing = {
  receiveAmount: number
  customerRate: number
  bridgeMid: number
  customerPrincipal: number
  midNotional: number
  marginAmount: number
  bridgeFloor: number
  routeCost: number
  networkFee: number
  /** Explicit Easner 1% leg (uncapped), collected to the fee wallet. */
  processingFee: number
  /** Channel/route component shown in the combined Processing fee row (foots with total). */
  displayChannelCost: number
  totalDebited: number
}

function roundUsdc(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 1_000_000) / 1_000_000
}

/**
 * Ticket-sized bridge mid from a live Relay quote (Noah payout 2B pattern).
 * Uses receiveAmount / bridgeFloor — not quote toAmount, which can overshoot the user's target.
 */
export function resolveBridgeTicketPricingInput(input: {
  receiveAmount: number
  planningCustomerRate: number
  planningBridgeMid: number
  bridgeFloor: number
  margin: number
}): { customerRate: number; bridgeMid: number } {
  const { receiveAmount, planningCustomerRate, planningBridgeMid, bridgeFloor, margin } = input
  if (!Number.isFinite(margin) || margin < 0 || margin >= 1) {
    return { customerRate: planningCustomerRate, bridgeMid: planningBridgeMid }
  }
  if (receiveAmount > 0 && bridgeFloor > 0) {
    const ticketMid = receiveAmount / bridgeFloor
    if (Number.isFinite(ticketMid) && ticketMid > 0) {
      return {
        bridgeMid: ticketMid,
        customerRate: Number((ticketMid * (1 - margin)).toPrecision(14)),
      }
    }
  }
  return { customerRate: planningCustomerRate, bridgeMid: planningBridgeMid }
}

/**
 * Relay bridge pricing. Ledger and on-chain out both equal bridgeFloor + marginAmount
 * (= customerPrincipal + routeCost). Margin is in customerRate; execute SPL-sends margin to fee wallet.
 * Direct Turnkey uses computeDirectTurnkeyWalletSendPricing instead.
 */
export function computeCryptoSendPricing(input: ComputeCryptoSendPricingInput): CryptoSendPricing {
  const receiveAmount = input.receiveAmount
  const customerRate = input.customerRate
  const bridgeMid = input.bridgeMid
  const bridgeFloor = roundUsdc(input.bridgeFloor)
  const networkFee = roundUsdc(input.networkFee ?? 0)

  if (!Number.isFinite(receiveAmount) || receiveAmount <= 0) {
    throw new Error("receiveAmount must be positive")
  }
  if (!Number.isFinite(customerRate) || customerRate <= 0) {
    throw new Error("customerRate must be positive")
  }
  if (!Number.isFinite(bridgeMid) || bridgeMid <= 0) {
    throw new Error("bridgeMid must be positive")
  }
  if (!Number.isFinite(bridgeFloor) || bridgeFloor <= 0) {
    throw new Error("bridgeFloor must be positive")
  }

  const midNotional = roundUsdc(receiveAmount / bridgeMid)
  const customerPrincipal = roundUsdc(receiveAmount / customerRate)
  const marginAmount = roundUsdc(Math.max(0, customerPrincipal - midNotional))
  const routeCost = roundUsdc(Math.max(0, bridgeFloor - midNotional))
  const processingFee = computePayoutProcessingFeeBps(customerPrincipal, {
    bps: input.processingFeeBps,
  })
  const totalDebited = roundUsdc(bridgeFloor + marginAmount + processingFee)
  // Foots: Sending (customerPrincipal) + (processingFee + displayChannelCost) = totalDebited.
  const displayChannelCost = roundUsdc(Math.max(0, bridgeFloor + marginAmount - customerPrincipal))

  return {
    receiveAmount,
    customerRate,
    bridgeMid,
    customerPrincipal,
    midNotional,
    marginAmount,
    bridgeFloor,
    routeCost,
    processingFee,
    displayChannelCost,
    networkFee,
    totalDebited,
  }
}

export function normalizeCryptoSendQuoteReceiveAmount(input: {
  amountEntryMode: "send" | "receive"
  receiveAmount: number
  sendBudget?: number
  customerRate: number
}): number {
  const { amountEntryMode, receiveAmount, sendBudget, customerRate } = input
  if (amountEntryMode === "send" && sendBudget != null && sendBudget > 0 && customerRate > 0) {
    return roundUsdc(sendBudget * customerRate)
  }
  return roundUsdc(receiveAmount)
}
