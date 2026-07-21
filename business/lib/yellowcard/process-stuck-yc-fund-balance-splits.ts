import type { SupabaseClient } from "@supabase/supabase-js"
import {
  triggerYcFundBalanceOmnibusSplit,
  tryCompleteYcFundBalanceFromUserVaultInbound,
  resolveYcFundBalanceVaultTxHashFromSendId,
} from "@/lib/yellowcard/execute-yc-fund-balance-split"

export type StuckYcFundBalanceSplitRow = {
  id: string
  transaction_id: string | null
  user_id: string
  business_id: string | null
  metadata: Record<string, unknown>
  settlement_info: Record<string, unknown> | null
}

function asMeta(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
}

export async function listStuckYcFundBalanceSplits(
  admin: SupabaseClient,
  opts: { limit?: number; olderThanMs?: number } = {},
): Promise<StuckYcFundBalanceSplitRow[]> {
  const limit = Math.max(1, Math.min(100, opts.limit ?? 25))
  const olderThanMs = opts.olderThanMs ?? 90_000
  const cutoff = new Date(Date.now() - olderThanMs).toISOString()

  const { data: rows } = await admin
    .from("yc_transfers")
    .select("id, transaction_id, user_id, business_id, metadata, settlement_info")
    .eq("mode", "fund_balance")
    .neq("status", "completed")
    .filter("metadata->>leg1_omnibus_tx_hash", "not.is", null)
    .lt("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(limit)

  return (rows ?? [])
    .map((row) => ({
      id: String(row.id),
      transaction_id: row.transaction_id != null ? String(row.transaction_id) : null,
      user_id: String(row.user_id),
      business_id: row.business_id != null ? String(row.business_id) : null,
      metadata: asMeta(row.metadata),
      settlement_info: asMeta(row.settlement_info),
    }))
    .filter((row) => {
      const splitStatus = String(row.metadata.fund_balance_split_status ?? "pending")
      return splitStatus === "pending" || splitStatus === "send_submitted"
    })
}

export async function processStuckYcFundBalanceSplits(
  admin: SupabaseClient,
  opts: { limit?: number; olderThanMs?: number } = {},
): Promise<{ processed: number; completed: number; failed: number }> {
  const jobs = await listStuckYcFundBalanceSplits(admin, opts)
  let processed = 0
  let completed = 0
  let failed = 0

  for (const row of jobs) {
    processed += 1
    const omnibusTxHash = String(row.metadata.leg1_omnibus_tx_hash ?? "").trim()
    let userVaultTxHash = String(row.metadata.user_vault_tx_hash ?? "").trim()
    const splitStatus = String(row.metadata.fund_balance_split_status ?? "pending")

    if (splitStatus === "send_submitted" && !userVaultTxHash) {
      const sendId = String(row.metadata.user_vault_send_id ?? "").trim()
      if (sendId) {
        const resolved = await resolveYcFundBalanceVaultTxHashFromSendId(sendId)
        if (resolved) {
          userVaultTxHash = resolved
          await admin
            .from("yc_transfers")
            .update({
              metadata: { ...row.metadata, user_vault_tx_hash: resolved },
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id)
        }
      }
    }

    if (splitStatus === "send_submitted" && userVaultTxHash) {
      const done = await tryCompleteYcFundBalanceFromUserVaultInbound(admin, {
        txHash: userVaultTxHash,
        userId: row.user_id,
        businessId: row.business_id,
        amount: Number(row.metadata.usd_credit_applied ?? row.metadata.usd_credit ?? 0),
      })
      if (done) completed += 1
      else failed += 1
      continue
    }

    const result = await triggerYcFundBalanceOmnibusSplit(admin, {
      transferId: row.id,
      transactionId: row.transaction_id,
      payload: { settlementInfo: row.settlement_info ?? {} },
      omnibusTxHash,
      omnibusAmount: Number(row.metadata.omnibus_in_actual ?? 0) || null,
    })
    if (result.finalized) completed += 1
    else if (!result.ok) failed += 1
  }

  return { processed, completed, failed }
}
