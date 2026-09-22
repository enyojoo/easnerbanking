import { createClient } from "@supabase/supabase-js"

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

const inboundEtids = [
  "ETID35812024",
  "ETID16797817",
  "ETID78622443",
  "ETID29188184",
  "ETID24906600",
  "ETID90182464",
  "ETID64221676",
  "ETID76455935",
  "ETID23303699",
  "ETID13630504",
  "ETID68476583",
  "ETID27188390",
  "ETID62272077",
]
const suspectedPayouts = [
  "ETID04275808",
  "ETID97831840",
  "ETID10027199",
  "ETID13540599",
  "ETID36773953",
  "ETID39300177",
  "ETID95804250",
  "ETID35918131",
  "ETID17647924",
  "ETID14210652",
  "ETID52446821",
  "ETID36015224",
  "ETID76024312",
  "ETID79343606",
]

function slim(row: Record<string, unknown> | null) {
  if (!row) return null
  const meta = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<string, unknown>
  return {
    etid: row.easner_transaction_id,
    dir: row.direction,
    amount: row.amount,
    user: row.user_id,
    biz: row.business_id,
    created: row.created_at,
    occurred: row.occurred_at,
    from: row.counterparty_address ?? meta.from_address ?? null,
    wallet: row.wallet_address,
    provider: row.provider,
    fee: meta.processing_fee ?? meta.fee_wallet_sweep ?? null,
    sweepHash: meta.fee_wallet_sweep_tx_hash ?? null,
    activity: meta.activity_type ?? meta.yc_mode ?? meta.flow ?? null,
    hash: String(row.tx_hash ?? "").slice(0, 12),
  }
}

async function main() {
  const { data: ins } = await admin
    .from("transactions")
    .select("easner_transaction_id, direction, amount, user_id, business_id, created_at, occurred_at, counterparty_address, wallet_address, provider, metadata, tx_hash")
    .in("easner_transaction_id", inboundEtids)
  const { data: outs } = await admin
    .from("transactions")
    .select("easner_transaction_id, direction, amount, user_id, business_id, created_at, occurred_at, counterparty_address, wallet_address, provider, metadata, tx_hash")
    .in("easner_transaction_id", suspectedPayouts)

  console.log(
    JSON.stringify(
      {
        inbounds: (ins ?? []).map((r) => slim(r as Record<string, unknown>)),
        payouts: (outs ?? []).map((r) => slim(r as Record<string, unknown>)),
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
