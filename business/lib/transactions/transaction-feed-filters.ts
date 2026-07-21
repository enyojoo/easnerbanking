import {
  isNoahBankOnrampOrchestrationOutLeg,
} from "@/lib/noah/bank-onramp-tx"
import {
  isNoahGlobalPayoutOrchestrationInLegShape,
  pickNoahWebhookTxHash,
} from "@/lib/noah/global-payout-ledger"

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
  if (m.easetag_settlement_leg === true || m.easetag_p2p_chain_mirror === true || m.suppress_in_feed === true) return true
  if (m.deposit_split_leg === true) return true
  if (m.global_payout_settlement_leg === true) return true
  if (m.global_payout_orchestration_in_leg === true) return true
  if (m.noah_orchestration_settlement_leg === true) return true
  if (m.noah_orchestration_settlement_in_leg === true) return true
  if (m.global_payout_refund_mirror === true) return true
  if (m.yc_crypto_deposit_leg === true || m.yc_settlement_leg === true) return true
  if (m.yc_fund_balance_chain_mirror === true) return true
  if (m.yc_fee_wallet_refund_mirror === true) return true
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

/** Turnkey inbound that duplicates an Easetag P2P payee credit (balance webhook / chain sync). */
export function isTurnkeyEasetagP2pChainMirror(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false
  const m = metadata as Record<string, unknown>
  return m.easetag_p2p_chain_mirror === true || m.easetag_p2p_chain_mirror === "true"
}

/** Skip settled push for Noah internal orchestration legs (user sees fiat pay-in only). */
export function isNoahInternalSettlementTransaction(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false
  const m = metadata as Record<string, unknown>
  return (
    m.noah_orchestration_settlement_leg === true ||
    m.noah_orchestration_settlement_in_leg === true ||
    m.global_payout_orchestration_in_leg === true ||
    m.suppress_in_feed === true ||
    m.deposit_split_leg === true
  )
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
  if (
    m.source === "turnkey_chain_sync" ||
    m.source === "turnkey_balance_webhook" ||
    m.source === "helius_webhook"
  ) {
    return false
  }
  return m.source === "turnkey_onchain_backfill" || m.source === "turnkey_webhook"
}

/**
 * Noah Solana IN that mirrors Turnkey global-payout settlement (internal orchestration leg).
 * Same pattern as {@link isTurnkeyNoahBankOnrampChainMirror} for VA bank on-ramp.
 */
export function isNoahGlobalPayoutOrchestrationInHiddenFromFeed(
  row: {
    provider?: unknown
    direction?: unknown
    metadata?: unknown
    payload?: unknown
    tx_hash?: unknown
  },
  globalPayoutSettlementTxHashes: ReadonlySet<string>,
): boolean {
  if (String(row.provider ?? "").toLowerCase() !== "noah") return false
  if (String(row.direction ?? "").toLowerCase() !== "in") return false

  const meta = (row.metadata as Record<string, unknown> | undefined) ?? {}
  if (meta.global_payout_orchestration_in_leg === true || meta.suppress_in_feed === true) {
    return true
  }
  if (meta.payout_type === "global_fiat" && meta.flow === "global_fiat_offramp") {
    return true
  }

  const payload = row.payload as Record<string, unknown> | undefined
  if (!payload || !isNoahGlobalPayoutOrchestrationInLegShape(payload)) return false

  const hash =
    String(row.tx_hash ?? "").trim() || pickNoahWebhookTxHash(payload) || ""
  if (hash && globalPayoutSettlementTxHashes.has(hash)) return true

  return false
}

/** Turnkey inbound that mirrors Noah's post-failure global payout USDC refund. */
export function isTurnkeyGlobalPayoutRefundMirror(
  row: {
    provider?: unknown
    direction?: unknown
    tx_hash?: unknown
    metadata?: unknown
  },
  globalPayoutRefundTxHashes: ReadonlySet<string>,
): boolean {
  if (String(row.provider ?? "").toLowerCase() !== "turnkey") return false
  if (String(row.direction ?? "").toLowerCase() !== "in") return false
  if (!row.metadata || typeof row.metadata !== "object") {
    const h = String(row.tx_hash ?? "").trim()
    return Boolean(h && globalPayoutRefundTxHashes.has(h))
  }
  const m = row.metadata as Record<string, unknown>
  if (m.global_payout_refund_mirror === true || m.suppress_in_feed === true) return true
  const h = String(row.tx_hash ?? "").trim()
  if (h && globalPayoutRefundTxHashes.has(h)) return true
  return false
}
