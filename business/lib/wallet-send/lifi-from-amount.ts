/** LiFi GET /quote requires fromAmount in the source token's smallest unit. */

export function lifiFromAmountRawForSendBudget(sendBudget: number, sourceDecimals: number): string {
  if (!Number.isFinite(sendBudget) || sendBudget <= 0) {
    throw new Error("sendBudget must be positive")
  }
  const raw = Math.round(sendBudget * 10 ** sourceDecimals)
  return String(Math.max(1, raw))
}

/** Estimate fromAmount when the user entered a receive-side target. */
export function estimateLifiFromAmountRaw(input: {
  receiveAmount: number
  customerRate: number
  lifiMid: number
  sourceDecimals: number
  slippage?: number
}): string {
  const { receiveAmount, customerRate, lifiMid, sourceDecimals } = input
  if (!Number.isFinite(receiveAmount) || receiveAmount <= 0) {
    throw new Error("receiveAmount must be positive")
  }
  if (!Number.isFinite(customerRate) || customerRate <= 0) {
    throw new Error("customerRate must be positive")
  }
  if (!Number.isFinite(lifiMid) || lifiMid <= 0) {
    throw new Error("lifiMid must be positive")
  }

  const slippage = input.slippage ?? 0.03
  const midSend = receiveAmount / lifiMid
  const withSlippage = midSend / Math.max(0.001, 1 - slippage)
  const customerSend = receiveAmount / customerRate
  const sendHuman = Math.max(customerSend, withSlippage)
  const raw = Math.ceil(sendHuman * 10 ** sourceDecimals)
  return String(Math.max(1, raw))
}
