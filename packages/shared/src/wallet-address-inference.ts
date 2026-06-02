export type WalletAddressInferenceCandidate = {
  asset: string
  network: string
  confidence: "high" | "medium" | "low"
  reason: string
}

const CONFIDENCE_RANK: Record<WalletAddressInferenceCandidate["confidence"], number> = {
  high: 0,
  medium: 1,
  low: 2,
}

export function pickBestWalletInferenceCandidate(
  candidates: WalletAddressInferenceCandidate[],
): WalletAddressInferenceCandidate | null {
  if (!candidates.length) return null
  return [...candidates].sort(
    (a, b) => CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence],
  )[0]!
}

function isEnabledPair(
  candidates: WalletAddressInferenceCandidate[],
  networksByAsset: Record<string, string[]>,
  asset: string,
  network: string,
): boolean {
  const assetKey = asset.toUpperCase()
  const inCandidates = candidates.some(
    (c) => c.asset.toUpperCase() === assetKey && c.network === network,
  )
  if (!inCandidates) return false
  const catalogKeys = Object.keys(networksByAsset)
  if (catalogKeys.length === 0) return true
  return (networksByAsset[asset] || networksByAsset[assetKey] || []).includes(network)
}

/**
 * Map pasted address candidates to asset + network.
 *
 * - Tron address → USDT · Tron
 * - Solana address → USDC / USDT / EURC · Solana (keeps prior asset when valid)
 * - EVM address → USDC · Ethereum or Base; USDT · Ethereum (keeps prior asset/network when valid)
 */
export function resolveInferredWalletAssetNetwork(input: {
  candidates: WalletAddressInferenceCandidate[]
  best?: WalletAddressInferenceCandidate | null
  previousAsset?: string | null
  previousNetwork?: string | null
  networksByAsset?: Record<string, string[]>
}): { asset: string; network: string } {
  const { candidates, networksByAsset = {} } = input
  const prev = String(input.previousAsset || "").trim().toUpperCase()
  const prevNet = String(input.previousNetwork || "").trim()

  const enabled = (asset: string, network: string) =>
    isEnabledPair(candidates, networksByAsset, asset, network)

  const networks = new Set(candidates.map((c) => c.network))

  if (networks.size === 1 && networks.has("Tron")) {
    return { asset: "USDT", network: "Tron" }
  }

  if (networks.size === 1 && networks.has("Solana")) {
    for (const asset of [prev, "USDC", "USDT", "EURC"]) {
      if (!asset) continue
      if (enabled(asset, "Solana")) return { asset, network: "Solana" }
    }
    const first = candidates.find((c) => c.network === "Solana")!
    return { asset: first.asset, network: "Solana" }
  }

  const hasEvm = networks.has("Ethereum") || networks.has("Base")
  if (hasEvm) {
    if (prev === "USDT" && enabled("USDT", "Ethereum")) {
      return { asset: "USDT", network: "Ethereum" }
    }
    const usdcNetOrder =
      prevNet === "Base" ? (["Base", "Ethereum"] as const) : (["Ethereum", "Base"] as const)
    for (const network of usdcNetOrder) {
      if (enabled("USDC", network)) return { asset: "USDC", network }
    }
    if (enabled("USDT", "Ethereum")) return { asset: "USDT", network: "Ethereum" }
  }

  const fallback = input.best ?? candidates[0]
  if (fallback) return { asset: fallback.asset, network: fallback.network }
  return { asset: "USDC", network: "Ethereum" }
}
