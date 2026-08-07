/** Noah network id ↔ Relay chain id for wallet send / deposit corridors. */

export type NoahNetworkId = "Solana" | "Ethereum" | "Base" | "Tron"

export type RelayChainMeta = {
  chainId: number
  chainKey: string
}

const NOAH_TO_RELAY: Record<NoahNetworkId, RelayChainMeta> = {
  Solana: { chainId: 792703809, chainKey: "solana" },
  Ethereum: { chainId: 1, chainKey: "ethereum" },
  Base: { chainId: 8453, chainKey: "base" },
  Tron: { chainId: 728126428, chainKey: "tron" },
}

export function relayChainForNoahNetwork(network: string): RelayChainMeta | null {
  const key = String(network || "").trim() as NoahNetworkId
  return NOAH_TO_RELAY[key] ?? null
}

export function noahNetworkFromRelayChainId(chainId: number | string): NoahNetworkId | null {
  const id = Number(chainId)
  if (!Number.isFinite(id)) return null
  for (const [network, meta] of Object.entries(NOAH_TO_RELAY) as Array<[NoahNetworkId, RelayChainMeta]>) {
    if (meta.chainId === id) return network
  }
  return null
}
