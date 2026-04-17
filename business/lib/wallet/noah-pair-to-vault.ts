import { DEFAULT_INDIVIDUAL_VAULTS, type WalletVaultSpec } from "@/lib/wallet/vault-spec"

/**
 * Map Noah `CryptoCurrency` + `Network` (workflow fields) to a Turnkey vault spec.
 * Phase 1 focuses on Solana USDC (USD) and EURC (EUR); other pairs return null (caller may fall back to env).
 */
export function vaultSpecForNoahAssetNetwork(
  cryptoCurrency: string,
  network: string,
): WalletVaultSpec | null {
  const c = cryptoCurrency.trim().toUpperCase()
  const n = network.trim()

  if (n === "Solana" && (c === "USDC" || c === "USDC_TEST")) {
    return DEFAULT_INDIVIDUAL_VAULTS.find((v) => v.asset === "USDC") ?? null
  }
  if (n === "Solana" && c === "EURC") {
    return DEFAULT_INDIVIDUAL_VAULTS.find((v) => v.asset === "EURC") ?? null
  }
  return null
}
