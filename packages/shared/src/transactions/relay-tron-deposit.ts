export type RelayTronDepositListDisplay = {
  displayAmount: number
  displayCurrency: string
  ledgerAmount: number
  ledgerCurrency: string
  displayDescription: string
  displayHeroTitle: string
}

function pickPositiveAmount(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = typeof value === "number" ? value : Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return null
}

/**
 * Feed and hero display for Relay Tron USDT deposits.
 * Shows gross sent as USD (e.g. $3 for 3 USDT); ledger/credited amount stays in metadata.
 */
export function resolveRelayTronDepositListDisplay(
  row: Record<string, unknown>,
): RelayTronDepositListDisplay | null {
  const dir = String(row.direction ?? "").toLowerCase()
  if (dir !== "in" && dir !== "credit") return null

  const meta = (row.metadata as Record<string, unknown> | null | undefined) ?? {}
  if (!isRelayTronDepositMetadata(meta)) return null

  const grossUsd = pickPositiveAmount(meta.gross_usdt)
  if (grossUsd == null) return null

  const ledgerAmount =
    pickPositiveAmount(meta.posted_amount, meta.reporting_wallet_amount, row.amount) ?? grossUsd
  const ledgerCurrency = String(meta.posted_currency ?? row.currency ?? "USD").toUpperCase()

  return {
    displayAmount: grossUsd,
    displayCurrency: "USD",
    ledgerAmount,
    ledgerCurrency,
    displayDescription: "Stablecoin Deposit",
    displayHeroTitle: "Stablecoin Deposit",
  }
}

export function isRelayTronDepositMetadata(meta?: Record<string, unknown> | null): boolean {
  const activity = String(meta?.activity_type ?? "").trim().toLowerCase()
  if (activity === "relay_tron_deposit") return true
  const sourceType = String(meta?.source_type ?? "").trim().toLowerCase()
  return sourceType === "relay_tron_deposit"
}

export function isRelayTronDepositInbound(input: {
  provider?: string | null
  metadata?: Record<string, unknown> | null
  source_type?: string | null
}): boolean {
  if (isRelayTronDepositMetadata(input.metadata)) return true
  const sourceType = String(input.source_type ?? "").trim().toLowerCase()
  if (sourceType === "relay_tron_deposit") return true
  const provider = String(input.provider ?? "").toLowerCase()
  return provider === "relay" && isRelayTronDepositMetadata(input.metadata)
}
