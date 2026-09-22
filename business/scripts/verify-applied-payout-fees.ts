import { createClient } from "@supabase/supabase-js"
import { resolveOrgTreasuryInboundTitle } from "@easner/shared"

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

async function main() {
  const { data } = await admin
    .from("transactions")
    .select("easner_transaction_id, amount, metadata")
    .in("easner_transaction_id", [
      "ETID64221676",
      "ETID16797817",
      "ETID13630504",
      "ETID23303699",
      "ETID93570975",
      "ETID60822628",
      "ETID34571895",
      "ETID20158881",
    ])

  const rows = (data ?? []).map((row) => {
    const meta = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<string, unknown>
    return {
      etid: row.easner_transaction_id,
      amount: row.amount,
      title: resolveOrgTreasuryInboundTitle(meta),
      kind: meta.org_treasury_kind ?? null,
      related: meta.related_easner_transaction_id ?? null,
    }
  })
  console.log(JSON.stringify(rows, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
