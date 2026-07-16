/**
 * Audit payout/pay-in limit coverage for Noah + Yellowcard corridors.
 *
 * Usage: cd business && npx tsx --env-file=.env.local scripts/audit-corridor-limits.ts
 */
import { createSupabaseAdmin } from "../lib/supabase/admin"
import { listYellowcardChannels } from "../lib/yellowcard/channels"
import {
  getBusinessPayoutMin,
  getYcBusinessPayoutMin,
  parsePayoutMinAmount,
  parseYcChannelPayInLimits,
  resolveYcPayInLimits,
  resolveYcPayoutLimits,
  unwrapNoahFieldsSchema,
} from "@easner/shared"

type YcChannel = {
  country?: string
  currency?: string
  channelType?: string
  rampType?: string
  type?: string
  [key: string]: unknown
}

function rail(ch: YcChannel): "bank_transfer" | "mobile_money" {
  const t = String(ch.channelType ?? "").toLowerCase()
  return t.includes("momo") || t.includes("mobile") ? "mobile_money" : "bank_transfer"
}

function ramp(ch: YcChannel): string {
  return String(ch.rampType ?? ch.type ?? "").toLowerCase()
}

async function main() {
  const admin = createSupabaseAdmin()
  const channels = await listYellowcardChannels()

  const ycSend = new Map<string, YcChannel>()
  const ycReceive = new Map<string, YcChannel>()
  for (const ch of channels) {
    const cc = String(ch.country ?? "").toUpperCase()
    const cur = String(ch.currency ?? "").toUpperCase()
    if (!cc || !cur) continue
    const key = `${cc}:${cur}:${rail(ch)}`
    const rampS = ramp(ch)
    if (rampS.includes("withdraw") || rampS.includes("send")) ycSend.set(key, ch)
    if (rampS.includes("deposit") || rampS.includes("receive")) ycReceive.set(key, ch)
  }

  const { data: corridors } = await admin
    .from("payout_corridors")
    .select("country_code,currency_code,rail,enabled,provider_routing,fields_schema,metadata")
    .order("country_code")

  type Row = {
    key: string
    enabled: boolean
    primary: string
    yc_send: boolean
    yc_receive: boolean
    yc_receive_enabled: boolean
    noah_min_schema: number | null
    noah_min_biz: number | null
    yc_payout_min: number | null
    yc_payout_biz: number | null
    yc_payin_min: number | null
    gaps: string[]
  }

  const rows: Row[] = []
  for (const c of corridors ?? []) {
    const cc = String(c.country_code).toUpperCase()
    const cur = String(c.currency_code).toUpperCase()
    const r = c.rail as "bank_transfer" | "mobile_money"
    const key = `${cc}:${cur}:${r}`
    const routing = Array.isArray(c.provider_routing)
      ? [...c.provider_routing].sort(
          (a, b) => Number(a.priority ?? 99) - Number(b.priority ?? 99),
        )
      : []
    const primary = String(routing[0]?.provider ?? "noah")
    const meta = (c.metadata ?? {}) as Record<string, unknown>
    const noahHints = unwrapNoahFieldsSchema(c.fields_schema)
    const sendCh = ycSend.get(key)
    const recvCh = ycReceive.get(key)
    const ycPayout = resolveYcPayoutLimits({
      country: cc,
      currency: cur,
      rail: r,
      channel: sendCh ?? null,
    })
    const ycPayIn = resolveYcPayInLimits({
      country: cc,
      currency: cur,
      rail: r,
      channel: recvCh ?? null,
    })

    const gaps: string[] = []
    const ycPayoutEffective = ycPayout.minLocalReceive ?? getYcBusinessPayoutMin(cur, r)
    const noahEffective =
      parsePayoutMinAmount(noahHints) ?? getBusinessPayoutMin(cur, r)

    if (sendCh && ycPayoutEffective == null) {
      gaps.push("yc_payout_min_missing")
    }
    if (primary === "noah" && noahEffective == null) {
      gaps.push("noah_payout_min_missing")
    }
    if ((recvCh || meta.yc_receive === true) && ycPayIn.minLocalPayIn == null) {
      gaps.push("yc_payin_min_missing")
    }

    rows.push({
      key,
      enabled: Boolean(c.enabled),
      primary,
      yc_send: meta.yc_send === true || Boolean(sendCh),
      yc_receive: meta.yc_receive === true || Boolean(recvCh),
      yc_receive_enabled: meta.yc_receive_enabled === true,
      noah_min_schema: parsePayoutMinAmount(noahHints),
      noah_min_biz: getBusinessPayoutMin(cur, r),
      yc_payout_min: ycPayout.minLocalReceive,
      yc_payout_biz: getYcBusinessPayoutMin(cur, r),
      yc_payin_min: ycPayIn.minLocalPayIn,
      gaps,
    })
  }

  const gapRows = rows.filter((r) => r.gaps.length > 0)
  console.log(JSON.stringify({ total: rows.length, withGaps: gapRows.length, gapRows }, null, 2))

  console.log("\n--- YC send channels without resolved payout min ---")
  for (const [key, ch] of ycSend) {
    const [cc, cur, r] = key.split(":") as [string, string, "bank_transfer" | "mobile_money"]
    const lim = resolveYcPayoutLimits({ country: cc, currency: cur, rail: r, channel: ch })
    if (lim.minLocalReceive == null && getYcBusinessPayoutMin(cur, r) == null) {
      console.log(key, parseYcChannelPayInLimits(ch))
    }
  }

  console.log("\n--- YC receive channels without resolved pay-in min ---")
  for (const [key, ch] of ycReceive) {
    const [cc, cur, r] = key.split(":") as [string, string, "bank_transfer" | "mobile_money"]
    const lim = resolveYcPayInLimits({ country: cc, currency: cur, rail: r, channel: ch })
    if (lim.minLocalPayIn == null) {
      console.log(key, parseYcChannelPayInLimits(ch))
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
