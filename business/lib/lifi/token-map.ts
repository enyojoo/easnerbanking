import { lifiChainForNoahNetwork, type NoahNetworkId } from "./chain-map"

/** Well-known mainnet token addresses for LI.FI quotes. */
const TOKEN_BY_ASSET_NETWORK: Partial<
  Record<string, Partial<Record<NoahNetworkId, { address: string; decimals: number }>>>
> = {
  USDC: {
    Solana: { address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 },
    Ethereum: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
    Base: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
    Tron: { address: "TR8uUYpffcPib4NioKAs81LZxUF98CgHYs", decimals: 6 },
  },
  USDT: {
    Solana: { address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", decimals: 6 },
    Ethereum: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
    Base: { address: "0xfde4C96c8590BB5BA8c193842FF767abDA5Eba29", decimals: 6 },
    Tron: { address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", decimals: 6 },
  },
  EURC: {
    Solana: { address: "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr", decimals: 6 },
  },
}

export type WalletSendTokenRef = {
  asset: string
  network: NoahNetworkId
  chainId: number | string
  chainKey: string
  address: string
  decimals: number
}

export function resolveWalletSendToken(asset: string, network: string): WalletSendTokenRef | null {
  const a = String(asset || "").toUpperCase()
  const n = String(network || "").trim() as NoahNetworkId
  const chain = lifiChainForNoahNetwork(n)
  const token = TOKEN_BY_ASSET_NETWORK[a]?.[n]
  if (!chain || !token?.address) return null
  return {
    asset: a,
    network: n,
    chainId: chain.chainId,
    chainKey: chain.chainKey,
    address: token.address,
    decimals: token.decimals,
  }
}

/** Source vault asset on Solana for balance-funded sends. */
export function sourceSolVaultToken(balanceCurrency: "USD" | "EUR"): WalletSendTokenRef {
  if (balanceCurrency === "EUR") {
    const t = resolveWalletSendToken("EURC", "Solana")
    if (!t) throw new Error("EURC/Solana source token not configured")
    return t
  }
  const t = resolveWalletSendToken("USDC", "Solana")
  if (!t) throw new Error("USDC/Solana source token not configured")
  return t
}
