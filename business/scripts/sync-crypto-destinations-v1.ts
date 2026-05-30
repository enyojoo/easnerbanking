/**
 * One-shot sync of crypto_destinations to v1 wallet-send catalog.
 * Preserves existing UUIDs when rows exist; deletes BTC/SOL/PYUSD.
 *
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/sync-crypto-destinations-v1.ts
 */
import { createSupabaseAdmin } from "../lib/supabase/admin"

const V1_ASSETS: Array<{
  id?: string
  code: string
  name: string
  networks: string[]
  sort_order: number
  provider_routing: Array<{ provider: string; priority: number; settlement_asset: string }>
}> = [
  {
    id: "ea64b85a-1a54-4ad4-bf57-3b50a2d7791d",
    code: "USDC",
    name: "USD Coin",
    networks: ["Solana", "Ethereum", "Base", "PolygonPos", "BSC"],
    sort_order: 1,
    provider_routing: [
      { provider: "turnkey", priority: 1, settlement_asset: "USDC" },
      { provider: "lifi", priority: 2, settlement_asset: "USDC" },
    ],
  },
  {
    id: "fdf52bea-1b5f-4484-b61d-e594cc96b807",
    code: "USDT",
    name: "Tether USD",
    networks: ["Tron", "Ethereum", "BSC", "PolygonPos", "Solana"],
    sort_order: 2,
    provider_routing: [{ provider: "lifi", priority: 1, settlement_asset: "USDC" }],
  },
  {
    id: "a8951601-8314-42dc-8c33-d7130d43aaba",
    code: "EURC",
    name: "Euro Coin",
    networks: ["Solana"],
    sort_order: 3,
    provider_routing: [{ provider: "turnkey", priority: 1, settlement_asset: "EURC" }],
  },
]

const LEGACY = ["BTC", "SOL", "PYUSD"]

async function main() {
  const admin = createSupabaseAdmin()

  for (const a of V1_ASSETS) {
    const payload = {
      asset_code: a.code,
      asset_name: a.name,
      networks: a.networks,
      country_code: null,
      enabled: true,
      sort_order: a.sort_order,
      provider_routing: a.provider_routing,
      updated_at: new Date().toISOString(),
    }

    let existingId: string | null = null
    if (a.id) {
      const { data: byId } = await admin.from("crypto_destinations").select("id").eq("id", a.id).maybeSingle()
      existingId = byId?.id ?? null
    }
    if (!existingId) {
      const { data: byCode } = await admin
        .from("crypto_destinations")
        .select("id")
        .eq("asset_code", a.code)
        .maybeSingle()
      existingId = byCode?.id ?? null
    }

    const { error } = existingId
      ? await admin.from("crypto_destinations").update(payload).eq("id", existingId)
      : await admin.from("crypto_destinations").insert({ ...payload, ...(a.id ? { id: a.id } : {}) })

    if (error) console.warn("update", a.code, error.message)
    else console.log("synced", a.code)
  }

  const { error: delErr, count } = await admin
    .from("crypto_destinations")
    .delete({ count: "exact" })
    .in("asset_code", LEGACY)
  if (delErr) console.warn("delete legacy", delErr.message)
  else console.log("deleted legacy rows", count ?? 0)
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
