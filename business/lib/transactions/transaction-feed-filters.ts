/** Rows tagged for internal Easetag chain settlement should not appear in public activity lists. */
export function isTurnkeyTransactionHiddenFromFeed(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false
  const m = metadata as Record<string, unknown>
  return m.easetag_settlement_leg === true || m.suppress_in_feed === true
}

/**
 * On-chain Turnkey row for Easetag USDC settlement — user already gets {@link notifyEasetagTransferSettled}
 * for the internal P2P leg; do not send a second "stablecoin transfer" push for this ledger row.
 */
export function isEasetagChainSettlementTransaction(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false
  const m = metadata as Record<string, unknown>
  return m.easetag_settlement_leg === true || m.easetag_settlement_leg === "true"
}
