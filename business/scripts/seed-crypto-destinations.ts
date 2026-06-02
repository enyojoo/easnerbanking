/**
 * Seed crypto_destinations for v1 wallet send (USDC, USDT, EURC).
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/seed-crypto-destinations.ts
 */
import { createSupabaseAdmin } from "../lib/supabase/admin"

const ASSETS: Array<{
  code: string
  name: string
  networks: string[]
  sort_order: number
  provider_routing: Array<{ provider: string; priority: number; settlement_asset: string }>
}> = [
  {
    code: "USDC",
    name: "USD Coin",
    networks: ["Solana", "Ethereum", "Base"],
    sort_order: 1,
    provider_routing: [
      { provider: "turnkey", priority: 1, settlement_asset: "USDC" },
      { provider: "lifi", priority: 2, settlement_asset: "USDC" },
    ],
  },
  {
    code: "USDT",
    name: "Tether USD",
    networks: ["Tron", "Ethereum", "Solana"],
    sort_order: 2,
    provider_routing: [{ provider: "lifi", priority: 1, settlement_asset: "USDC" }],
  },
  {
    code: "EURC",
    name: "Euro Coin",
    networks: ["Solana"],
    sort_order: 3,
    provider_routing: [{ provider: "turnkey", priority: 1, settlement_asset: "EURC" }],
  },
]

const LEGACY_ASSETS = ["BTC", "SOL", "PYUSD"]

async function main() {
  const admin = createSupabaseAdmin()
  const enable = process.env.SEED_CRYPTO_ENABLED !== "false"

  for (const a of ASSETS) {
    const row = {
      asset_code: a.code,
      asset_name: a.name,
      networks: a.networks,
      country_code: null,
      enabled: enable,
      provider_routing: a.provider_routing,
      sort_order: a.sort_order,
    }
    const { data: existing } = await admin
      .from("crypto_destinations")
      .select("id")
      .eq("asset_code", a.code)
      .maybeSingle()

    const { error } = existing?.id
      ? await admin.from("crypto_destinations").update(row).eq("id", existing.id)
      : await admin.from("crypto_destinations").insert(row)

    if (error) console.warn(a.code, error.message)
    else console.log("ok", a.code)
  }

  const { error: delErr } = await admin
    .from("crypto_destinations")
    .delete()
    .in("asset_code", LEGACY_ASSETS)
  if (delErr) console.warn("delete legacy", delErr.message)
  else console.log("removed legacy assets", LEGACY_ASSETS.join(", "))
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
