import type { SupabaseClient } from "@supabase/supabase-js"
import {
  isNoahBankOnrampFiatPayIn,
  isNoahBankOnrampOrchestrationOutLeg,
} from "@/lib/noah/bank-onramp-tx"

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
    if (meta.flow === "bank_onramp" || meta.noah_rule_execution_id || isNoahBankOnrampFiatPayIn(payload)) {
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
    const h = String(row.tx_hash || "").trim()
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

  return matched
}
