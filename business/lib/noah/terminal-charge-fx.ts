import { uiFiatToNoahPriceTicker } from "@/lib/noah/fx-tickers"
import { noahConvertFiatAmount } from "@/lib/noah/fx-prices"
import { isNoahWalletLinkedFiat } from "@/lib/noah/terminal-pay-fiat"

/** Charge-face amount in `chargeFiat` → USD notional using Noah /prices (stablecoin tickers). */
async function noahChargeFaceToUsdNotional(chargeFiat: string, chargeAmount: number): Promise<number> {
  const c = chargeFiat.trim().toUpperCase()
  if (c === "USD") return chargeAmount
  try {
    return await noahConvertFiatAmount({
      sourceFiat: c,
      destFiat: "USD",
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
  try {
    return await noahConvertFiatAmount({
      sourceFiat: "USD",
      destFiat: p,
      sourceAmount: usd,
    })
  } catch {
    throw new Error(
      `No live Noah FX for USD→${p}. This payout currency may need a different corridor in Noah.`,
    )
  }
}

/** Charge amount in `chargeFiat` → USD notional via Noah mid. */
export async function chargeAmountToUsdNotional(input: {
  userId: string
  chargeFiat: string
  chargeAmount: number
}): Promise<number> {
  void input.userId
  const { chargeFiat, chargeAmount } = input
  const c = chargeFiat.trim().toUpperCase()
  if (!Number.isFinite(chargeAmount) || chargeAmount <= 0) {
    throw new Error("chargeAmount must be positive")
  }
  return noahChargeFaceToUsdNotional(c, chargeAmount)
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
