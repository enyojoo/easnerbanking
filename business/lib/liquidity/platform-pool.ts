import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Noah / Terminal `SourceAddress` for crypto sell: pool Solana address from env.
 * `PLATFORM_LIQUIDITY_POOL_SOLANA_ADDRESS_USD` | `PLATFORM_LIQUIDITY_POOL_SOLANA_ADDRESS_EUR`
 */
export async function resolvePooledSolanaSourceAddress(
  _admin: SupabaseClient,
  input: { ledgerCurrency: "USD" | "EUR" },
): Promise<string | null> {
  const envKey =
    input.ledgerCurrency === "EUR" ? "PLATFORM_LIQUIDITY_POOL_SOLANA_ADDRESS_EUR" : "PLATFORM_LIQUIDITY_POOL_SOLANA_ADDRESS_USD"
  const fromEnv = String(process.env[envKey] || "").trim()
  return fromEnv || null
}

export function ledgerCurrencyForStablecoinAsset(asset: string): "USD" | "EUR" | null {
  const a = String(asset || "").trim().toUpperCase()
  if (a === "EURC") return "EUR"
  if (a === "USDC") return "USD"
  return null
}
