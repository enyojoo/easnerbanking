import type { LifiQuoteResponse } from "@/lib/lifi/client"
import { parseLifiToAmountHuman } from "./lifi-from-amount"

export function meetsLifiReceiveTarget(
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

export function maxLifiReceiveSearchSourceHuman(input: {
  receiveAmount: number
  lifiMid: number
  minSourceHuman: number
  absoluteCapHuman?: number
}): number {
  const { receiveAmount, lifiMid, minSourceHuman } = input
  const absoluteCap = input.absoluteCapHuman ?? 500
  const planning =
    lifiMid > 0 && receiveAmount > 0 ? (receiveAmount / lifiMid) * 2.5 : minSourceHuman
  return Math.min(absoluteCap, Math.max(minSourceHuman, planning))
}

export type LifiReceiveQuoteFn = (fromAmountRaw: string) => Promise<LifiQuoteResponse>

/**
 * Minimum fromAmount (USDC/EURC in) so LI.FI toAmount meets receive target within slippage.
 */
export async function findMinLifiFromAmountRaw(input: {
  receiveAmount: number
  lifiMid: number
  sourceDecimals: number
  destDecimals: number
  slippage: number
  minSourceHuman: number
  maxSourceHuman: number
  initialHighRaw: string
  quoteFn: LifiReceiveQuoteFn
}): Promise<{ fromAmountRaw: string; quote: LifiQuoteResponse }> {
  const minRaw = humanToFromAmountRaw(input.minSourceHuman, input.sourceDecimals)
  let highRaw = String(Math.max(Number(minRaw), Number(input.initialHighRaw)))

  let highQuote: LifiQuoteResponse | null = null
  const maxRaw = humanToFromAmountRaw(input.maxSourceHuman, input.sourceDecimals)

  for (let expand = 0; expand < 8; expand++) {
    if (Number(highRaw) > Number(maxRaw)) break
    const quote = await input.quoteFn(highRaw)
    const toHuman = parseLifiToAmountHuman(quote, input.destDecimals)
    if (meetsLifiReceiveTarget(toHuman, input.receiveAmount, input.slippage)) {
      highQuote = quote
      break
    }
    highRaw = String(Math.ceil(Number(highRaw) * 2))
  }

  if (!highQuote) {
    throw new Error("lifi_receive_target_not_met")
  }

  let lo = Number(minRaw)
  let hi = Number(highRaw)
  let bestRaw = hi
  let bestQuote = highQuote

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    const midRaw = String(Math.max(Number(minRaw), mid))
    const quote = await input.quoteFn(midRaw)
    const toHuman = parseLifiToAmountHuman(quote, input.destDecimals)
    if (meetsLifiReceiveTarget(toHuman, input.receiveAmount, input.slippage)) {
      bestRaw = Number(midRaw)
      bestQuote = quote
      hi = mid
    } else {
      lo = mid + 1
    }
  }

  // Refine downward — LI.FI routes can be non-monotonic at small tickets (e.g. USDT/Tron).
  const minStep = Math.max(1, Math.floor(10 ** (input.sourceDecimals - 2)))
  let step = Math.max(minStep, Math.floor((bestRaw - Number(minRaw)) / 4))
  while (step >= minStep) {
    const candidate = bestRaw - step
    if (candidate < Number(minRaw)) {
      step = Math.floor(step / 2)
      continue
    }
    const quote = await input.quoteFn(String(candidate))
    const toHuman = parseLifiToAmountHuman(quote, input.destDecimals)
    if (meetsLifiReceiveTarget(toHuman, input.receiveAmount, input.slippage)) {
      bestRaw = candidate
      bestQuote = quote
      step = Math.max(minStep, Math.floor(step / 2))
    } else {
      step = Math.floor(step / 2)
    }
  }

  return { fromAmountRaw: String(bestRaw), quote: bestQuote }
}
