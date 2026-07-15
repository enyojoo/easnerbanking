/**
 * Sync YC send corridors into payout_corridors.capabilities / metadata.
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/sync-yc-send-corridors.ts
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

  let channels
  try {
    channels = await listYellowcardChannels()
  } catch {
    // Fall back to committed manifest when sandbox credentials unavailable
    const manifestPath = resolve(__dirname, "../../docs/yc-payout-manifest.json")
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      corridors: Array<{
        country_code: string
        currency_code: string
        rail: string
        yc_send: boolean
        yc_receive: boolean
      }>
    }
    let updated = 0
    for (const c of manifest.corridors) {
      if (!c.yc_send) continue
      const rail = c.rail === "mobile_money" ? "mobile_money" : "bank_transfer"
      const { data: existing } = await admin
        .from("payout_corridors")
        .select("id,metadata")
        .eq("country_code", c.country_code)
        .eq("currency_code", c.currency_code)
        .eq("rail", rail)
        .maybeSingle()
      if (!existing) continue
      const metadata = {
        ...((existing.metadata as object) ?? {}),
        yc_send: true,
        yc_receive: c.yc_receive,
      }
      await admin
        .from("payout_corridors")
        .update({ metadata, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
      updated++
    }
    console.log(JSON.stringify({ ok: true, source: "manifest", updated }, null, 2))
    return
  }

  let updated = 0
  for (const ch of channels) {
    const country = String(ch.country ?? "").toUpperCase()
    const currency = String(ch.currency ?? "").toUpperCase()
    if (!country || !currency) continue
    const channelType = String(ch.channelType ?? "").toLowerCase()
    const rail = channelType.includes("momo") ? "mobile_money" : "bank_transfer"
    const ramp = String(ch.rampType ?? "").toLowerCase()
    const isSend = ramp.includes("withdraw") || ramp.includes("send") || !ramp.includes("deposit")
    if (!isSend) continue

    const { data: existing } = await admin
      .from("payout_corridors")
      .select("id,metadata")
      .eq("country_code", country)
      .eq("currency_code", currency)
      .eq("rail", rail)
      .maybeSingle()
    if (!existing) continue

    const metadata = {
      ...((existing.metadata as object) ?? {}),
      yc_send: true,
    }
    await admin
      .from("payout_corridors")
      .update({ metadata, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
    updated++
  }

  console.log(JSON.stringify({ ok: true, source: "live_channels", updated }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
