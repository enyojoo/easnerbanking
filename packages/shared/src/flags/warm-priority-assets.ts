/** Shared priority assets for web + native image warmers. */
export const WARM_PRIORITY_ISOS = [
  "US",
  "EU",
  "GB",
  "NG",
  "KE",
  "GH",
  "ZA",
  "CA",
  "AU",
  "UG",
  "TZ",
  "RW",
  "SN",
  "CM",
] as const

export const WARM_PRIORITY_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "NGN",
  "KES",
  "GHS",
  "ZAR",
  "CAD",
  "AUD",
  "UGX",
  "TZS",
  "RWF",
  "XOF",
  "XAF",
  "USDC",
  "USDT",
  "EURC",
  "BTC",
  "SOL",
  "PYUSD",
] as const

/**
 * Chain logos rendered by the wallet-send corridor pickers (Noah network
 * ids). Remote (trustwallet CDN) — without warming, all 10 popped in on
 * first open of the network selector.
 */
export const WARM_PRIORITY_NETWORKS = [
  "Base",
  "Bitcoin",
  "BSC",
  "Celo",
  "Ethereum",
  "FlowEvm",
  "Gnosis",
  "PolygonPos",
  "Solana",
  "Tron",
] as const
