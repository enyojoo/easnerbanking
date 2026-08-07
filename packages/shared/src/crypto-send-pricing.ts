/** Margin capture math for balance-funded crypto wallet sends. */

import { computePayoutProcessingFeeBps } from "./payout-processing-fee"

export type ComputeCryptoSendPricingInput = {
  receiveAmount: number
  customerRate: number
  lifiMid: number
  lifiFloor: number
  networkFee?: number
  /** Easner processing fee in basis points (defaults to 100 = 1%). */
  processingFeeBps?: number
}

export type CryptoSendPricing = {
  receiveAmount: number
  customerRate: number
  lifiMid: number
  customerPrincipal: number
  midNotional: number
  marginAmount: number
  lifiFloor: number
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
 * Ticket-sized LI.FI mid from a live quote (Noah payout 2B pattern).
 * Uses receiveAmount / lifiFloor — not quote toAmount, which can overshoot the user's target.
 */
export function resolveLifiTicketPricingInput(input: {
  receiveAmount: number
  planningCustomerRate: number
  planningLifiMid: number
  lifiFloor: number
  margin: number
}): { customerRate: number; lifiMid: number } {
  const { receiveAmount, planningCustomerRate, planningLifiMid, lifiFloor, margin } = input
  if (!Number.isFinite(margin) || margin < 0 || margin >= 1) {
    return { customerRate: planningCustomerRate, lifiMid: planningLifiMid }
  }
  if (receiveAmount > 0 && lifiFloor > 0) {
    const ticketMid = receiveAmount / lifiFloor
    if (Number.isFinite(ticketMid) && ticketMid > 0) {
      return {
        lifiMid: ticketMid,
        customerRate: Number((ticketMid * (1 - margin)).toPrecision(14)),
      }
    }
  }
  return { customerRate: planningCustomerRate, lifiMid: planningLifiMid }
}

/** Alias for Relay bridge pricing (same math as LI.FI). */
export const resolveBridgeTicketPricingInput = resolveLifiTicketPricingInput

/**
 * LI.FI bridge pricing. Ledger and on-chain out both equal lifiFloor + marginAmount
 * (= customerPrincipal + routeCost). Margin is in customerRate; execute SPL-sends margin to fee wallet.
 * Direct Turnkey uses computeDirectTurnkeyWalletSendPricing instead.
 */
export function computeCryptoSendPricing(input: ComputeCryptoSendPricingInput): CryptoSendPricing {
  const receiveAmount = input.receiveAmount
  const customerRate = input.customerRate
  const lifiMid = input.lifiMid
  const lifiFloor = roundUsdc(input.lifiFloor)
  const networkFee = roundUsdc(input.networkFee ?? 0)

  if (!Number.isFinite(receiveAmount) || receiveAmount <= 0) {
    throw new Error("receiveAmount must be positive")
  }
  if (!Number.isFinite(customerRate) || customerRate <= 0) {
    throw new Error("customerRate must be positive")
  }
  if (!Number.isFinite(lifiMid) || lifiMid <= 0) {
    throw new Error("lifiMid must be positive")
  }
  if (!Number.isFinite(lifiFloor) || lifiFloor <= 0) {
    throw new Error("lifiFloor must be positive")
  }

  const midNotional = roundUsdc(receiveAmount / lifiMid)
  const customerPrincipal = roundUsdc(receiveAmount / customerRate)
  const marginAmount = roundUsdc(Math.max(0, customerPrincipal - midNotional))
  const routeCost = roundUsdc(Math.max(0, lifiFloor - midNotional))
  const processingFee = computePayoutProcessingFeeBps(customerPrincipal, {
    bps: input.processingFeeBps,
  })
  const totalDebited = roundUsdc(lifiFloor + marginAmount + processingFee)
  // Foots: Sending (customerPrincipal) + (processingFee + displayChannelCost) = totalDebited.
  const displayChannelCost = roundUsdc(Math.max(0, lifiFloor + marginAmount - customerPrincipal))

  return {
    receiveAmount,
    customerRate,
    lifiMid,
    customerPrincipal,
    midNotional,
    marginAmount,
    lifiFloor,
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
