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
