/**
 * Sync YC receive flags onto payout_corridors.metadata.
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/sync-yc-receive-corridors.ts
 */
import { createClient } from "@supabase/supabase-js"
import { listYellowcardChannels } from "../lib/yellowcard/channels"
import { readFileSync } from "fs"
import { resolve } from "path"

async function main() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
  if (!supabaseUrl || !serviceRoleKey) throw new Error("supabase_not_configured")

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let pairs: Array<{ country: string; currency: string; rail: string }> = []
  try {
    const channels = await listYellowcardChannels()
    for (const ch of channels) {
      const country = String(ch.country ?? "").toUpperCase()
      const currency = String(ch.currency ?? "").toUpperCase()
      if (!country || !currency) continue
      const ramp = String(ch.rampType ?? "").toLowerCase()
      if (ramp.includes("withdraw") || ramp.includes("send")) continue
      const channelType = String(ch.channelType ?? "").toLowerCase()
      const rail = channelType.includes("momo") ? "mobile_money" : "bank_transfer"
      pairs.push({ country, currency, rail })
    }
  } catch {
    const manifestPath = resolve(__dirname, "../../docs/yc-payout-manifest.json")
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      corridors: Array<{
        country_code: string
        currency_code: string
        rail: string
        yc_receive: boolean
      }>
    }
    pairs = manifest.corridors
      .filter((c) => c.yc_receive)
      .map((c) => ({
        country: c.country_code,
        currency: c.currency_code,
        rail: c.rail === "mobile_money" ? "mobile_money" : "bank_transfer",
      }))
  }

  let updated = 0
  for (const p of pairs) {
    const { data: existing } = await admin
      .from("payout_corridors")
      .select("id,metadata")
      .eq("country_code", p.country)
      .eq("currency_code", p.currency)
      .eq("rail", p.rail)
      .maybeSingle()
    if (!existing) continue
    const metadata = {
      ...((existing.metadata as object) ?? {}),
      yc_receive: true,
    }
    await admin
      .from("payout_corridors")
      .update({ metadata, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
    updated++
  }

  console.log(JSON.stringify({ ok: true, updated }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
