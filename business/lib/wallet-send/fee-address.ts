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

export function assertWalletSendFeeSolanaAddressConfigured(
  ledgerCurrency: "USD" | "EUR",
): void {
  const addr = resolveWalletSendFeeSolanaAddress({ ledgerCurrency })
  if (!addr) {
    throw new Error("wallet_send_fee_address_not_configured")
  }
}
