import { createSupabaseAdmin } from "../lib/supabase/admin"

const admin = createSupabaseAdmin()

async function main() {
  const etids = ["ETID72973044", "ETID01834004"]

  for (const etid of etids) {
    const { data, error } = await admin
      .from("transactions")
      .select(
        "id, easner_transaction_id, status, direction, amount, currency, hidden_from_feed, metadata, user_id, provider",
      )
      .eq("easner_transaction_id", etid)
      .maybeSingle()
    if (error) throw error
    console.log(`\n=== ${etid} ===`)
    console.log(JSON.stringify(data, null, 2))
  }

  const userId = "c7ace38e-be38-43e7-86e1-6e66b90d4243"
  const { data: failedRows, error: failedErr } = await admin
    .from("transactions")
    .select("easner_transaction_id, metadata, status")
    .eq("user_id", userId)
    .eq("provider", "noah")
    .eq("direction", "out")
    .in("status", ["failed", "cancelled"])
    .or("metadata->>payout_type.eq.global_fiat,metadata->>flow.eq.global_fiat_offramp")
  if (failedErr) throw failedErr
  console.log("\n=== failed global payouts for user ===")
  for (const row of failedRows ?? []) {
    const m = (row.metadata as Record<string, unknown>) ?? {}
    console.log(
      row.easner_transaction_id,
      m.easner_payout_id,
      m.total_debited,
      m.balance_delta_reversed,
      m.stranded_processing_fee_written_off,
    )
  }

  const { data: bal, error: balErr } = await admin
    .from("wallet_balances")
    .select("*")
    .eq("user_id", userId)
    .eq("currency", "USD")
    .maybeSingle()
  if (balErr) throw balErr
  console.log("\n=== wallet_balances USD ===")
  console.log(JSON.stringify(bal, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
