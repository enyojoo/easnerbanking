import type { SupabaseClient } from "@supabase/supabase-js"

export function isBridgeVaBankDepositMetadata(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false
  const meta = metadata as Record<string, unknown>
  return meta.flow === "bank_onramp" && meta.payout_provider === "bridge" && meta.bridge_va_inbound === true
}

function amountsRoughlyEqual(a: number, b: number): boolean {
  if (!(a > 0) || !(b > 0)) return false
  return Math.abs(a - b) <= Math.max(0.02, a * 0.001)
}

function applyLedgerScope<T extends { eq: (col: string, val: string) => T; is: (col: string, val: null) => T }>(
  query: T,
  scope: { userId: string; businessId: string | null },
): T {
  if (scope.businessId) return query.eq("business_id", scope.businessId)
  return query.eq("user_id", scope.userId).is("business_id", null)
}

export async function findBridgeVaBankDepositChainSettlementForSuppression(
  admin: SupabaseClient,
  input: { txHash: string; userId: string; businessId: string | null },
): Promise<{ linkedTransactionId: string } | null> {
  const txHash = String(input.txHash || "").trim()
  if (!txHash) return null
  const select = "id, metadata"

  let byTxHash = admin.from("transactions").select(select).eq("provider", "bridge").eq("tx_hash", txHash)
  byTxHash = applyLedgerScope(byTxHash, input)
  const { data: rowsByHash } = await byTxHash.limit(8)
  for (const row of rowsByHash ?? []) {
    if (isBridgeVaBankDepositMetadata(row.metadata)) {
      return { linkedTransactionId: String(row.id) }
    }
  }

  for (const metaKey of ["bridge_on_chain_tx_hash", "turnkey_on_chain_tx_hash"] as const) {
    let byMeta = admin
      .from("transactions")
      .select(select)
      .eq("provider", "bridge")
      .eq("direction", "in")
      .filter(`metadata->>${metaKey}`, "eq", txHash)
    byMeta = applyLedgerScope(byMeta, input)
    const { data: payInRow } = await byMeta.maybeSingle()
    if (payInRow?.id && isBridgeVaBankDepositMetadata(payInRow.metadata)) {
      return { linkedTransactionId: String(payInRow.id) }
    }
  }
  return null
}

/** Fiat already credited for a Bridge VA deposit; chain hash may still be empty. */
export async function findPendingBridgeVaBankDepositForInboundAmount(
  admin: SupabaseClient,
  input: {
    userId: string
    businessId: string | null
    amount: number
    currency: string
    txHash?: string | null
    withinHours?: number
  },
): Promise<{ linkedTransactionId: string } | null> {
  const currency = String(input.currency || "USD").trim().toUpperCase()
  if (!(input.amount > 0)) return null

  const incomingHash = String(input.txHash ?? "").trim()
  const hours = input.withinHours ?? 48
  const sinceIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

  let q = admin
    .from("transactions")
    .select("id,metadata,amount,currency,tx_hash,status")
    .eq("provider", "bridge")
    .eq("direction", "in")
    .in("status", ["pending", "settled"])
    .filter("metadata->>flow", "eq", "bank_onramp")
    .filter("metadata->>bridge_va_inbound", "eq", "true")
    .gte("created_at", sinceIso)
  q = applyLedgerScope(q, input)
  const { data: rows } = await q.order("created_at", { ascending: false }).limit(24)

  for (const row of rows ?? []) {
    if (!isBridgeVaBankDepositMetadata(row.metadata)) continue
    const meta = (row.metadata as Record<string, unknown> | undefined) ?? {}
    const ledgerHash =
      String(row.tx_hash ?? "").trim() ||
      (typeof meta.bridge_on_chain_tx_hash === "string" ? meta.bridge_on_chain_tx_hash.trim() : "")
    const turnkeyHash =
      typeof meta.turnkey_on_chain_tx_hash === "string" ? meta.turnkey_on_chain_tx_hash.trim() : ""
    if (incomingHash && (ledgerHash === incomingHash || turnkeyHash === incomingHash)) {
      return { linkedTransactionId: String(row.id) }
    }
    if (turnkeyHash && incomingHash && turnkeyHash !== incomingHash) continue
    const ledger = String(meta.wallet_ledger_currency ?? row.currency ?? "USD").toUpperCase()
    if (ledger !== currency) continue
    const amount = Number(meta.settled_stablecoin_amount ?? row.amount ?? 0)
    if (!amountsRoughlyEqual(amount, input.amount)) continue
    return { linkedTransactionId: String(row.id) }
  }
  return null
}
