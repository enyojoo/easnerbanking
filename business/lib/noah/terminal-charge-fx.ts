import { createQuote } from "@/lib/pricing/evaluator"
import { uiFiatToNoahPriceTicker } from "@/lib/noah/fx-tickers"
import { noahFetch } from "@/lib/noah/http"
import { isNoahWalletLinkedFiat } from "@/lib/noah/terminal-pay-fiat"

type PricesResponse = Record<string, unknown>

function numFromNoah(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v
  return Number.parseFloat(String(v ?? ""))
}

async function noahConvertSourceAmount(input: {
  sourceTicker: string
  destTicker: string
  sourceAmount: number
}): Promise<number> {
  const data = await noahFetch<PricesResponse>({
    method: "GET",
    path: "/prices",
    query: {
      SourceCurrency: input.sourceTicker,
      DestinationCurrency: input.destTicker,
      SourceAmount: input.sourceAmount.toFixed(8),
    },
  })
  const d = numFromNoah(data.DestinationAmount)
  if (!Number.isFinite(d) || d <= 0) {
    throw new Error("Noah /prices returned no usable destination amount")
  }
  return d
}

/** Charge-face amount in `chargeFiat` → USD notional using Noah /prices (stablecoin tickers). */
async function noahChargeFaceToUsdNotional(chargeFiat: string, chargeAmount: number): Promise<number> {
  const c = chargeFiat.trim().toUpperCase()
  if (c === "USD") return chargeAmount
  const usdTicker = uiFiatToNoahPriceTicker("USD")
  if (isNoahWalletLinkedFiat(c)) {
    const src = uiFiatToNoahPriceTicker(c)
    return noahConvertSourceAmount({
      sourceTicker: src,
      destTicker: usdTicker,
      sourceAmount: chargeAmount,
    })
  }
  try {
    return await noahConvertSourceAmount({
      sourceTicker: c,
      destTicker: usdTicker,
      sourceAmount: chargeAmount,
    })
  } catch {
    throw new Error(
      `No live Noah FX for ${c}→USD. Use USD or EUR as the charge currency, or contact support.`,
    )
  }
}

/** USD notional → payout-face amount in `payoutFiat` via Noah /prices. */
async function noahUsdNotionalToPayoutFace(usd: number, payoutFiat: string): Promise<number> {
  const p = payoutFiat.trim().toUpperCase()
  if (p === "USD") return usd
  const usdTicker = uiFiatToNoahPriceTicker("USD")
  if (isNoahWalletLinkedFiat(p)) {
    const dest = uiFiatToNoahPriceTicker(p)
    return noahConvertSourceAmount({
      sourceTicker: usdTicker,
      destTicker: dest,
      sourceAmount: usd,
    })
  }
  try {
    return await noahConvertSourceAmount({
      sourceTicker: usdTicker,
      destTicker: p,
      sourceAmount: usd,
    })
  } catch {
    throw new Error(
      `No live Noah FX for USD→${p}. This payout currency may need a different corridor in Noah.`,
    )
  }
}

/**
 * Charge amount in `chargeFiat` → USD notional: Noah mid, then Easner markup/rules via createQuote when possible.
 */
export async function chargeAmountToUsdNotional(input: {
  userId: string
  chargeFiat: string
  chargeAmount: number
}): Promise<number> {
  const { userId, chargeFiat, chargeAmount } = input
  const c = chargeFiat.trim().toUpperCase()
  if (!Number.isFinite(chargeAmount) || chargeAmount <= 0) {
    throw new Error("chargeAmount must be positive")
  }
  const usdMid = await noahChargeFaceToUsdNotional(c, chargeAmount)
  const providerRate = chargeAmount > 0 ? usdMid / chargeAmount : 1
  try {
    const q = await createQuote({
      userId,
      sourceCurrency: c,
      destinationCurrency: "USD",
      sourceAmount: chargeAmount,
      providerRate,
      routeType: "stablecoin",
      rail: "terminal_pay",
    })
    return q.destinationAmount
  } catch {
    return usdMid
  }
}

/**
 * Amount to pass to Noah sell prepare (FiatAmount in recipient/payout fiat).
 */
export async function resolveChargeToPayoutFiatAmount(input: {
  userId: string
  chargeFiat: string
  chargeAmount: number
  payoutFiat: string
}): Promise<string> {
  const cf = input.chargeFiat.trim().toUpperCase()
  const pf = input.payoutFiat.trim().toUpperCase()
  if (cf === pf) return input.chargeAmount.toFixed(2)
  const usd = await chargeAmountToUsdNotional({
    userId: input.userId,
    chargeFiat: cf,
    chargeAmount: input.chargeAmount,
  })
  const out = await noahUsdNotionalToPayoutFace(usd, pf)
  return out.toFixed(2)
}

export type NoahPriceAnchor = {
  destinationTicker: string
  destinationAmount: string
}

/**
 * Maps counter charge to Noah /prices terminal branch (crypto source → fiat/stablecoin destination amount).
 */
export async function resolveChargeForTerminalNoahPrices(input: {
  userId: string
  chargeFiat: string
  chargeAmount: number
}): Promise<NoahPriceAnchor> {
  const c = input.chargeFiat.trim().toUpperCase()
  if (isNoahWalletLinkedFiat(c)) {
    return {
      destinationTicker: uiFiatToNoahPriceTicker(c),
      destinationAmount: input.chargeAmount.toFixed(2),
    }
  }
  const usd = await chargeAmountToUsdNotional({
    userId: input.userId,
    chargeFiat: c,
    chargeAmount: input.chargeAmount,
  })
  return {
    destinationTicker: uiFiatToNoahPriceTicker("USD"),
    destinationAmount: usd.toFixed(2),
  }
}
