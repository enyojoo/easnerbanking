import { getNoahEurCryptoTicker, getNoahUsdCryptoTicker } from "./config"
import { isNoahWalletLinkedFiat } from "./terminal-pay-fiat"

export function uiFiatToNoahPriceTicker(currency: string): string {
  const c = currency.trim().toUpperCase()
  if (!isNoahWalletLinkedFiat(c)) {
    throw new Error(`Unsupported FX pair currency: ${currency}`)
  }
  switch (c) {
    case "USD":
      return getNoahUsdCryptoTicker()
    case "EUR":
      return getNoahEurCryptoTicker()
    default: {
      const _exhaustive: never = c
      throw new Error(`Missing Noah ticker mapping for: ${_exhaustive}`)
    }
  }
}
