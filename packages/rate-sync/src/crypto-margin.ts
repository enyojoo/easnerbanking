/** Global wallet-send customer margin — 0.5%, matched to Noah payout margin now that an explicit 1% processing fee applies. */
export const WALLET_SEND_MARGIN = 0.5 / 100

export function walletSendMarginBps(margin = WALLET_SEND_MARGIN): number {
  return Math.round(margin * 10_000)
}

/**
 * Customer-facing wallet send rate from bridge mid (receive units per 1 source unit).
 * Outbound: user receives fewer destination units per 1 USD/EUR.
 */
export function applyCryptoCustomerRate(
  bridgeMid: number,
  margin = WALLET_SEND_MARGIN,
): number {
  if (!Number.isFinite(bridgeMid) || bridgeMid <= 0) {
    throw new Error("bridgeMid must be a positive finite number")
  }
  if (!Number.isFinite(margin) || margin < 0 || margin >= 1) {
    throw new Error("margin must be in [0, 1)")
  }
  return Number((bridgeMid * (1 - margin)).toPrecision(14))
}

export function parseWalletSendMarginFromEnv(raw: string | undefined): number {
  const parsed = Number.parseFloat(String(raw ?? "").trim())
  if (!Number.isFinite(parsed) || parsed < 0 || parsed >= 1) return WALLET_SEND_MARGIN
  return parsed
}
