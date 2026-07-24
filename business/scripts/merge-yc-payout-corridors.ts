/**
 * Merge YC manifest corridors into payout_corridors (union with Noah seed).
 * - Inserts missing YC-only rows
 * - Sets default provider_routing (YC locked for YC-only; Noah for Noah-only overlap)
 * - Writes metadata.yc_send / yc_receive_enabled from manifest
 *
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/merge-yc-payout-corridors.ts
 */
import { readFileSync } from "fs"
import { resolve } from "path"
import { createClient } from "@supabase/supabase-js"
import { upsertPayoutCorridor } from "../lib/payout-corridors-upsert"

const COUNTRY_NAMES: Record<string, string> = {
  AR: "Argentina",
  BF: "Burkina Faso",
  BJ: "Benin",
  BR: "Brazil",
  BW: "Botswana",
  CD: "DR Congo",
  CI: "Côte d'Ivoire",
  CL: "Chile",
  CM: "Cameroon",
  CO: "Colombia",
  GB: "United Kingdom",
  GH: "Ghana",
  KE: "Kenya",
  KH: "Cambodia",
  LK: "Sri Lanka",
  ML: "Mali",
  MX: "Mexico",
  MW: "Malawi",
  NG: "Nigeria",
  PE: "Peru",
  RW: "Rwanda",
  SN: "Senegal",
  TG: "Togo",
  TZ: "Tanzania",
  UG: "Uganda",
  ZA: "South Africa",
  ZM: "Zambia",
}

const CURRENCY_NAMES: Record<string, string> = {
  ARS: "Argentine Peso",
  BRL: "Brazilian Real",
  BWP: "Botswana Pula",
  CDF: "Congolese Franc",
  CLP: "Chilean Peso",
  COP: "Colombian Peso",
  EUR: "Euro",
  GBP: "British Pound",
  GHS: "Ghanaian Cedi",
  IDR: "Indonesian Rupiah",
  KES: "Kenyan Shilling",
  LKR: "Sri Lankan Rupee",
  MXN: "Mexican Peso",
  NGN: "Nigerian Naira",
  PEN: "Peruvian Sol",
  RWF: "Rwandan Franc",
  TZS: "Tanzanian Shilling",
  UGX: "Ugandan Shilling",
  USD: "US Dollar",
  XOF: "West African CFA Franc",
  ZAR: "South African Rand",
  ZMW: "Zambian Kwacha",
}

type ManifestCorridor = {
  country_code: string
  currency_code: string
  rail: string
  yc_send: boolean
  yc_receive: boolean
  noah_sell?: boolean
}

function railOf(raw: string): "bank_transfer" | "mobile_money" {
  return raw === "mobile_money" ? "mobile_money" : "bank_transfer"
}

function ycRouting() {
  return [{ provider: "yellowcard", priority: 1, settlement_asset: "USDC" }]
}

async function main() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
  if (!supabaseUrl || !serviceRoleKey) throw new Error("supabase_not_configured")

  const manifestPath = resolve(__dirname, "../../docs/yc-payout-manifest.json")
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    corridors: ManifestCorridor[]
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let inserted = 0
  let updated = 0
  let routingSetYc = 0

  for (const c of manifest.corridors) {
    if (!c.yc_send && !c.yc_receive) continue
    const cc = c.country_code.toUpperCase()
    const cur = c.currency_code.toUpperCase()
    const rail = railOf(c.rail)
    const ycOnly = Boolean(c.yc_send && !c.noah_sell)

    const { data: existing } = await admin
      .from("payout_corridors")
      .select("id,metadata,provider_routing")
      .eq("country_code", cc)
      .eq("currency_code", cur)
      .eq("rail", rail)
      .maybeSingle()

    const metadata = {
      ...((existing?.metadata as object) ?? {}),
      ...(c.yc_send ? { yc_send: true } : {}),
      ...(c.yc_receive ? { yc_receive: true } : {}),
      yc_only: ycOnly,
    }

    if (!existing) {
      const result = await upsertPayoutCorridor(admin, {
        rail,
        country_code: cc,
        country_name: COUNTRY_NAMES[cc] ?? cc,
        currency_code: cur,
        currency_name: CURRENCY_NAMES[cur] ?? cur,
        enabled: false,
        provider_routing: ycOnly ? ycRouting() : [{ provider: "noah", priority: 1, settlement_asset: "USDC" }],
        metadata,
      })
      if (result.ok) inserted++
      else console.warn("insert skip", cc, cur, rail, result.error)
      continue
    }

    const updates: Record<string, unknown> = {
      metadata,
      updated_at: new Date().toISOString(),
    }

    if (ycOnly) {
      updates.provider_routing = ycRouting()
      routingSetYc++
    }

    const { error } = await admin.from("payout_corridors").update(updates).eq("id", existing.id)
    if (error) console.warn("update fail", cc, cur, rail, error.message)
    else updated++
  }

  console.log(JSON.stringify({ ok: true, inserted, updated, routingSetYc }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
