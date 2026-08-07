import {
  parseRelayFromAmountRaw,
  parseRelayToAmountHuman,
  type RelayQuoteV2Response,
} from "@/lib/relay/quote"

export function relayMinFromAmountRaw(
  fromAmountRaw: string,
  sourceDecimals: number,
  minSourceHuman: number,
): string {
  const minRaw = Math.ceil(minSourceHuman * 10 ** sourceDecimals)
  const current = Number(fromAmountRaw)
  if (!Number.isFinite(current) || current <= 0) return String(minRaw)
  return String(Math.max(current, minRaw))
}

export function parseRelayToAmountHumanFromQuote(
  quote: RelayQuoteV2Response,
  destDecimals: number,
): number {
  try {
    return parseRelayToAmountHuman(quote, destDecimals)
  } catch {
    return 0
  }
}

export function relayFromAmountRawForSendBudget(sendBudget: number, sourceDecimals: number): string {
  if (!Number.isFinite(sendBudget) || sendBudget <= 0) {
    throw new Error("sendBudget must be positive")
  }
  const raw = Math.round(sendBudget * 10 ** sourceDecimals)
  return String(Math.max(1, raw))
}

export function estimateRelayFromAmountRaw(input: {
  receiveAmount: number
  customerRate: number
  bridgeMid: number
  sourceDecimals: number
  slippage?: number
  minSourceHuman?: number
}): string {
  const { receiveAmount, customerRate, bridgeMid, sourceDecimals } = input
  if (!Number.isFinite(receiveAmount) || receiveAmount <= 0) {
    throw new Error("receiveAmount must be positive")
  }
  if (!Number.isFinite(customerRate) || customerRate <= 0) {
    throw new Error("customerRate must be positive")
  }
  if (!Number.isFinite(bridgeMid) || bridgeMid <= 0) {
    throw new Error("bridgeMid must be positive")
  }

  const slippage = input.slippage ?? 0.03
  const midSend = receiveAmount / bridgeMid
  const withSlippage = midSend / Math.max(0.001, 1 - slippage)
  const customerSend = receiveAmount / customerRate
  const minSource = input.minSourceHuman ?? 0
  const sendHuman = Math.max(customerSend, withSlippage, minSource)
  const raw = Math.ceil(sendHuman * 10 ** sourceDecimals)
  return String(Math.max(1, raw))
}

export { parseRelayFromAmountRaw }
