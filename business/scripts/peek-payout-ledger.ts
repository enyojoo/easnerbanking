import { createSupabaseAdmin } from "../lib/supabase/admin"

const easnerPayoutId = "3f3045bf-fc29-4934-8dcc-4cbe5821dd17"
const noahTxId = "38c1f5d1-1f46-5e4c-91d1-a9a6823bb53a"

async function main() {
  const admin = createSupabaseAdmin()

  for (const pid of [`global_payout_pending:${easnerPayoutId}`, noahTxId]) {
    const { data, error } = await admin
      .from("transactions")
      .select(
        "id, status, provider, direction, amount, currency, metadata, provider_transaction_id, easner_transaction_id, tx_hash, created_at",
      )
      .eq("provider_transaction_id", pid)
      .limit(5)
    console.log("by provider_transaction_id", pid, error?.message ?? "", JSON.stringify(data, null, 2))
  }

  const { data: byMeta } = await admin
    .from("transactions")
    .select(
      "id, status, provider, direction, amount, currency, metadata, provider_transaction_id, easner_transaction_id, tx_hash, created_at",
    )
    .filter("metadata->>easner_payout_id", "eq", easnerPayoutId)
  console.log("by easner_payout_id", JSON.stringify(byMeta, null, 2))

  const { data: turnkey } = await admin
    .from("transactions")
    .select("id, status, provider, metadata, provider_transaction_id, tx_hash")
    .eq("provider", "turnkey")
    .filter("metadata->>easner_payout_id", "eq", easnerPayoutId)
  console.log("turnkey legs", JSON.stringify(turnkey, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
