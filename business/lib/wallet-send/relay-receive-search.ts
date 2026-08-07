import type { RelayQuoteV2Response } from "@/lib/relay/types"
import { parseRelayToAmountHumanFromQuote } from "./relay-from-amount"

export function meetsRelayReceiveTarget(
  toHuman: number,
  receiveAmount: number,
  slippage: number,
): boolean {
  if (!Number.isFinite(receiveAmount) || receiveAmount <= 0) return false
  return toHuman + 1e-9 >= receiveAmount * Math.max(0.001, 1 - slippage)
}

export function fromAmountRawToHuman(fromAmountRaw: string, sourceDecimals: number): number {
  const raw = Number(fromAmountRaw)
  if (!Number.isFinite(raw) || raw <= 0) return 0
  return raw / 10 ** sourceDecimals
}

export function humanToFromAmountRaw(human: number, sourceDecimals: number): string {
  if (!Number.isFinite(human) || human <= 0) throw new Error("human amount must be positive")
  return String(Math.ceil(human * 10 ** sourceDecimals))
}

export function maxRelayReceiveSearchSourceHuman(input: {
  receiveAmount: number
  bridgeMid: number
  minSourceHuman: number
  absoluteCapHuman?: number
}): number {
  const { receiveAmount, bridgeMid, minSourceHuman } = input
  const absoluteCap = input.absoluteCapHuman ?? 500
  const planning =
    bridgeMid > 0 && receiveAmount > 0 ? (receiveAmount / bridgeMid) * 2.5 : minSourceHuman
  return Math.min(absoluteCap, Math.max(minSourceHuman, planning))
}

export type RelayReceiveQuoteFn = (fromAmountRaw: string) => Promise<RelayQuoteV2Response>

export async function findMinRelayFromAmountRaw(input: {
  receiveAmount: number
  bridgeMid: number
  sourceDecimals: number
  destDecimals: number
  slippage: number
  minSourceHuman: number
  maxSourceHuman: number
  initialHighRaw: string
  quoteFn: RelayReceiveQuoteFn
}): Promise<{ fromAmountRaw: string; quote: RelayQuoteV2Response }> {
  const minRaw = humanToFromAmountRaw(input.minSourceHuman, input.sourceDecimals)
  let highRaw = String(Math.max(Number(minRaw), Number(input.initialHighRaw)))

  let highQuote: RelayQuoteV2Response | null = null
  const maxRaw = humanToFromAmountRaw(input.maxSourceHuman, input.sourceDecimals)

  for (let expand = 0; expand < 8; expand++) {
    if (Number(highRaw) > Number(maxRaw)) break
    const quote = await input.quoteFn(highRaw)
    const toHuman = parseRelayToAmountHumanFromQuote(quote, input.destDecimals)
    if (meetsRelayReceiveTarget(toHuman, input.receiveAmount, input.slippage)) {
      highQuote = quote
      break
    }
    highRaw = String(Math.ceil(Number(highRaw) * 2))
  }

  if (!highQuote) {
    throw new Error("relay_receive_target_not_met")
  }

  let lo = Number(minRaw)
  let hi = Number(highRaw)
  let bestRaw = hi
  let bestQuote = highQuote

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    const midRaw = String(Math.max(Number(minRaw), mid))
    const quote = await input.quoteFn(midRaw)
    const toHuman = parseRelayToAmountHumanFromQuote(quote, input.destDecimals)
    if (meetsRelayReceiveTarget(toHuman, input.receiveAmount, input.slippage)) {
      bestRaw = Number(midRaw)
      bestQuote = quote
      hi = mid
    } else {
      lo = mid + 1
    }
  }

  const minStep = Math.max(1, Math.floor(10 ** (input.sourceDecimals - 2)))
  let step = Math.max(minStep, Math.floor((bestRaw - Number(minRaw)) / 4))
  while (step >= minStep) {
    const candidate = bestRaw - step
    if (candidate < Number(minRaw)) {
      step = Math.floor(step / 2)
      continue
    }
    const quote = await input.quoteFn(String(candidate))
    const toHuman = parseRelayToAmountHumanFromQuote(quote, input.destDecimals)
    if (meetsRelayReceiveTarget(toHuman, input.receiveAmount, input.slippage)) {
      bestRaw = candidate
      bestQuote = quote
      step = Math.max(minStep, Math.floor(step / 2))
    } else {
      step = Math.floor(step / 2)
    }
  }

  return { fromAmountRaw: String(bestRaw), quote: bestQuote }
}
