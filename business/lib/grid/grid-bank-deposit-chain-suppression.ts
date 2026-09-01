import type { SupabaseClient } from "@supabase/supabase-js"
import { isGridVaBankDepositMetadata } from "./grid-bank-deposit-credit"
import { isGridVaTurnkeyDustAmount } from "./grid-va-turnkey-dust"

export type GridVaBankDepositChainSuppression = {
  linkedTransactionId: string
}

export { GRID_VA_TURNKEY_DUST_MAX_USD, isGridVaTurnkeyDustAmount } from "./grid-va-turnkey-dust"

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

  for (const metaKey of ["grid_on_chain_tx_hash", "turnkey_on_chain_tx_hash"] as const) {
    let byMeta = admin
      .from("transactions")
      .select(select)
      .eq("provider", "grid")
      .eq("direction", "in")
      .filter(`metadata->>${metaKey}`, "eq", txHash)
    byMeta = applyLedgerScope(byMeta, input)
    const { data: payInRow } = await byMeta.maybeSingle()
    if (payInRow?.id && isGridVaBankDepositMetadata(payInRow.metadata)) {
      return { linkedTransactionId: String(payInRow.id) }
    }
  }

  for (const metaKey of ["grid_on_chain_tx_hash", "turnkey_on_chain_tx_hash", "turnkey_dust_tx_hash"] as const) {
    let sweepQuery = admin
      .from("grid_transfers")
      .select("transaction_id,metadata")
      .eq("mode", "va_turnkey_sweep")
      .filter(`metadata->>${metaKey}`, "eq", txHash)
    if (input.businessId) sweepQuery = sweepQuery.eq("business_id", input.businessId)
    else sweepQuery = sweepQuery.eq("user_id", input.userId).is("business_id", null)
    const { data: sweepRow } = await sweepQuery.maybeSingle()
    const sweepLedgerId = String(sweepRow?.transaction_id ?? "").trim()
    if (!sweepLedgerId) continue
    const { data: sweepLedger } = await admin
      .from("transactions")
      .select(select)
      .eq("id", sweepLedgerId)
      .maybeSingle()
    if (sweepLedger?.id && isGridVaBankDepositMetadata(sweepLedger.metadata)) {
      return { linkedTransactionId: String(sweepLedger.id) }
    }
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
    txHash?: string | null
    withinHours?: number
  },
): Promise<{ transactionId: string; gridTransactionId: string } | null> {
  const currency = String(input.currency || "USD").trim().toUpperCase()
  if (!(input.amount > 0) || isGridVaTurnkeyDustAmount(input.amount)) return null

  const incomingHash = String(input.txHash ?? "").trim()
  const hours = input.withinHours ?? 48
  const sinceIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

  let q = admin
    .from("transactions")
    .select("id,metadata,amount,currency,provider_transaction_id,tx_hash")
    .eq("provider", "grid")
    .eq("direction", "in")
    .eq("status", "settled")
    .filter("metadata->>flow", "eq", "bank_onramp")
    .filter("metadata->>grid_va_inbound", "eq", "true")
    .gte("created_at", sinceIso)
  q = applyLedgerScope(q, input)
  const { data: rows } = await q.order("created_at", { ascending: false }).limit(24)

  for (const row of rows ?? []) {
    const meta = (row.metadata as Record<string, unknown> | undefined) ?? {}
    const ledgerHash =
      String(row.tx_hash ?? "").trim() ||
      (typeof meta.grid_on_chain_tx_hash === "string" ? meta.grid_on_chain_tx_hash.trim() : "")
    const turnkeyHash =
      typeof meta.turnkey_on_chain_tx_hash === "string" ? meta.turnkey_on_chain_tx_hash.trim() : ""
    if (incomingHash && (ledgerHash === incomingHash || turnkeyHash === incomingHash)) continue
    // Already linked to a different Turnkey wallet signature.
    if (turnkeyHash && incomingHash && turnkeyHash !== incomingHash) continue
    const ledger = String(meta.wallet_ledger_currency ?? row.currency ?? "USD").toUpperCase()
    if (ledger !== currency) continue
    const amount = Number(meta.settled_stablecoin_amount ?? row.amount ?? 0)
    if (!amountsRoughlyEqual(amount, input.amount)) continue
    return {
      transactionId: String(row.id),
      gridTransactionId: String(
        meta.grid_transaction_id ?? row.provider_transaction_id ?? row.id,
      ).trim(),
    }
  }

  return null
}

/** User-facing Grid VA bank-deposit row exists (fiat credited; chain hash may still be empty). */
export async function gridVaInboundCreditVisible(
  admin: SupabaseClient,
  input: {
    userId: string
    businessId: string | null
    amount?: number | null
    withinHours?: number
  },
): Promise<boolean> {
  const hours = input.withinHours ?? 48
  const sinceIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
  let q = admin
    .from("transactions")
    .select("id,metadata,amount,hidden_from_feed")
    .eq("provider", "grid")
    .eq("direction", "in")
    .eq("status", "settled")
    .filter("metadata->>flow", "eq", "bank_onramp")
    .filter("metadata->>grid_va_inbound", "eq", "true")
    .gte("created_at", sinceIso)
  q = applyLedgerScope(q, input)
  const { data: rows } = await q.limit(24)
  const amount = Number(input.amount ?? 0)
  for (const row of rows ?? []) {
    if (row.hidden_from_feed === true) continue
    if (!isGridVaBankDepositMetadata(row.metadata)) continue
    if (amount > 0) {
      const meta = (row.metadata as Record<string, unknown> | undefined) ?? {}
      const settled = Number(meta.settled_stablecoin_amount ?? row.amount ?? 0)
      if (!amountsRoughlyEqual(settled, amount)) continue
    }
    return true
  }
  return false
}
