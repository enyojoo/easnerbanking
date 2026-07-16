import { createSupabaseAdmin } from "../lib/supabase/admin"
import { listYellowcardChannels } from "../lib/yellowcard/channels"
import {
  resolveEffectivePayoutMin,
  resolvePrimaryPayoutProvider,
  resolveYcPayInLimits,
  resolveYcPayoutLimits,
  unwrapNoahFieldsSchema,
} from "@easner/shared"

async function main() {
  const admin = createSupabaseAdmin()
  const channels = await listYellowcardChannels()

  function rail(ch: { channelType?: string }) {
    const t = String(ch.channelType ?? "").toLowerCase()
    return t.includes("momo") || t.includes("mobile") ? "mobile_money" : "bank_transfer"
  }
  function ramp(ch: { rampType?: string; type?: string }) {
    return String(ch.rampType ?? ch.type ?? "").toLowerCase()
  }

  const ycSend = new Map<string, Record<string, unknown>>()
  const ycRecv = new Map<string, Record<string, unknown>>()
  for (const ch of channels) {
    const cc = String(ch.country ?? "").toUpperCase()
    const cur = String(ch.currency ?? "").toUpperCase()
    if (!cc || !cur) continue
    const key = `${cc}:${cur}:${rail(ch)}`
    const r = ramp(ch)
    if (r.includes("withdraw") || r.includes("send")) ycSend.set(key, ch as Record<string, unknown>)
    if (r.includes("deposit") || r.includes("receive")) ycRecv.set(key, ch as Record<string, unknown>)
  }

  const { data } = await admin
    .from("payout_corridors")
    .select("country_code,currency_code,rail,provider_routing,fields_schema,metadata")
    .eq("enabled", true)
    .order("country_code")

  const rows = []
  for (const c of data ?? []) {
    const cc = String(c.country_code).toUpperCase()
    const cur = String(c.currency_code).toUpperCase()
    const r = c.rail as "bank_transfer" | "mobile_money"
    const key = `${cc}:${cur}:${r}`
    const routing = [...(c.provider_routing ?? [])].sort(
      (a, b) => Number(a.priority ?? 99) - Number(b.priority ?? 99),
    )
    const primary = resolvePrimaryPayoutProvider(routing)
    const hints = unwrapNoahFieldsSchema(c.fields_schema)
    const meta = (c.metadata ?? {}) as Record<string, unknown>
    rows.push({
      key,
      primary,
      noah_payout_min: resolveEffectivePayoutMin({ hints, currencyCode: cur, rail: r }),
      yc_payout_min: resolveYcPayoutLimits({
        country: cc,
        currency: cur,
        rail: r,
        channel: ycSend.get(key) ?? null,
      }).minLocalReceive,
      yc_payin_min: resolveYcPayInLimits({
        country: cc,
        currency: cur,
        rail: r,
        channel: ycRecv.get(key) ?? null,
      }).minLocalPayIn,
      yc_receive_enabled: meta.yc_receive_enabled === true,
    })
  }

  console.log(JSON.stringify(rows, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
