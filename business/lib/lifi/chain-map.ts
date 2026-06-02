/** Noah network id ↔ LI.FI chain id/key for wallet send corridors. */

export type NoahNetworkId =
  | "Solana"
  | "Ethereum"
  | "Base"
  | "Tron"

export type LifiChainMeta = {
  chainId: number | string
  chainKey: string
}

const NOAH_TO_LIFI: Record<NoahNetworkId, LifiChainMeta> = {
  Solana: { chainId: "SOL", chainKey: "sol" },
  Ethereum: { chainId: 1, chainKey: "eth" },
  Base: { chainId: 8453, chainKey: "bas" },
  Tron: { chainId: 728126428, chainKey: "tro" },
}

export function lifiChainForNoahNetwork(network: string): LifiChainMeta | null {
  const key = String(network || "").trim() as NoahNetworkId
  return NOAH_TO_LIFI[key] ?? null
}

export function noahNetworkFromLifiChainId(chainId: number | string): NoahNetworkId | null {
  const id = String(chainId)
  for (const [network, meta] of Object.entries(NOAH_TO_LIFI) as Array<[NoahNetworkId, LifiChainMeta]>) {
    if (String(meta.chainId) === id) return network
  }
  return null
}
