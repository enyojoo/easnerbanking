/**
 * Provision payout_corridors from all live provider capabilities (Grid, YC, Noah probe).
 *
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/sync-all-provider-corridors.ts
 */
import { createClient } from "@supabase/supabase-js"
import { currencyDisplayName } from "@easner/shared"
import { syncGridPayoutCorridors } from "../lib/fx/grid-corridor-sync"
import { syncGridCorridorSchemas } from "../lib/fx/grid-schema-sync"
import { syncYcPayoutCorridors } from "../lib/fx/yc-corridor-sync"
import { hasNoahSellChannel } from "../lib/noah/channel-availability"
import { upsertPayoutCorridor } from "../lib/payout-corridors-upsert"

async function provisionNoahGaps(
  admin: ReturnType<typeof createClient>,
): Promise<{ inserted: number; skipped: number }> {
  const { data: rows } = await admin.from("payout_corridors").select("country_code,currency_code,rail")
  const existing = new Set(
    (rows ?? []).map(
      (r) =>
        `${String(r.country_code).toUpperCase()}:${String(r.currency_code).toUpperCase()}:${r.rail}`,
    ),
  )

  const probes = [
    { country: "ET", currency: "USD", rail: "bank_transfer" as const },
    { country: "LK", currency: "USD", rail: "bank_transfer" as const },
    { country: "SV", currency: "USD", rail: "bank_transfer" as const },
    { country: "SV", currency: "USD", rail: "mobile_money" as const },
  ]

  let inserted = 0
  let skipped = 0

  for (const p of probes) {
    const key = `${p.country}:${p.currency}:${p.rail}`
    if (existing.has(key)) continue
    const ok = await hasNoahSellChannel({ country: p.country, fiatCurrency: p.currency })
    if (!ok) continue

    const result = await upsertPayoutCorridor(admin, {
      rail: p.rail,
      country_code: p.country,
      country_name: p.country,
      currency_code: p.currency,
      currency_name: currencyDisplayName(p.currency),
      enabled: false,
      provider_routing: [{ provider: "noah", priority: 1, settlement_asset: "USDC" }],
      metadata: {},
    })
    if (result.ok) inserted++
    else skipped++
  }

  return { inserted, skipped }
}

async function main() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
  if (!supabaseUrl || !serviceRoleKey) throw new Error("supabase_not_configured")

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const grid = await syncGridPayoutCorridors(admin, { forceRefresh: true })
  console.log("grid_corridors", grid)

  const yc = await syncYcPayoutCorridors(admin)
  console.log("yc_corridors", yc)

  const noah = await provisionNoahGaps(admin)
  console.log("noah_gaps", noah)

  const schemas = await syncGridCorridorSchemas(admin, { forceRefresh: false })
  console.log("grid_schemas", schemas)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
