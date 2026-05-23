/**
 * Wallet-type recipient options (Add recipient → Wallet address).
 * Shared by {@link RecipientForm} and QR Pay placard “Add wallet address”.
 *
 * `Network` values match Noah production API identifiers (e.g. `Trigger.Conditions[].Network`
 * for on-chain deposit → payment workflows). Example: Polygon PoS chain is `PolygonPos`, not
 * a spaced label. CAIP-2 (maintainers): eip155:1 Ethereum, eip155:137 Polygon PoS, etc.
 */
export const WALLET_ASSET_NETWORKS: Record<string, string[]> = {
  USDC: ["Base", "Celo", "Ethereum", "Gnosis", "PolygonPos", "Solana", "Tron"],
  USDT: ["Celo", "Ethereum", "PolygonPos", "Tron"],
  BTC: ["Bitcoin"],
  EURC: ["Solana"],
  SOL: ["Solana"],
  PYUSD: ["FlowEvm", "Solana"],
}

export const DEFAULT_WALLET_ASSET = "USDT"

type CryptoDestinationLike = { asset_code: string; networks: string[] }

/** Build asset→networks map from send-destinations crypto catalog. */
export function walletAssetNetworksFromCatalog(
  destinations: CryptoDestinationLike[],
): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const d of destinations) {
    const code = String(d.asset_code || "").toUpperCase()
    if (!code) continue
    const nets = out[code] ?? []
    for (const n of d.networks) {
      const net = String(n || "").trim()
      if (net && !nets.includes(net)) nets.push(net)
    }
    out[code] = nets
  }
  return out
}
