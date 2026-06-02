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

/**
 * Apply inferred network; keep the user's asset when several assets share the same
 * network (e.g. USDC / USDT / EURC on Solana) and inference is not high-confidence.
 */
export function resolveInferredWalletAssetNetwork(input: {
  candidates: WalletAddressInferenceCandidate[]
  best: WalletAddressInferenceCandidate
  previousAsset?: string | null
  networksByAsset?: Record<string, string[]>
}): { asset: string; network: string } {
  const { candidates, best, previousAsset, networksByAsset = {} } = input
  const prev = String(previousAsset || "").trim().toUpperCase()

  const onNetwork = candidates.filter((c) => c.network === best.network)
  const hasHighConfidenceOnNetwork = onNetwork.some((c) => c.confidence === "high")

  let asset = best.asset
  if (!hasHighConfidenceOnNetwork && onNetwork.length > 1 && prev) {
    const prevMatches = onNetwork.some((c) => c.asset.toUpperCase() === prev)
    if (prevMatches) asset = prev
  }

  const networks = networksByAsset[asset] || networksByAsset[best.asset] || []
  const network = networks.includes(best.network) ? best.network : networks[0] || best.network

  return { asset, network }
}
