import type { SupabaseClient } from "@supabase/supabase-js"
import { applyWalletBalanceDelta } from "@/lib/wallet/wallet-balances-db"

/** Hide duplicate Turnkey inbound rows when Easetag P2P payee credit already exists for the same transfer. */
export async function suppressTurnkeyEasetagChainMirrorRow(
  admin: SupabaseClient,
  input: {
    txHash: string
    userId: string
    businessId: string | null
    transferGroupId?: string | null
  },
): Promise<{ suppressed: number; reversedBalance: number }> {
  const txHash = String(input.txHash ?? "").trim()
  if (!txHash) return { suppressed: 0, reversedBalance: 0 }

  let q = admin
    .from("transactions")
    .select("id,metadata,amount,currency")
    .eq("provider", "turnkey")
    .eq("direction", "in")
    .eq("tx_hash", txHash)
  if (input.businessId) q = q.eq("business_id", input.businessId)
  else q = q.eq("user_id", input.userId).is("business_id", null)

  const { data: rows } = await q.limit(8)
  let suppressed = 0
  let reversedBalance = 0

  for (const row of rows ?? []) {
    const meta = (row.metadata as Record<string, unknown> | undefined) ?? {}
    if (meta.easetag_p2p_chain_mirror === true) continue
    const source = String(meta.source ?? "").trim()
    if (source !== "turnkey_balance_webhook" && source !== "turnkey_chain_sync") continue

    const reportingAmount = Number(meta.reporting_wallet_amount ?? row.amount ?? 0)
    if (meta.balance_delta_applied === true && reportingAmount > 0) {
      const currency = String(row.currency ?? "USD").toUpperCase()
      await applyWalletBalanceDelta(admin, {
        businessId: input.businessId,
        userId: input.businessId ? null : input.userId,
        currency,
        delta: -reportingAmount,
      }).catch(() => {})
      reversedBalance += reportingAmount
    }

    await admin
      .from("transactions")
      .update({
        hidden_from_feed: true,
        metadata: {
          ...meta,
          easetag_p2p_chain_mirror: true,
          suppress_in_feed: true,
          ...(input.transferGroupId ? { transfer_group_id: input.transferGroupId } : {}),
          ...(meta.balance_delta_applied === true ? { easetag_p2p_chain_mirror_reversed: true } : {}),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
    suppressed += 1
  }

  return { suppressed, reversedBalance }
}
