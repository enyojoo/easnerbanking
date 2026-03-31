const tokenIcons: Record<string, string> = {
  USDT: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/usdt.png",
  USDC: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/usdc.png",
  EURC: "https://logo.svgcdn.com/token-branded/eurc.png",
  BTC: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/btc.png",
  SOL: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png",
  PYUSD: "https://logo.svgcdn.com/token-branded/pyusd.png",
}

const networkIcons: Record<string, string> = {
  Base: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png",
  Bitcoin: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/bitcoin/info/logo.png",
  Celo: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/celo/info/logo.png",
  Ethereum: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
  FlowEvm: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
  Gnosis: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/xdai/info/logo.png",
  Lightning: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/bitcoin/info/logo.png",
  Solana: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png",
  Tron: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png",
}

export function getTokenIconUrl(symbol: string): string | undefined {
  return tokenIcons[String(symbol || "").toUpperCase()]
}

export function getNetworkIconUrl(network: string): string | undefined {
  return networkIcons[String(network || "")]
}
