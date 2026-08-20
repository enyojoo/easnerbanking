/** Token logo URLs for crypto assets (Office, Business, Mobile). */
const TW_BLOCKCHAINS =
  "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains"

const TOKEN_ICONS: Record<string, string> = {
  USDT: `${TW_BLOCKCHAINS}/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png`,
  USDC: `${TW_BLOCKCHAINS}/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png`,
  EURC: `${TW_BLOCKCHAINS}/base/assets/0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42/logo.png`,
  BTC: `${TW_BLOCKCHAINS}/bitcoin/info/logo.png`,
  SOL: `${TW_BLOCKCHAINS}/solana/info/logo.png`,
  /** Not listed in trustwallet/assets yet – keep external logo until added upstream. */
  PYUSD: "https://logo.svgcdn.com/token-branded/pyusd.png",
}

/** Chain/network logos for wallet send corridors (Noah network ids). */
const NETWORK_ICONS: Record<string, string> = {
  Base: `${TW_BLOCKCHAINS}/base/info/logo.png`,
  Bitcoin: `${TW_BLOCKCHAINS}/bitcoin/info/logo.png`,
  BSC: `${TW_BLOCKCHAINS}/smartchain/info/logo.png`,
  Celo: `${TW_BLOCKCHAINS}/celo/info/logo.png`,
  Ethereum: `${TW_BLOCKCHAINS}/ethereum/info/logo.png`,
  FlowEvm: `${TW_BLOCKCHAINS}/ethereum/info/logo.png`,
  Gnosis: `${TW_BLOCKCHAINS}/xdai/info/logo.png`,
  PolygonPos: `${TW_BLOCKCHAINS}/polygon/info/logo.png`,
  Solana: `${TW_BLOCKCHAINS}/solana/info/logo.png`,
  Tron: `${TW_BLOCKCHAINS}/tron/info/logo.png`,
}

export function getTokenIconUrl(symbol: string): string | undefined {
  return TOKEN_ICONS[String(symbol || "").toUpperCase()]
}

export function getNetworkIconUrl(network: string): string | undefined {
  return NETWORK_ICONS[String(network || "").trim()]
}
