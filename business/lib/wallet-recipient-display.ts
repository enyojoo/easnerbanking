import { getCountryCodeForCurrency } from "@easner/shared"

/** Display helpers for wallet vs fiat payout recipients (avatars, badges). */

export function resolvePayoutCountryCode(
  countryCode?: string | null,
  currency?: string | null,
): string {
  const cc = String(countryCode || "").trim().toUpperCase()
  if (cc) return cc
  const cur = String(currency || "").trim().toUpperCase()
  if (cur === "EUR") return "EU"
  return getCountryCodeForCurrency(cur) || "US"
}

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
