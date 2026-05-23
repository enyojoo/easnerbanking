export { getTokenIconUrl } from "@easner/shared"

const networkIcons: Record<string, string> = {
  Base: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png",
  Bitcoin: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/bitcoin/info/logo.png",
  Celo: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/celo/info/logo.png",
  Ethereum: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
  FlowEvm: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
  Gnosis: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/xdai/info/logo.png",
  /** Noah `Network` for Polygon proof-of-stake (see API schema: PolygonPos). */
  PolygonPos: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png",
  Solana: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png",
  Tron: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png",
}

export function getNetworkIconUrl(network: string): string | undefined {
  return networkIcons[String(network || "")]
}
