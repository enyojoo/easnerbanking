/**
 * Sync Noah FormSchema hints into payout_corridors.fields_schema.
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/apply-payout-corridor-schemas.ts
 *
 * Optional: APPLY_SCHEMAS_ENABLE=true to enable corridors that gain Noah channels.
 */
import { createSupabaseAdmin } from "../lib/supabase/admin"
import { noahFetch } from "../lib/noah/http"
import { fetchSellChannelItems, getNoahSettlementCryptoCurrency } from "../lib/noah/payout-prepare"
import {
  mobileProviderLabelsFromSellItems,
  normalizeFormSchemaHints,
  pickChannelForRail,
} from "../lib/noah/form-schema-hints"
import { isExcludedPayoutCorridorCountry } from "../lib/payout-corridors-exclusions"
import { upsertPayoutCorridor } from "../lib/payout-corridors-upsert"

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  CA: "Canada",
  NG: "Nigeria",
  KE: "Kenya",
  GH: "Ghana",
  RW: "Rwanda",
  ZA: "South Africa",
  GB: "United Kingdom",
  DE: "Germany",
  FR: "France",
}

const CURRENCY_NAMES: Record<string, string> = {
  USD: "US Dollar",
  CAD: "Canadian Dollar",
  EUR: "Euro",
  GBP: "British Pound",
  NGN: "Nigerian Naira",
  KES: "Kenyan Shilling",
  GHS: "Ghanaian Cedi",
  RWF: "Rwandan Franc",
  ZAR: "South African Rand",
}

async function main() {
  const settlement = getNoahSettlementCryptoCurrency()
  const enableCorridors = process.env.APPLY_SCHEMAS_ENABLE === "true"
  const admin = createSupabaseAdmin()

  const countriesMap = await noahFetch<Record<string, string[]>>({
    method: "GET",
    path: "/channels/sell/countries",
  })

  let updated = 0
  let inserted = 0

  for (const [country, fiats] of Object.entries(countriesMap)) {
    if (!Array.isArray(fiats)) continue
    const cc = country.toUpperCase()
    if (isExcludedPayoutCorridorCountry(cc)) continue

    for (const fiat of [...new Set(fiats.map((f) => f.toUpperCase()))]) {
      let items
      try {
        items = await fetchSellChannelItems({
          country: cc,
          fiatCurrency: fiat,
          cryptoCurrency: settlement,
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.warn("noah skip", cc, fiat, msg)
        continue
      }
      if (items.length === 0) continue

      const hasIdentifier = items.some(
        (x) => String(x.PaymentMethodCategory ?? "") === "Identifier",
      )
      const rails: Array<"bank_transfer" | "mobile_money"> = hasIdentifier
        ? ["bank_transfer", "mobile_money"]
        : ["bank_transfer"]

      for (const rail of rails) {
        const pick = pickChannelForRail(items, rail)
        if (!pick?.FormSchema) continue
        const fields_schema = normalizeFormSchemaHints(pick)
        const mobileLabels =
          rail === "mobile_money" ? mobileProviderLabelsFromSellItems(items, cc) : []
        if (mobileLabels.length > 0) {
          fields_schema.mobile_provider_labels = mobileLabels
        }

        const { data: existing } = await admin
          .from("payout_corridors")
          .select("id")
          .eq("rail", rail)
          .eq("country_code", cc)
          .eq("currency_code", fiat)
          .maybeSingle()

        if (existing?.id) {
          const { error } = await admin
            .from("payout_corridors")
            .update({
              fields_schema: fields_schema,
              ...(rail === "mobile_money" && mobileLabels.length > 0
                ? { providers: mobileLabels }
                : {}),
              ...(enableCorridors ? { enabled: true } : {}),
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id)
          if (error) console.warn("update", cc, fiat, rail, error.message)
          else updated++
        } else {
          const res = await upsertPayoutCorridor(admin, {
            rail,
            country_code: cc,
            country_name: COUNTRY_NAMES[cc] ?? cc,
            currency_code: fiat,
            currency_name: CURRENCY_NAMES[fiat] ?? fiat,
            enabled: enableCorridors,
            provider_routing: [{ provider: "noah", priority: 1, settlement_asset: "USDC" }],
            providers: rail === "mobile_money" ? mobileLabels : null,
          })
          if (res.ok) {
            const { data: row } = await admin
              .from("payout_corridors")
              .select("id")
              .eq("rail", rail)
              .eq("country_code", cc)
              .eq("currency_code", fiat)
              .maybeSingle()
            if (row?.id) {
              await admin
                .from("payout_corridors")
                .update({
                  fields_schema: fields_schema,
                  ...(rail === "mobile_money" && mobileLabels.length > 0
                    ? { providers: mobileLabels }
                    : {}),
                  ...(enableCorridors ? { enabled: true } : {}),
                })
                .eq("id", row.id)
            }
            inserted++
          }
        }
      }
    }
  }

  console.log(`fields_schema sync done. updated=${updated} inserted=${inserted}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
