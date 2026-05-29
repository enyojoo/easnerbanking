import type { SupabaseClient } from "@supabase/supabase-js"
import {
  extractNoahBankPayInEnrichment,
  isNoahBankOnrampFiatPayIn,
  isNoahBankOnrampLedgerPayload,
  isNoahBankOnrampOrchestrationOutLeg,
} from "@/lib/noah/bank-onramp-tx"
import { pickNoahOnChainTxHashFromLedgerRow } from "@/lib/noah/noah-on-chain-tx-hash"

export type NoahBankOnrampChainSuppression = {
  linkedTransactionId: string
  kind: "pay_in" | "orchestration_out"
}

function applyLedgerScope<T extends { eq: (col: string, val: string) => T; is: (col: string, val: null) => T }>(
  query: T,
  scope: { userId: string; businessId: string | null },
): T {
  if (scope.businessId) return query.eq("business_id", scope.businessId)
  return query.eq("user_id", scope.userId).is("business_id", null)
}

function classifyNoahBankOnrampChainLedgerRow(row: {
  direction?: unknown
  metadata?: unknown
  payload?: unknown
}): NoahBankOnrampChainSuppression["kind"] | null {
  const meta = (row.metadata as Record<string, unknown> | undefined) ?? {}
  const payload = (row.payload as Record<string, unknown> | undefined) ?? {}
  const dir = String(row.direction ?? "").toLowerCase()

  if (dir === "in") {
    if (
      meta.global_payout_orchestration_in_leg === true ||
      meta.global_payout_orchestration_in_leg_linked === true ||
      meta.payout_type === "global_fiat"
    ) {
      return null
    }
    if (
      meta.flow === "bank_onramp" ||
      meta.noah_rule_execution_id ||
      meta.noah_orchestration_settlement_in_leg === true ||
      isNoahBankOnrampFiatPayIn(payload) ||
      isNoahBankOnrampLedgerPayload(payload)
    ) {
      return "pay_in"
    }
  }
  if (dir === "out") {
    if (
      meta.noah_orchestration_settlement_leg === true ||
      meta.flow === "bank_onramp" ||
      isNoahBankOnrampOrchestrationOutLeg(payload)
    ) {
      return "orchestration_out"
    }
  }
  return null
}

/**
 * Noah bank onramp already credits the fiat ledger and records the on-chain settlement.
 * Turnkey RPC backfill / webhooks must not create a second user-visible deposit for the same signature.
 */
export async function findNoahBankOnrampChainSettlementForSuppression(
  admin: SupabaseClient,
  input: { txHash: string; userId: string; businessId: string | null },
): Promise<NoahBankOnrampChainSuppression | null> {
  const txHash = String(input.txHash || "").trim()
  if (!txHash) return null

  const select = "id, direction, metadata, payload"

  let byTxHash = admin.from("transactions").select(select).eq("provider", "noah").eq("tx_hash", txHash)
  byTxHash = applyLedgerScope(byTxHash, input)
  const { data: rowsByHash } = await byTxHash.limit(8)
  for (const row of rowsByHash ?? []) {
    const kind = classifyNoahBankOnrampChainLedgerRow(row)
    if (kind) {
      return { linkedTransactionId: String(row.id), kind }
    }
  }

  let byMeta = admin
    .from("transactions")
    .select(select)
    .eq("provider", "noah")
    .eq("direction", "in")
    .filter("metadata->>noah_on_chain_tx_hash", "eq", txHash)
  byMeta = applyLedgerScope(byMeta, input)
  const { data: payInRow } = await byMeta.maybeSingle()
  if (payInRow?.id) {
    return { linkedTransactionId: String(payInRow.id), kind: "pay_in" }
  }

  const sinceIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  let byOut = admin
    .from("transactions")
    .select(select)
    .eq("provider", "noah")
    .eq("direction", "out")
    .gte("created_at", sinceIso)
  byOut = applyLedgerScope(byOut, input)
  const { data: outRows } = await byOut.limit(40)
  for (const row of outRows ?? []) {
    if (pickNoahOnChainTxHashFromLedgerRow(row) !== txHash) continue
    const kind = classifyNoahBankOnrampChainLedgerRow(row)
    if (kind) {
      return { linkedTransactionId: String(row.id), kind }
    }
  }

  return null
}

function amountsRoughlyEqual(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return false
  return Math.abs(a - b) <= Math.max(0.01, a * 0.001)
}

/**
 * Noah pay-in settled on fiat but Solana hash not linked yet (race before orchestration Out webhook).
 * Also matches pending pay-ins while Noah orchestration is still in flight.
 * Suppresses duplicate stablecoin rows when chain/RPC/Turnkey sees the transfer first.
 */
export async function findPendingNoahBankOnrampForInboundAmount(
  admin: SupabaseClient,
  input: {
    userId: string
    businessId: string | null
    amount: number
    currency: string
    withinHours?: number
  },
): Promise<{ payInTransactionId: string; ruleExecutionId: string | null } | null> {
  const amount = input.amount
  const currency = String(input.currency || "").trim().toUpperCase()
  if (!Number.isFinite(amount) || amount <= 0 || !currency) return null

  const hours = input.withinHours ?? 48
  const sinceIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

  let q = admin
    .from("transactions")
    .select("id, metadata, payload, tx_hash, status")
    .eq("provider", "noah")
    .eq("direction", "in")
    .in("status", ["pending", "processing", "settled"])
    .gte("created_at", sinceIso)
    .or("metadata->>flow.eq.bank_onramp,metadata->>noah_rule_execution_id.not.is.null")
  q = applyLedgerScope(q, input)

  const { data: rows } = await q.limit(20)
  for (const row of rows ?? []) {
    const meta = (row.metadata as Record<string, unknown> | undefined) ?? {}
    const onChain =
      String(row.tx_hash ?? "").trim() ||
      (typeof meta.noah_on_chain_tx_hash === "string" ? meta.noah_on_chain_tx_hash.trim() : "")
    if (onChain) continue

    const payload = (row.payload as Record<string, unknown> | undefined) ?? {}
    if (!isNoahBankOnrampFiatPayIn(payload) && meta.noah_orchestration_settlement_in_leg !== true) {
      continue
    }
    const enrichment = extractNoahBankPayInEnrichment(payload)
    const settled =
      enrichment?.settledStablecoinAmount ??
      (typeof meta.settled_amount === "number" ? meta.settled_amount : Number(meta.settled_amount))
    const ledgerCur =
      enrichment?.walletLedgerCurrency ??
      (typeof meta.settled_currency === "string" ? String(meta.settled_currency).toUpperCase() : null)

    if (!ledgerCur || ledgerCur !== currency) continue
    if (settled == null || !amountsRoughlyEqual(amount, Number(settled))) continue

    const ruleExecutionId =
      (typeof meta.noah_rule_execution_id === "string" && meta.noah_rule_execution_id.trim()) ||
      enrichment?.ruleExecutionId ||
      null

    return {
      payInTransactionId: String(row.id),
      ruleExecutionId,
    }
  }

  return null
}

/** On-chain signatures already represented by a Noah bank onramp row in this ledger scope. */
export async function collectNoahBankOnrampOnChainTxHashesForScope(
  admin: SupabaseClient,
  txHashes: string[],
  scope: { userId: string; businessId: string | null },
): Promise<Set<string>> {
  const wanted = new Set(txHashes.map((h) => String(h).trim()).filter(Boolean))
  if (!wanted.size) return new Set()

  const matched = new Set<string>()

  let byHash = admin
    .from("transactions")
    .select("tx_hash, direction, metadata, payload")
    .eq("provider", "noah")
    .in("tx_hash", [...wanted])
  byHash = applyLedgerScope(byHash, scope)
  const { data: rowsByHash } = await byHash
  for (const row of rowsByHash ?? []) {
    const h = pickNoahOnChainTxHashFromLedgerRow(row)
    if (!h || !wanted.has(h)) continue
    if (classifyNoahBankOnrampChainLedgerRow(row)) matched.add(h)
  }

  for (const h of wanted) {
    if (matched.has(h)) continue
    let q = admin
      .from("transactions")
      .select("id")
      .eq("provider", "noah")
      .eq("direction", "in")
      .filter("metadata->>noah_on_chain_tx_hash", "eq", h)
    q = applyLedgerScope(q, scope)
    const { data } = await q.maybeSingle()
    if (data?.id) matched.add(h)
  }

  const sinceIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  let recent = admin
    .from("transactions")
    .select("tx_hash, direction, metadata, payload")
    .eq("provider", "noah")
    .gte("created_at", sinceIso)
  recent = applyLedgerScope(recent, scope)
  const { data: recentRows } = await recent.limit(120)
  for (const row of recentRows ?? []) {
    const h = pickNoahOnChainTxHashFromLedgerRow(row)
    if (!h || !wanted.has(h) || matched.has(h)) continue
    if (classifyNoahBankOnrampChainLedgerRow(row)) matched.add(h)
  }

  return matched
}
