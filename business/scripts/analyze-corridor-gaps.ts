import { createSupabaseAdmin } from "../lib/supabase/admin"
import { listYellowcardChannels } from "../lib/yellowcard/channels"
import {
  getBusinessPayoutMin,
  getYcBusinessPayoutMin,
  parsePayoutMinAmount,
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

  const { data: corridors } = await admin.from("payout_corridors").select("*").order("country_code")

  const gaps: string[] = []
  const noahMissingCurrencies = new Set<string>()
  const ycPayoutMissingKeys: string[] = []
  const ycPayinMissingKeys: string[] = []

  for (const c of corridors ?? []) {
    const cc = String(c.country_code).toUpperCase()
    const cur = String(c.currency_code).toUpperCase()
    const r = c.rail as "bank_transfer" | "mobile_money"
    const key = `${cc}:${cur}:${r}`
    const routing = [...(c.provider_routing ?? [])].sort(
      (a, b) => Number(a.priority ?? 99) - Number(b.priority ?? 99),
    )
    const primary = String(routing[0]?.provider ?? "noah")
    const meta = (c.metadata ?? {}) as Record<string, unknown>
    const hints = unwrapNoahFieldsSchema(c.fields_schema)
    const sendCh = ycSend.get(key)
    const recvCh = ycRecv.get(key)
    const ycP = resolveYcPayoutLimits({
      country: cc,
      currency: cur,
      rail: r,
      channel: ycSend.get(key) ?? null,
    })
    const ycI = resolveYcPayInLimits({
      country: cc,
      currency: cur,
      rail: r,
      channel: ycRecv.get(key) ?? null,
    })
    const noahEff = parsePayoutMinAmount(hints) ?? getBusinessPayoutMin(cur, r)
    const ycPayoutEff = ycP.minLocalReceive ?? getYcBusinessPayoutMin(cur, r)

    if (sendCh && ycPayoutEff == null) {
      gaps.push(`${key} yc_payout`)
      ycPayoutMissingKeys.push(key)
    }
    if (primary === "noah" && noahEff == null) {
      gaps.push(`${key} noah_payout`)
      noahMissingCurrencies.add(cur)
    }
    if ((recvCh || meta.yc_receive === true) && ycI.minLocalPayIn == null) {
      gaps.push(`${key} yc_payin`)
      ycPayinMissingKeys.push(key)
    }
  }

  console.log("GAPS", gaps.length)
  gaps.forEach((g) => console.log(g))
  console.log("\nNOAH MISSING CURRENCIES:", [...noahMissingCurrencies].sort().join(", "))
  console.log("\nYC SEND NO MIN (channel):")
  for (const [key, ch] of ycSend) {
    const [cc, cur, r] = key.split(":") as [string, string, "bank_transfer" | "mobile_money"]
    const lim = resolveYcPayoutLimits({ country: cc, currency: cur, rail: r, channel: ch })
    if (lim.minLocalReceive == null && getYcBusinessPayoutMin(cur, r) == null) console.log(key)
  }
  console.log("\nYC RECV NO MIN (channel):")
  for (const [key, ch] of ycRecv) {
    const [cc, cur, r] = key.split(":") as [string, string, "bank_transfer" | "mobile_money"]
    const lim = resolveYcPayInLimits({ country: cc, currency: cur, rail: r, channel: ch })
    if (lim.minLocalPayIn == null) console.log(key)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
