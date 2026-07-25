/**
 * Full provider limit audit: Noah, Yellowcard, Grid pay-in + payout mins/maxes.
 *
 * Usage: cd business && npx tsx --env-file=.env.local scripts/audit-provider-limits.ts
 */
import { createSupabaseAdmin } from "../lib/supabase/admin"
import { listYellowcardChannels } from "../lib/yellowcard/channels"
import {
  getBusinessPayoutMin,
  getYcBusinessPayInMin,
  getYcBusinessPayoutMin,
  parsePayoutMinAmount,
  resolveEffectivePayoutMin,
  resolveGridPayInLimits,
  resolveGridPayoutLimits,
  resolvePayInProvider,
  resolvePrimaryPayoutProvider,
  resolveYcPayInLimits,
  resolveYcPayoutLimits,
  unwrapNoahFieldsSchema,
  type PayoutRail,
} from "@easner/shared"

type YcChannel = {
  country?: string
  currency?: string
  channelType?: string
  rampType?: string
  type?: string
  [key: string]: unknown
}

function rail(ch: YcChannel): PayoutRail {
  const t = String(ch.channelType ?? "").toLowerCase()
  return t.includes("momo") || t.includes("mobile") ? "mobile_money" : "bank_transfer"
}

function ramp(ch: YcChannel): string {
  return String(ch.rampType ?? ch.type ?? "").toLowerCase()
}

function parseMax(hints: ReturnType<typeof unwrapNoahFieldsSchema>): number | null {
  const raw = hints?.limits?.max
  if (raw == null || String(raw).trim() === "") return null
  const n = Number.parseFloat(String(raw).replace(/,/g, ""))
  return Number.isFinite(n) && n > 0 ? n : null
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
    const r = ramp(ch)
    if (r.includes("withdraw") || r.includes("send")) ycSend.set(key, ch)
    if (r.includes("deposit") || r.includes("receive")) ycReceive.set(key, ch)
  }

  const { data: corridors } = await admin
    .from("payout_corridors")
    .select("country_code,currency_code,rail,enabled,provider_routing,fields_schema,metadata")
    .order("country_code")

  type AuditRow = {
    key: string
    enabled: boolean
    payout_primary: string
    pay_in_provider: string
    noah_payout_min: number | null
    noah_payout_max: number | null
    yc_payout_min: number | null
    yc_payout_max: number | null
    grid_payout_min: number | null
    grid_payout_max: number | null
    yc_payin_min: number | null
    yc_payin_max: number | null
    grid_payin_min: number | null
    grid_payin_max: number | null
    gaps: string[]
  }

  const rows: AuditRow[] = []

  for (const c of corridors ?? []) {
    const cc = String(c.country_code).toUpperCase()
    const cur = String(c.currency_code).toUpperCase()
    const r = c.rail as PayoutRail
    const key = `${cc}:${cur}:${r}`
    const routing = Array.isArray(c.provider_routing)
      ? [...c.provider_routing].sort(
          (a, b) => Number(a.priority ?? 99) - Number(b.priority ?? 99),
        )
      : []
    const payoutPrimary = resolvePrimaryPayoutProvider(routing)
    const meta = (c.metadata ?? {}) as Record<string, unknown>
    const payInProvider = resolvePayInProvider({ providerRouting: routing, metadata: meta })
    const noahHints = unwrapNoahFieldsSchema(c.fields_schema)

    const ycPayout = resolveYcPayoutLimits({
      country: cc,
      currency: cur,
      rail: r,
      channel: ycSend.get(key) ?? null,
    })
    const ycPayIn = resolveYcPayInLimits({
      country: cc,
      currency: cur,
      rail: r,
      channel: ycReceive.get(key) ?? null,
    })
    const gridPayout = resolveGridPayoutLimits({ country: cc, currency: cur, rail: r })
    const gridPayIn = resolveGridPayInLimits({ country: cc, currency: cur, rail: r })

    const noahPayoutMin = resolveEffectivePayoutMin({
      hints: noahHints,
      currencyCode: cur,
      rail: r,
    })
    const noahPayoutMax = parseMax(noahHints)

    const gaps: string[] = []

    if (payoutPrimary === "noah" && noahPayoutMin == null) {
      gaps.push("noah_payout_min_missing")
    }
    if (payoutPrimary === "noah" && noahPayoutMax == null) {
      gaps.push("noah_payout_max_missing")
    }
    if (payoutPrimary === "yellowcard" && ycPayout.minLocalReceive == null) {
      gaps.push("yc_payout_min_missing")
    }
    if (payoutPrimary === "yellowcard" && ycPayout.maxLocalReceive == null) {
      gaps.push("yc_payout_max_missing")
    }
    if (payoutPrimary === "grid" && gridPayout.minLocalReceive == null) {
      gaps.push("grid_payout_min_missing")
    }
    if (payoutPrimary === "grid" && gridPayout.maxLocalReceive == null) {
      gaps.push("grid_payout_max_missing")
    }

    if (payInProvider === "yellowcard" && ycPayIn.minLocalPayIn == null) {
      gaps.push("yc_payin_min_missing")
    }
    if (payInProvider === "yellowcard" && ycPayIn.maxLocalPayIn == null) {
      gaps.push("yc_payin_max_missing")
    }
    if (payInProvider === "grid" && gridPayIn.minLocalPayIn == null) {
      gaps.push("grid_payin_min_missing")
    }
    if (payInProvider === "grid" && gridPayIn.maxLocalPayIn == null) {
      gaps.push("grid_payin_max_missing")
    }
    if (payInProvider === "noah" && noahPayoutMin == null) {
      gaps.push("noah_payin_min_missing")
    }
    if (payInProvider === "noah" && noahPayoutMax == null) {
      gaps.push("noah_payin_max_missing")
    }

    const ycReceiveOn = meta.yc_receive_enabled === true || meta.yc_receive === true
    const gridReceiveOn = meta.grid_receive_enabled === true || meta.grid_receive === true
    if (ycReceiveOn && payInProvider !== "yellowcard" && payInProvider !== "noah") {
      if (payInProvider !== "grid" && gridReceiveOn) {
        gaps.push("payin_provider_mismatch_yc_flag")
      }
    }
    if (gridReceiveOn && payInProvider !== "grid" && !ycReceiveOn) {
      gaps.push("payin_provider_mismatch_grid_flag")
    }
    if (
      payoutPrimary === "grid" &&
      routing.some((e) => e.provider === "yellowcard") &&
      !routing.some((e) => e.provider === "grid")
    ) {
      gaps.push("payout_routing_grid_primary_but_no_grid_entry")
    }

    rows.push({
      key,
      enabled: Boolean(c.enabled),
      payout_primary: payoutPrimary,
      pay_in_provider: payInProvider,
      noah_payout_min: noahPayoutMin,
      noah_payout_max: noahPayoutMax,
      yc_payout_min: ycPayout.minLocalReceive,
      yc_payout_max: ycPayout.maxLocalReceive,
      grid_payout_min: gridPayout.minLocalReceive,
      grid_payout_max: gridPayout.maxLocalReceive,
      yc_payin_min: ycPayIn.minLocalPayIn,
      yc_payin_max: ycPayIn.maxLocalPayIn,
      grid_payin_min: gridPayIn.minLocalPayIn,
      grid_payin_max: gridPayIn.maxLocalPayIn,
      gaps,
    })
  }

  const enabled = rows.filter((r) => r.enabled)
  const enabledWithGaps = enabled.filter((r) => r.gaps.length > 0)
  const gapCounts = new Map<string, number>()
  for (const r of enabledWithGaps) {
    for (const g of r.gaps) {
      gapCounts.set(g, (gapCounts.get(g) ?? 0) + 1)
    }
  }

  console.log(
    JSON.stringify(
      {
        summary: {
          total_corridors: rows.length,
          enabled_corridors: enabled.length,
          enabled_with_gaps: enabledWithGaps.length,
          gap_type_counts: Object.fromEntries([...gapCounts.entries()].sort((a, b) => b[1] - a[1])),
          by_payout_primary: Object.fromEntries(
            [...new Set(enabled.map((r) => r.payout_primary))].map((p) => [
              p,
              enabled.filter((r) => r.payout_primary === p).length,
            ]),
          ),
          by_pay_in_provider: Object.fromEntries(
            [...new Set(enabled.map((r) => r.pay_in_provider))].map((p) => [
              p,
              enabled.filter((r) => r.pay_in_provider === p).length,
            ]),
          ),
        },
        enabled_with_gaps: enabledWithGaps,
        enabled_all: enabled,
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
