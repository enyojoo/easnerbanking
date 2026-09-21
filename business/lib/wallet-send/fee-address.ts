/**
 * Dedicated Solana treasury for direct Turnkey wallet-send processing fees.
 * Not Noah workflow destinations or PLATFORM_LIQUIDITY_POOL_*.
 */
export function resolveWalletSendFeeSolanaAddress(input: {
  ledgerCurrency: "USD" | "EUR"
}): string | null {
  const envKey =
    input.ledgerCurrency === "EUR"
      ? "WALLET_SEND_FEE_SOLANA_ADDRESS_EUR"
      : "WALLET_SEND_FEE_SOLANA_ADDRESS_USD"
  const fromEnv = String(process.env[envKey] || "").trim()
  return fromEnv || null
}

export function isWalletSendFeeSolanaAddress(address: string): boolean {
  const addr = String(address || "").trim()
  if (!addr) return false
  const usd = resolveWalletSendFeeSolanaAddress({ ledgerCurrency: "USD" })
  const eur = resolveWalletSendFeeSolanaAddress({ ledgerCurrency: "EUR" })
  return Boolean((usd && addr === usd) || (eur && addr === eur))
}

export function assertWalletSendFeeSolanaAddressConfigured(
  ledgerCurrency: "USD" | "EUR",
): void {
  const addr = resolveWalletSendFeeSolanaAddress({ ledgerCurrency })
  if (!addr) {
    throw new Error("wallet_send_fee_address_not_configured")
  }
}
