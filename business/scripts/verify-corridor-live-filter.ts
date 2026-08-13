/**
 * Verify customer-facing corridor filter (RW/UG bank hidden, mobile visible).
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/verify-corridor-live-filter.ts
 */
import { createClient } from "@supabase/supabase-js"
import { isCustomerFacingFiatCorridorLive } from "@easner/shared"
import { buildSendDestinationsCatalog } from "../lib/send-destinations/build-catalog"

async function main() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
  if (!supabaseUrl || !serviceRoleKey) throw new Error("supabase_not_configured")

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data } = await admin
    .from("payout_corridors")
    .select("country_code,currency_code,rail,enabled,provider_routing,metadata")
    .eq("enabled", true)

  let orphans = 0
  for (const r of data ?? []) {
    const live = isCustomerFacingFiatCorridorLive({
      enabled: r.enabled,
      provider_routing: r.provider_routing,
      metadata: r.metadata,
    })
    if (!live) {
      orphans++
      console.log("db_orphan", r.country_code, r.rail, JSON.stringify(r.provider_routing))
    }
  }
  console.log(`db enabled=${data?.length ?? 0} orphans=${orphans}`)

  const { body } = await buildSendDestinationsCatalog({ annotateProviders: true })
  for (const cc of ["RW", "UG"]) {
    const bank = body.fiat.bank_transfer.filter((c) => c.country_code === cc)
    const mobile = body.fiat.mobile_money.filter((c) => c.country_code === cc)
    console.log(`catalog ${cc} bank=${bank.length} mobile=${mobile.length}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
