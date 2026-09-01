/**
 * Grid VA sweeps credit the user vault from Lightspark Grid's Solana USDC wallet.
 * Identify those inbounds by sender — not by amount — so organic USDC is never gated on Grid.
 */

const KNOWN_GRID_VA_SWEEP_TREASURY_ADDRESSES = [
  // Prod Grid → user-vault USDC source (observed on VA sweep legs).
  "E6GjrWqtzTfm5ShTCxpphBzEuNt22goKDUKspkA9tJ3U",
  // Dust follow-up legs from the same Grid program (nearby pubkey).
  "E6GjD2VzwwM9vEZyjToVkdixRG7ssTyBUBr8gTUGtJ3U",
] as const

export function gridVaSweepTreasuryAddresses(): string[] {
  const extra = String(process.env.GRID_VA_SWEEP_SOLANA_SOURCE_ADDRESSES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  return [...new Set([...KNOWN_GRID_VA_SWEEP_TREASURY_ADDRESSES, ...extra])]
}

export function isGridVaSweepTreasurySender(address: string | null | undefined): boolean {
  const a = String(address ?? "").trim()
  if (!a) return false
  return gridVaSweepTreasuryAddresses().some((treasury) => treasury === a)
}
