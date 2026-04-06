import { getNoahBaseUrl } from "./config"
import { isNoahWalletLinkedFiat } from "./terminal-pay-fiat"

/** Noah `/prices` uses crypto tickers; sandbox often uses *_TEST assets. */
export function isNoahSandboxTestAssets(): boolean {
  const u = getNoahBaseUrl().toLowerCase()
  return u.includes("sandbox")
}

export function uiFiatToNoahPriceTicker(currency: string): string {
  const c = currency.trim().toUpperCase()
  if (!isNoahWalletLinkedFiat(c)) {
    throw new Error(`Unsupported FX pair currency: ${currency}`)
  }
  const sandbox = isNoahSandboxTestAssets()
  switch (c) {
    case "USD":
      return sandbox ? "USDC_TEST" : "USDC"
    case "EUR":
      return sandbox ? "EURC_TEST" : "EURC"
    default: {
      const _exhaustive: never = c
      throw new Error(`Missing Noah ticker mapping for: ${_exhaustive}`)
    }
  }
}
