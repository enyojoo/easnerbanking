/**
 * Upsert Noah-executable fiat corridors with default provider_routing.
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/seed-payout-corridors.ts
 *
 * Set SEED_CORRIDORS_ENABLED=true to enable rows on insert.
 */
import { noahFetch } from "../lib/noah/http"
import { getNoahSettlementCryptoCurrency } from "../lib/noah/config"
import { createSupabaseAdmin } from "../lib/supabase/admin"
import { isExcludedPayoutCorridorCountry } from "../lib/payout-corridors-exclusions"
import { upsertPayoutCorridor } from "../lib/payout-corridors-upsert"

const DEFAULT_ROUTING = [{ provider: "noah", priority: 1, settlement_asset: "USDC" }]

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  NG: "Nigeria",
  KE: "Kenya",
  GH: "Ghana",
  RW: "Rwanda",
  ZA: "South Africa",
  AT: "Austria",
  BE: "Belgium",
  BG: "Bulgaria",
  CH: "Switzerland",
  CY: "Cyprus",
  CZ: "Czech Republic",
  DE: "Germany",
  DK: "Denmark",
  EE: "Estonia",
  ES: "Spain",
  FI: "Finland",
  FR: "France",
  GB: "United Kingdom",
  GR: "Greece",
  HR: "Croatia",
  HU: "Hungary",
  IE: "Ireland",
  IS: "Iceland",
  IT: "Italy",
  LI: "Liechtenstein",
  LT: "Lithuania",
  LU: "Luxembourg",
  LV: "Latvia",
  MT: "Malta",
  NL: "Netherlands",
  NO: "Norway",
  PL: "Poland",
  PT: "Portugal",
  RO: "Romania",
  SE: "Sweden",
  SI: "Slovenia",
  SK: "Slovakia",
}

const CURRENCY_NAMES: Record<string, string> = {
  USD: "US Dollar",
  EUR: "Euro",
  NGN: "Nigerian Naira",
  KES: "Kenyan Shilling",
  GHS: "Ghanaian Cedi",
  RWF: "Rwandan Franc",
  ZAR: "South African Rand",
}

async function main() {
  const settlement = getNoahSettlementCryptoCurrency()
  const enableOnInsert = process.env.SEED_CORRIDORS_ENABLED === "true"
  const admin = createSupabaseAdmin()

  const { error: deleteXxErr } = await admin.from("payout_corridors").delete().eq("country_code", "XX")
  if (deleteXxErr) console.warn("delete XX corridors:", deleteXxErr.message)
  else console.log("Removed payout_corridors rows for country_code=XX (use US for USD).")

  const countriesMap = await noahFetch<Record<string, string[]>>({
    method: "GET",
    path: "/channels/sell/countries",
  })

  const upserts: Array<Record<string, unknown>> = []

  for (const [country, fiats] of Object.entries(countriesMap)) {
    if (!Array.isArray(fiats)) continue
    for (const fiat of [...new Set(fiats.map((f) => f.toUpperCase()))]) {
      try {
        const data = await noahFetch<{ Items?: unknown[] }>({
          method: "GET",
          path: "/channels/sell",
          query: { Country: country, FiatCurrency: fiat, CryptoCurrency: settlement },
        })
        if ((data.Items ?? []).length === 0) continue

        const cc = country.toUpperCase()
        if (isExcludedPayoutCorridorCountry(cc)) continue

        const hasIdentifier = (data.Items ?? []).some(
          (x) => String((x as Record<string, unknown>).PaymentMethodCategory ?? "") === "Identifier",
        )
        const rails: Array<"bank_transfer" | "mobile_money"> = hasIdentifier
          ? ["bank_transfer", "mobile_money"]
          : ["bank_transfer"]

        for (const rail of rails) {
          upserts.push({
            rail,
            country_code: cc,
            country_name: COUNTRY_NAMES[cc] ?? cc,
            currency_code: fiat,
            currency_name: CURRENCY_NAMES[fiat] ?? fiat,
            ...(enableOnInsert ? { enabled: true } : {}),
            provider_routing: DEFAULT_ROUTING,
          })
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.warn("noah skip", country.toUpperCase(), fiat, msg)
      }
    }
  }

  console.log(`Upserting ${upserts.length} corridor rows (enabled=${enableOnInsert})…`)

  let ok = 0
  let fail = 0
  for (const row of upserts) {
    const result = await upsertPayoutCorridor(admin, row as Parameters<typeof upsertPayoutCorridor>[1])
    if (result.ok) ok++
    else {
      fail++
      console.warn("skip", row.country_code, row.currency_code, row.rail, result.error)
    }
  }
  console.log(`Upserted ${ok} rows (${fail} skipped).`)

  console.log("Done.")
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
