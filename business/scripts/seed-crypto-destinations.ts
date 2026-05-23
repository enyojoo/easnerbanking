/**
 * Seed crypto_destinations from mobile walletAssetNetworkMap defaults.
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/seed-crypto-destinations.ts
 */
import { createSupabaseAdmin } from "../lib/supabase/admin"

const ASSETS: Array<{ code: string; name: string; networks: string[] }> = [
  { code: "USDC", name: "USD Coin", networks: ["Base", "Celo", "Ethereum", "Gnosis", "PolygonPos", "Solana", "Tron"] },
  { code: "USDT", name: "Tether USD", networks: ["Celo", "Ethereum", "PolygonPos", "Tron"] },
  { code: "BTC", name: "Bitcoin", networks: ["Bitcoin"] },
  { code: "EURC", name: "Euro Coin", networks: ["Solana"] },
  { code: "SOL", name: "Solana", networks: ["Solana"] },
  { code: "PYUSD", name: "PayPal USD", networks: ["FlowEvm", "Solana"] },
]

const DEFAULT_ROUTING = [{ provider: "noah", priority: 1, settlement_asset: "USDC" }]

async function main() {
  const admin = createSupabaseAdmin()
  const enable = process.env.SEED_CRYPTO_ENABLED === "true"

  for (const a of ASSETS) {
    const row = {
      asset_code: a.code,
      asset_name: a.name,
      networks: a.networks,
      country_code: null,
      enabled: enable,
      provider_routing: DEFAULT_ROUTING,
      sort_order: null,
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
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
