import type { SupabaseClient } from "@supabase/supabase-js"
import { applyWalletBalanceDelta } from "@/lib/wallet/wallet-balances-db"

/** Delete duplicate Turnkey balance-webhook rows once Grid VA sweep is linked on-chain. */
export async function suppressTurnkeyGridVaChainMirrorRow(
  admin: SupabaseClient,
  input: {
    txHash: string
    userId: string
    businessId: string | null
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
    const source = String(meta.source ?? "").trim()
    if (
      source !== "turnkey_balance_webhook" &&
      source !== "turnkey_chain_sync" &&
      meta.grid_va_turnkey_chain_mirror !== true
    ) {
      continue
    }

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

    await admin.from("transactions").delete().eq("id", row.id)
    suppressed += 1
  }

  return { suppressed, reversedBalance }
}
