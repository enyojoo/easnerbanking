/**
 * Book missing org Stablecoin deposits for fee-wallet hashes already on payouts.
 * Avoids listing the ATA (RPC 429). Use chain parse only for missing hashes.
 *
 *   cd business && node --env-file=.env.local --import tsx scripts/heal-missing-fee-wallet-deposits.ts
 *   cd business && node --env-file=.env.local --import tsx scripts/heal-missing-fee-wallet-deposits.ts --apply
 */
import { createClient } from "@supabase/supabase-js"
import { ensureFeeWalletRevenueDeposit } from "@/lib/processing-fee/fee-wallet-inbound-deposit"

const APPLY = process.argv.includes("--apply")

async function main() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
  const since = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recent, error } = await admin
    .from("transactions")
    .select("easner_transaction_id, user_id, business_id, created_at, metadata, direction")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(800)
  if (error) throw error

  const missing: Array<{
    etid: string
    hash: string
    amount: number
    userId: string
    businessId: string | null
    created: string
  }> = []
  const seen = new Set<string>()

  for (const row of recent ?? []) {
    const meta = (row.metadata || {}) as Record<string, unknown>
    const hash = String(meta.fee_wallet_sweep_tx_hash ?? "").trim()
    if (!hash || seen.has(hash)) continue
    seen.add(hash)
    const { data: inbound } = await admin
      .from("transactions")
      .select("easner_transaction_id, hidden_from_feed")
      .eq("tx_hash", hash)
      .eq("direction", "in")
      .limit(5)
    const visible = (inbound ?? []).some((r) => r.hidden_from_feed !== true)
    if (visible) continue
    missing.push({
      etid: String(row.easner_transaction_id ?? ""),
      hash,
      amount: Number(meta.fee_wallet_sweep ?? meta.easner_revenue_sweep_amount ?? meta.processing_fee ?? 0),
      userId: String(row.user_id),
      businessId: row.business_id ? String(row.business_id) : null,
      created: String(row.created_at),
    })
  }

  const results = []
  for (const row of missing) {
    const result = APPLY
      ? await ensureFeeWalletRevenueDeposit(admin, {
          txHash: row.hash,
          amount: row.amount,
          senderUserId: row.userId,
          senderBusinessId: row.businessId,
          relatedEasnerTransactionId: row.etid,
        })
      : { inserted: false, existing: false }
    results.push({ ...row, result })
  }

  console.log(JSON.stringify({ apply: APPLY, scanned: recent?.length ?? 0, missing: results }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
