import { TERMINAL_ALLOWED_PAIRS } from "@/lib/terminal-allowed-pairs"

export function labelForTerminalNetwork(crypto: string, network: string): string {
  const pair = TERMINAL_ALLOWED_PAIRS.find(
    (p) => p.cryptoCurrency === crypto.trim() && p.network === network.trim(),
  )
  if (pair) {
    const m = pair.label.match(/\(([^)]+)\)/)
    if (m?.[1]) return m[1].trim()
    return pair.label
  }
  return network.trim()
}

export function assetTickerFromCrypto(currency: string): string {
  const c = currency.trim().toUpperCase()
  if (c.includes("USDC")) return "USDC"
  if (c.includes("EURC")) return "EURC"
  return c.replace(/_TEST$/i, "").slice(0, 8) || c
}
