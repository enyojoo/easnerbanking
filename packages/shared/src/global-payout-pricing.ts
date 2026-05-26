/** Margin capture math for global balance → local fiat payouts. */

export type GlobalPayoutMarginCaptureMode = "surplus_send" | "split_debit"

export type ComputeGlobalPayoutPricingInput = {
  receiveAmount: number
  customerRate: number
  noahMid: number
  noahFloor: number
  marginCaptureMode?: GlobalPayoutMarginCaptureMode
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
  const marginCaptureMode = input.marginCaptureMode ?? "surplus_send"

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

  const midNotional = roundUsdc(receiveAmount / noahMid)
  const customerPrincipal = roundUsdc(receiveAmount / customerRate)
  const marginAmount = roundUsdc(Math.max(0, customerPrincipal - midNotional))
  const channelCost = roundUsdc(Math.max(0, noahFloor - midNotional))
  const totalDebited = roundUsdc(noahFloor + marginAmount)

  const noahSendAmount =
    marginCaptureMode === "split_debit" ? noahFloor : totalDebited

  return {
    receiveAmount,
    customerRate,
    noahMid,
    customerPrincipal,
    midNotional,
    marginAmount,
    noahFloor,
    channelCost,
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
