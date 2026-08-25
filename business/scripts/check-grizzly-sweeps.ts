import { createClient } from "@supabase/supabase-js"
import { retrieveGridQuote } from "@/lib/grid/quote-funding"

const BUSINESS_ID = "53798479-3d39-428a-bd22-0b48fc3792a2"

async function main() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })

  const { data: transfers } = await admin
    .from("grid_transfers")
    .select("id,status,quoted_pay_in,grid_quote_id,grid_transaction_id,metadata,created_at,updated_at")
    .eq("business_id", BUSINESS_ID)
    .eq("mode", "va_turnkey_sweep")
    .order("quoted_pay_in")

  console.log(JSON.stringify({ sweeps: transfers }, null, 2))

  for (const t of transfers ?? []) {
    if (!t.grid_quote_id) continue
    const q = await retrieveGridQuote(String(t.grid_quote_id)).catch((e) => ({
      error: e instanceof Error ? e.message : String(e),
    }))
    console.log(
      JSON.stringify({
        amount: t.quoted_pay_in,
        sweepStatus: t.status,
        quoteStatus: "status" in q ? q.status : undefined,
        quoteError: "error" in q ? q.error : undefined,
        hash: (t.metadata as Record<string, unknown>)?.grid_on_chain_tx_hash ?? null,
      }),
    )
  }

  const { data: wo } = await admin
    .from("wallet_owners")
    .select("id")
    .eq("owner_ref", BUSINESS_ID)
    .maybeSingle()

  const { data: accounts } = await admin
    .from("wallet_accounts")
    .select("address,associated_token_account_address,asset,status")
    .eq("wallet_owner_id", wo?.id ?? "")

  console.log(JSON.stringify({ vault: accounts }, null, 2))
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
