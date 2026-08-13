/** Grid fund_balance is enabled by default; office corridor routing gates live corridors. */
export const GRID_FUND_BALANCE_DISABLED_MESSAGE =
  "Grid balance funding is not enabled for this corridor."

export function isGridFundBalanceCustodyDisabled(): boolean {
  const flag = String(process.env.GRID_FUND_BALANCE_DISABLED ?? "false").trim().toLowerCase()
  return flag === "true" || flag === "1"
}

export function assertGridFundBalanceAllowed(): void {
  if (isGridFundBalanceCustodyDisabled()) {
    throw new Error(GRID_FUND_BALANCE_DISABLED_MESSAGE)
  }
}
