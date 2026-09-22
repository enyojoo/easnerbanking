import { createClient } from "@supabase/supabase-js"

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

const leftoverEtids = [
  "ETID60822628",
  "ETID72407784",
  "ETID97484240",
  "ETID75018692",
  "ETID05367608",
  "ETID96036469",
  "ETID83507335",
  "ETID13269066",
  "ETID34571895",
  "ETID66576760",
  "ETID20158881",
  "ETID21071926",
  "ETID21480552",
  "ETID97214296",
  "ETID52128192",
  "ETID23303699",
  "ETID93570975",
  "ETID43197789",
  "ETID13630504",
]
const relatedOuts = ["ETID17647924", "ETID14210652", "ETID52446821"]

function slim(row: Record<string, unknown>) {
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
    fee: meta.processing_fee ?? meta.fee_wallet_sweep ?? meta.easner_fee ?? null,
    sweepHash: meta.fee_wallet_sweep_tx_hash ?? null,
    activity: meta.activity_type ?? meta.yc_mode ?? meta.flow ?? meta.source ?? null,
    hash: row.tx_hash,
    status: row.status ?? null,
  }
}

async function nearbyUserOuts(userId: string, at: string, hours = 6) {
  const t = Date.parse(at)
  const since = new Date(t - hours * 3600_000).toISOString()
  const until = new Date(t + hours * 3600_000).toISOString()
  const { data } = await admin
    .from("transactions")
    .select(
      "easner_transaction_id, direction, amount, user_id, business_id, created_at, occurred_at, counterparty_address, wallet_address, provider, metadata, tx_hash, status",
    )
    .eq("user_id", userId)
    .eq("direction", "out")
    .gte("created_at", since)
    .lte("created_at", until)
    .order("created_at", { ascending: true })
    .limit(40)
  return (data ?? []).map((r) => slim(r as Record<string, unknown>))
}

async function walletLookup(address: string) {
  const { data } = await admin
    .from("wallet_accounts")
    .select("address, associated_token_account_address, chain, asset, wallet_owner_id")
    .or(`address.eq.${address},associated_token_account_address.eq.${address}`)
    .limit(3)
  return data ?? []
}

async function main() {
  const { data: ins } = await admin
    .from("transactions")
    .select(
      "easner_transaction_id, direction, amount, user_id, business_id, created_at, occurred_at, counterparty_address, wallet_address, provider, metadata, tx_hash, status",
    )
    .in("easner_transaction_id", leftoverEtids)
  const { data: outs } = await admin
    .from("transactions")
    .select(
      "easner_transaction_id, direction, amount, user_id, business_id, created_at, occurred_at, counterparty_address, wallet_address, provider, metadata, tx_hash, status",
    )
    .in("easner_transaction_id", relatedOuts)

  const leftovers = (ins ?? []).map((r) => slim(r as Record<string, unknown>))
  const froms = [...new Set(leftovers.map((r) => String(r.from ?? "")).filter(Boolean))]
  const wallets: Record<string, unknown> = {}
  for (const from of froms) {
    wallets[from] = await walletLookup(from)
  }

  const czl = leftovers.filter((r) => String(r.from ?? "").startsWith("CZL3uoLy") && Number(r.amount) === 1)
  const czlNearby: Record<string, unknown> = {}
  for (const row of czl) {
    czlNearby[String(row.etid)] = await nearbyUserOuts("c7ace38e-be38-43e7-86e1-6e66b90d4243", String(row.occurred ?? row.created), 12)
  }

  const gw = leftovers.filter((r) => String(r.from ?? "").startsWith("5GwMvLWa"))
  const gwNearby: Record<string, unknown> = {}
  for (const row of gw) {
    gwNearby[String(row.etid)] = await nearbyUserOuts("71e4c329-ba94-4f9a-a246-0b2059480200", String(row.occurred ?? row.created), 1)
  }

  console.log(
    JSON.stringify(
      {
        leftovers,
        relatedOuts: (outs ?? []).map((r) => slim(r as Record<string, unknown>)),
        wallets,
        czlNearby,
        gwNearby,
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
