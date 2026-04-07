export type TerminalSettlementDestination = "easner_balance" | "bank_payout"

export function parseTerminalSettlementDestination(
  raw: string | null | undefined,
): TerminalSettlementDestination {
  return raw === "easner_balance" ? "easner_balance" : "bank_payout"
}

export function parseDefaultBalanceCurrency(raw: string | null | undefined): "USD" | "EUR" | null {
  const c = String(raw || "").trim().toUpperCase()
  if (c === "USD" || c === "EUR") return c
  return null
}

/**
 * Noah/Easner must expose a per-session pay-in that credits the same CustomerID balance as
 * GET /wallets / balances. Until integration is deployed, keep unset or not `"true"`.
 */
export function isTerminalBalanceSettlementEnabled(): boolean {
  return String(process.env.NOAH_TERMINAL_BALANCE_SETTLEMENT_ENABLED || "").trim().toLowerCase() === "true"
}
