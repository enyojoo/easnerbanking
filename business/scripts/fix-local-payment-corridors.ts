/**
 * Align payout corridors with local payment currencies and optimized country names.
 *
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/fix-local-payment-corridors.ts
 */
import { countryDisplayName, currencyDisplayName, localPaymentCurrencyForCountry } from "@easner/shared"
import { createSupabaseAdmin } from "../lib/supabase/admin"

const LOCAL_CURRENCY_MIGRATIONS: Array<{ country: string; from: string; to: string }> = [
  { country: "DK", from: "EUR", to: "DKK" },
  { country: "GB", from: "EUR", to: "GBP" },
]

async function main() {
  const admin = createSupabaseAdmin()
  const { data: rows, error } = await admin.from("payout_corridors").select("*")
  if (error) throw error

  let currencyUpdated = 0
  let countryNameUpdated = 0

  for (const row of rows ?? []) {
    const country = String(row.country_code).trim().toUpperCase()
    const currency = String(row.currency_code).trim().toUpperCase()
    const updates: Record<string, unknown> = {}

    const migration = LOCAL_CURRENCY_MIGRATIONS.find((m) => m.country === country && m.from === currency)
    if (migration) {
      updates.currency_code = migration.to
      updates.currency_name = currencyDisplayName(migration.to)
    }

    const localCurrency = localPaymentCurrencyForCountry(country)
    if (localCurrency && currency !== localCurrency && !migration) {
      // Keep ET:ETB, LK:LKR as-is; skip non-local unless explicitly migrated above.
    }

    const optimizedName = countryDisplayName(country)
    if (optimizedName && row.country_name !== optimizedName) {
      updates.country_name = optimizedName
    }

    if (!Object.keys(updates).length) continue

    updates.updated_at = new Date().toISOString()
    const { error: upErr } = await admin.from("payout_corridors").update(updates).eq("id", row.id)
    if (upErr) {
      console.warn("update_failed", country, currency, row.rail, upErr.message)
      continue
    }
    if (updates.currency_code) currencyUpdated++
    if (updates.country_name) countryNameUpdated++
    console.log("updated", `${country}:${currency}:${row.rail}`, "→", updates)
  }

  console.log(JSON.stringify({ ok: true, currencyUpdated, countryNameUpdated }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
