/** Display helpers for wallet vs fiat payout recipients (avatars, badges). */

export function isWalletBeneficiary(input: {
  bankName?: string | null
  walletNetwork?: string | null
  walletAsset?: string | null
}): boolean {
  const bank = String(input.bankName || "").toLowerCase()
  if (bank.includes("wallet")) return true
  return Boolean(String(input.walletNetwork || "").trim() || String(input.walletAsset || "").trim())
}

export function walletTokenAsset(input: {
  walletAsset?: string | null
  currency?: string | null
}): string {
  return String(input.walletAsset || input.currency || "USDC").trim().toUpperCase()
}
