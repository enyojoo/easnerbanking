/**
 * Default vaults: separate onchain addresses per ledger currency (USD / EUR on Solana).
 * Extend for NGN (e.g. Base USDC) when Yellow Card + Base are live.
 */
export type WalletVaultSpec = {
  ledgerCurrency: "USD" | "EUR" | "NGN" | string
  chain: string
  asset: string
  /** Solana path index for distinct addresses (Turnkey BIP44501). */
  derivationIndex: number
}

export const DEFAULT_INDIVIDUAL_VAULTS: WalletVaultSpec[] = [
  { ledgerCurrency: "USD", chain: "solana", asset: "USDC", derivationIndex: 0 },
  { ledgerCurrency: "EUR", chain: "solana", asset: "EURC", derivationIndex: 1 },
]

export function vaultIdempotencyKey(
  walletOwnerId: string,
  v: Pick<WalletVaultSpec, "ledgerCurrency" | "chain" | "asset">,
): string {
  return `${walletOwnerId}:${v.ledgerCurrency}:${v.chain}:${v.asset}`.toLowerCase()
}
