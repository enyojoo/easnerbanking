import {
  isNoahBankOnrampOrchestrationOutLeg,
} from "@/lib/noah/bank-onramp-tx"

/** Rows tagged for internal Easetag chain settlement should not appear in public activity lists. */
export function isTurnkeyTransactionHiddenFromFeed(
  metadata: unknown,
  payload?: unknown,
): boolean {
  if (!metadata || typeof metadata !== "object") {
    if (payload && typeof payload === "object" && isNoahBankOnrampOrchestrationOutLeg(payload as Record<string, unknown>)) {
      return true
    }
    return false
  }
  const m = metadata as Record<string, unknown>
  if (m.easetag_settlement_leg === true || m.suppress_in_feed === true) return true
  if (m.noah_orchestration_settlement_leg === true) return true
  if (payload && typeof payload === "object" && isNoahBankOnrampOrchestrationOutLeg(payload as Record<string, unknown>)) {
    return true
  }
  return false
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

/** Skip settled push for Noah internal orchestration legs (user sees fiat pay-in only). */
export function isNoahInternalSettlementTransaction(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false
  const m = metadata as Record<string, unknown>
  return m.noah_orchestration_settlement_leg === true || m.suppress_in_feed === true
}

/** Turnkey on-chain row that duplicates a Noah bank onramp settlement (same Solana signature). */
export function isTurnkeyNoahBankOnrampChainMirror(
  row: {
    provider?: unknown
    direction?: unknown
    tx_hash?: unknown
    metadata?: unknown
  },
  noahOnChainTxHashes: ReadonlySet<string>,
): boolean {
  if (String(row.provider ?? "").toLowerCase() !== "turnkey") return false
  if (String(row.direction ?? "").toLowerCase() !== "in") return false
  const h = String(row.tx_hash ?? "").trim()
  if (!h || !noahOnChainTxHashes.has(h)) return false
  if (!row.metadata || typeof row.metadata !== "object") return true
  const m = row.metadata as Record<string, unknown>
  if (m.suppress_in_feed === true || m.noah_bank_onramp_chain_mirror === true) return true
  // User-visible organic deposits from chain sync (not Noah duplicates).
  if (m.source === "turnkey_chain_sync" || m.source === "turnkey_balance_webhook") return false
  return m.source === "turnkey_onchain_backfill" || m.source === "turnkey_webhook"
}
