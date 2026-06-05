/** Margin capture math for balance-funded crypto wallet sends. */

export type ComputeCryptoSendPricingInput = {
  receiveAmount: number
  customerRate: number
  lifiMid: number
  lifiFloor: number
  networkFee?: number
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
  totalDebited: number
}

function roundUsdc(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 1_000_000) / 1_000_000
}

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
  const totalDebited = roundUsdc(lifiFloor + marginAmount)

  return {
    receiveAmount,
    customerRate,
    lifiMid,
    customerPrincipal,
    midNotional,
    marginAmount,
    lifiFloor,
    routeCost,
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
