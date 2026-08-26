/** Grid VA Turnkey sweeps often emit a follow-up micro-USDC leg that must not appear as a deposit. */
export const GRID_VA_TURNKEY_DUST_MAX_USD = 0.01

export function isGridVaTurnkeyDustAmount(amount: number): boolean {
  return Number.isFinite(amount) && amount > 0 && amount < GRID_VA_TURNKEY_DUST_MAX_USD
}
