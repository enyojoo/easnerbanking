import type { SupabaseClient } from "@supabase/supabase-js"
import { isGridVaBankDepositMetadata } from "./grid-bank-deposit-credit"

export type GridVaBankDepositChainSuppression = {
  linkedTransactionId: string
}

function applyLedgerScope<T extends { eq: (col: string, val: string) => T; is: (col: string, val: null) => T }>(
  query: T,
  scope: { userId: string; businessId: string | null },
): T {
  if (scope.businessId) return query.eq("business_id", scope.businessId)
  return query.eq("user_id", scope.userId).is("business_id", null)
}

/**
 * Grid VA bank deposits credit the fiat ledger and settle on-chain to Turnkey.
 * Suppress duplicate Turnkey organic deposit rows for the same signature.
 */
export async function findGridVaBankDepositChainSettlementForSuppression(
  admin: SupabaseClient,
  input: { txHash: string; userId: string; businessId: string | null },
): Promise<GridVaBankDepositChainSuppression | null> {
  const txHash = String(input.txHash || "").trim()
  if (!txHash) return null

  const select = "id, metadata"

  let byTxHash = admin.from("transactions").select(select).eq("provider", "grid").eq("tx_hash", txHash)
  byTxHash = applyLedgerScope(byTxHash, input)
  const { data: rowsByHash } = await byTxHash.limit(8)
  for (const row of rowsByHash ?? []) {
    if (isGridVaBankDepositMetadata(row.metadata)) {
      return { linkedTransactionId: String(row.id) }
    }
  }

  let byMeta = admin
    .from("transactions")
    .select(select)
    .eq("provider", "grid")
    .eq("direction", "in")
    .filter("metadata->>grid_on_chain_tx_hash", "eq", txHash)
  byMeta = applyLedgerScope(byMeta, input)
  const { data: payInRow } = await byMeta.maybeSingle()
  if (payInRow?.id && isGridVaBankDepositMetadata(payInRow.metadata)) {
    return { linkedTransactionId: String(payInRow.id) }
  }

  return null
}

export async function findPendingGridVaBankDepositForInboundAmount(
  admin: SupabaseClient,
  input: {
    userId: string
    businessId: string | null
    amount: number
    currency: string
  },
): Promise<{ transactionId: string; gridTransactionId: string } | null> {
  const currency = String(input.currency || "USD").trim().toUpperCase()
  if (!(input.amount > 0)) return null

  let q = admin
    .from("transactions")
    .select("id,metadata,amount,currency,provider_transaction_id,tx_hash")
    .eq("provider", "grid")
    .eq("direction", "in")
    .eq("status", "settled")
    .is("tx_hash", null)
    .filter("metadata->>flow", "eq", "bank_onramp")
    .filter("metadata->>grid_va_inbound", "eq", "true")
  q = applyLedgerScope(q, input)
  const { data: rows } = await q.order("created_at", { ascending: false }).limit(12)

  for (const row of rows ?? []) {
    const meta = (row.metadata as Record<string, unknown> | undefined) ?? {}
    const onChain =
      String(row.tx_hash ?? "").trim() ||
      (typeof meta.grid_on_chain_tx_hash === "string" ? meta.grid_on_chain_tx_hash.trim() : "")
    if (onChain) continue
    const ledger = String(meta.wallet_ledger_currency ?? row.currency ?? "USD").toUpperCase()
    if (ledger !== currency) continue
    const amount = Number(row.amount ?? 0)
    if (Math.abs(amount - input.amount) >= 0.02) continue
    return {
      transactionId: String(row.id),
      gridTransactionId: String(
        meta.grid_transaction_id ?? row.provider_transaction_id ?? row.id,
      ).trim(),
    }
  }

  return null
}
