/** Grid fund_balance credits ledger from Grid internal USD — disabled under Turnkey-only custody. */
export const GRID_FUND_BALANCE_DISABLED_MESSAGE =
  "Grid balance funding is temporarily unavailable while we align custody with your Turnkey wallet. Use local pay-in corridors or USDC receive instead."

export function isGridFundBalanceCustodyDisabled(): boolean {
  const flag = String(process.env.GRID_FUND_BALANCE_DISABLED ?? "true").trim().toLowerCase()
  return flag !== "false" && flag !== "0"
}

export function assertGridFundBalanceAllowed(): void {
  if (isGridFundBalanceCustodyDisabled()) {
    throw new Error(GRID_FUND_BALANCE_DISABLED_MESSAGE)
  }
}
