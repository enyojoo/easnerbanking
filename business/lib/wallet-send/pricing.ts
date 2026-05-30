import type { LifiQuoteResponse } from "@/lib/lifi/client"
import { computeCryptoSendPricing, type CryptoSendPricing } from "@easner/shared"

export function parseLifiNetworkFeeUsd(quote: LifiQuoteResponse): number {
  const gas = quote.estimate?.gasCosts ?? []
  const fees = quote.estimate?.feeCosts ?? []
  let total = 0
  for (const row of [...gas, ...fees]) {
    if (row.included) continue
    const usd = Number(row.amountUSD ?? 0)
    if (Number.isFinite(usd) && usd > 0) total += usd
  }
  return Math.round(total * 100) / 100
}

export function pricingFromLifiQuote(input: {
  receiveAmount: number
  customerRate: number
  lifiMid: number
  quote: LifiQuoteResponse
  sourceDecimals: number
}): CryptoSendPricing {
  const fromRaw = Number(input.quote.estimate?.fromAmount ?? 0)
  const lifiFloor = fromRaw / 10 ** input.sourceDecimals
  return computeCryptoSendPricing({
    receiveAmount: input.receiveAmount,
    customerRate: input.customerRate,
    lifiMid: input.lifiMid,
    lifiFloor,
    networkFee: parseLifiNetworkFeeUsd(input.quote),
  })
}

export function pricingFromDirectTurnkey(input: {
  receiveAmount: number
  customerRate: number
}): CryptoSendPricing {
  return computeCryptoSendPricing({
    receiveAmount: input.receiveAmount,
    customerRate: input.customerRate,
    lifiMid: 1,
    lifiFloor: input.receiveAmount,
    networkFee: 0,
  })
}
