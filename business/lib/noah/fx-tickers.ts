import { getNoahBaseUrl } from "./config"

/** Noah `/prices` uses crypto tickers; sandbox often uses *_TEST assets. */
export function useNoahSandboxTestAssets(): boolean {
  const u = getNoahBaseUrl().toLowerCase()
  return u.includes("sandbox")
}

export function uiFiatToNoahPriceTicker(currency: string): string {
  const c = currency.toUpperCase()
  const sandbox = useNoahSandboxTestAssets()
  if (c === "USD") return sandbox ? "USDC_TEST" : "USDC"
  if (c === "EUR") return sandbox ? "EURC_TEST" : "EURC"
  throw new Error(`Unsupported FX pair currency: ${currency}`)
}
