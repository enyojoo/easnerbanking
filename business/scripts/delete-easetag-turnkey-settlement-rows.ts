/**
 * Remove legacy Turnkey OUT rows for Easetag chain settlement (P2P debit/credit are the ledger record).
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/delete-easetag-turnkey-settlement-rows.ts --dry-run
 *   cd business && node --env-file=.env.local --import tsx scripts/delete-easetag-turnkey-settlement-rows.ts
 */
import { createSupabaseAdmin } from "../lib/supabase/admin"
import { patchEasetagP2pChainSettlement } from "../lib/ledger/easetag-settlement"
import { applyWalletBalanceDelta } from "../lib/wallet/wallet-balances-db"

const dryRun = process.argv.includes("--dry-run")

async function main() {
  const admin = createSupabaseAdmin()

  const { data: rows, error } = await admin
    .from("transactions")
    .select("id, user_id, business_id, amount, currency, metadata, direction, provider, provider_transaction_id, tx_hash")
    .eq("provider", "turnkey")
    .eq("direction", "out")

  if (error) throw error

  const deleteIds: string[] = []
  for (const row of rows ?? []) {
    const meta = (row.metadata as Record<string, unknown> | undefined) ?? {}
    if (meta.easetag_settlement_leg !== true) continue
    deleteIds.push(String(row.id))

    const transferGroupId = String(meta.transfer_group_id ?? "").trim()
    const turnkeySendId = String(row.provider_transaction_id ?? "").trim()
    const txHash = String(row.tx_hash ?? "").trim() || null
    if (!dryRun && transferGroupId && turnkeySendId) {
      await patchEasetagP2pChainSettlement(admin, {
        transferGroupId,
        turnkeySendId,
        txHash,
        turnkeySendStatus: "settled",
      }).catch(() => {})
    }

    const reverseBalance = meta.balance_delta_applied === true
    const amount = Number(row.amount ?? 0)
    if (!dryRun && reverseBalance && Number.isFinite(amount) && amount > 0) {
      await applyWalletBalanceDelta(admin, {
        businessId: row.business_id != null ? String(row.business_id) : null,
        userId: row.business_id != null ? null : String(row.user_id),
        currency: String(row.currency ?? "USD"),
        delta: amount,
      })
    }
  }

  console.log(
    `${dryRun ? "[dry-run] " : ""}delete ${deleteIds.length} Turnkey Easetag settlement row(s): ${deleteIds.join(", ") || "—"}`,
  )

  if (!dryRun && deleteIds.length) {
    await admin.from("transactions").delete().in("id", deleteIds)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
