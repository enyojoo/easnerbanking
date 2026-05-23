/** Token logo URLs for crypto assets (Office, Business, Mobile). */
const TOKEN_ICONS: Record<string, string> = {
  USDT: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/usdt.png",
  USDC: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/usdc.png",
  EURC: "https://logo.svgcdn.com/token-branded/eurc.png",
  BTC: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/btc.png",
  SOL: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png",
  PYUSD: "https://logo.svgcdn.com/token-branded/pyusd.png",
}

export function getTokenIconUrl(symbol: string): string | undefined {
  return TOKEN_ICONS[String(symbol || "").toUpperCase()]
}
