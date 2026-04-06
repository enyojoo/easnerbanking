/**
 * Wallet-type recipient options (Add recipient → Wallet address).
 * Shared by {@link RecipientForm} and Auto Payout placard “Add wallet address”.
 */
export const WALLET_ASSET_NETWORKS: Record<string, string[]> = {
  USDT: ["Base", "Bitcoin", "Celo", "Ethereum"],
  USDC: ["Base", "Bitcoin", "Celo", "Ethereum", "FlowEvm", "Gnosis", "Lightning"],
  EURC: ["Solana"],
  BTC: ["Bitcoin"],
  SOL: ["Solana"],
  PYUSD: ["Base", "Bitcoin"],
}

export const DEFAULT_WALLET_ASSET = "USDT"
