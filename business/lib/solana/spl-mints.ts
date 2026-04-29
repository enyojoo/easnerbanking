/** Mainnet canonical mints aligned with onchain backfill / vault USDC + EURC. */
export const MAINNET_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
export const MAINNET_EURC_MINT = "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr"

export function mintForStablecoinAsset(asset: string): string | null {
  const a = String(asset || "").trim().toUpperCase()
  if (a === "USDC") return MAINNET_USDC_MINT
  if (a === "EURC") return MAINNET_EURC_MINT
  return null
}
