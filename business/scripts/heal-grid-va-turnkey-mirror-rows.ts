/**
 * Link Grid VA Turnkey sweeps to on-chain hashes, hide duplicate Turnkey webhook rows.
 *
 * Usage:
 *   cd business
 *   node --env-file=.env.local --import ./scripts/stub-server-only.mjs --import tsx scripts/heal-grid-va-turnkey-mirror-rows.ts
 *   BUSINESS_ID=53798479-3d39-428a-bd22-0b48fc3792a2 node ...  # optional scope
 */
import { createClient } from "@supabase/supabase-js"
import {
  findGridVaTurnkeySweepForSolanaTx,
  settleGridVaTurnkeySweepForSolanaTx,
  suppressTurnkeyGridVaChainMirrorRow,
  GRID_VA_TURNKEY_SWEEP_MODE,
} from "@/lib/grid/va-turnkey-sweep"

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("supabase env missing")
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  const businessId = process.env.BUSINESS_ID?.trim() || null

  let mirrorQuery = admin
    .from("transactions")
    .select("id,tx_hash,user_id,business_id,metadata,amount")
    .eq("provider", "turnkey")
    .eq("direction", "in")
    .contains("metadata", { source: "turnkey_balance_webhook" })
    .eq("hidden_from_feed", false)
  if (businessId) mirrorQuery = mirrorQuery.eq("business_id", businessId)

  const { data: mirrorRows } = await mirrorQuery.order("created_at", { ascending: true })
  const txHashes = [...new Set((mirrorRows ?? []).map((r) => String(r.tx_hash ?? "").trim()).filter(Boolean))]

  const linked: Record<string, unknown>[] = []
  for (const txHash of txHashes) {
    const sample = (mirrorRows ?? []).find((r) => String(r.tx_hash ?? "").trim() === txHash)
    if (!sample) continue
    const sweep = await findGridVaTurnkeySweepForSolanaTx(admin, {
      txHash,
      businessId: sample.business_id ? String(sample.business_id) : null,
      userId: String(sample.user_id ?? ""),
    })
    if (!sweep) {
      linked.push({ txHash, linked: false, reason: "no_sweep_match" })
      continue
    }
    await settleGridVaTurnkeySweepForSolanaTx(admin, {
      transferId: sweep.transferId,
      solanaTxHash: txHash,
    })
    const suppressed = await suppressTurnkeyGridVaChainMirrorRow(admin, {
      txHash,
      userId: String(sample.user_id ?? ""),
      businessId: sample.business_id ? String(sample.business_id) : null,
    })
    linked.push({ txHash, transferId: sweep.transferId, ...suppressed })
  }

  let sweepQuery = admin
    .from("grid_transfers")
    .select("id,quoted_pay_in,status,transaction_id,metadata")
    .eq("mode", GRID_VA_TURNKEY_SWEEP_MODE)
  if (businessId) sweepQuery = sweepQuery.eq("business_id", businessId)
  const { data: sweeps } = await sweepQuery.order("created_at", { ascending: true })

  let gridQuery = admin
    .from("transactions")
    .select("id,amount,tx_hash,metadata")
    .eq("provider", "grid")
    .eq("direction", "in")
    .filter("metadata->>grid_va_inbound", "eq", "true")
  if (businessId) gridQuery = gridQuery.eq("business_id", businessId)
  const { data: gridRows } = await gridQuery.order("created_at", { ascending: true })

  console.log(
    JSON.stringify(
      {
        linked,
        sweeps,
        gridRows: (gridRows ?? []).map((r) => ({
          id: r.id,
          amount: r.amount,
          tx_hash: r.tx_hash,
          grid_on_chain_tx_hash: (r.metadata as Record<string, unknown> | undefined)?.grid_on_chain_tx_hash ?? null,
        })),
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
