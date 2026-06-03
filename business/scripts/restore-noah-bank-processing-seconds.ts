/**
 * Restore bank_transfer processing_seconds from Noah for African bank corridors.
 * Use after a mistaken fast-bank patch (e.g. legacy patch-gh-za-processing-seconds).
 *
 * Usage: cd business && npx tsx scripts/restore-noah-bank-processing-seconds.ts
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createSupabaseAdmin } from "../lib/supabase/admin"
import { getNoahSettlementCryptoCurrency } from "../lib/noah/config"
import { fetchSellChannelItems } from "../lib/noah/payout-prepare"
import { normalizeFormSchemaHints, pickChannelForRail } from "../lib/noah/form-schema-hints"

const NOAH_BANK_ONE_BUSINESS_DAY_SECONDS = 86400

function loadEnvLocal() {
  const path = resolve(__dirname, "../.env.local")
  const raw = readFileSync(path, "utf8")
  for (const line of raw.split("\n")) {
    const t = line.trim()
    if (!t || t.startsWith("#")) continue
    const i = t.indexOf("=")
    if (i < 1) continue
    const key = t.slice(0, i)
    let val = t.slice(i + 1)
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}

async function main() {
  loadEnvLocal()
  const admin = createSupabaseAdmin()
  const settlement = getNoahSettlementCryptoCurrency()

  const pairs = [
    { country_code: "NG", currency_code: "NGN" },
    { country_code: "GH", currency_code: "GHS" },
    { country_code: "RW", currency_code: "RWF" },
    { country_code: "KE", currency_code: "KES" },
    { country_code: "ZA", currency_code: "ZAR" },
  ] as const

  for (const { country_code, currency_code } of pairs) {
    let seconds = NOAH_BANK_ONE_BUSINESS_DAY_SECONDS
    try {
      const items = await fetchSellChannelItems({
        country: country_code,
        fiatCurrency: currency_code,
        cryptoCurrency: settlement,
      })
      const pick = pickChannelForRail(items, "bank_transfer")
      if (pick) {
        const hints = normalizeFormSchemaHints(pick)
        if (typeof hints.processing_seconds === "number") seconds = hints.processing_seconds
      }
    } catch (e) {
      console.warn("noah fetch failed, using 86400", country_code, currency_code, e)
    }

    const { data: rows, error } = await admin
      .from("payout_corridors")
      .select("id, fields_schema")
      .eq("country_code", country_code)
      .eq("currency_code", currency_code)
      .eq("rail", "bank_transfer")
    if (error) throw error
    for (const row of rows ?? []) {
      const schema = (row.fields_schema as Record<string, unknown> | null) ?? {}
      const next = { ...schema, processing_seconds: seconds }
      const { error: upErr } = await admin
        .from("payout_corridors")
        .update({ fields_schema: next, updated_at: new Date().toISOString() })
        .eq("id", row.id)
      if (upErr) throw upErr
      console.log("restored", country_code, currency_code, "bank_transfer", seconds, row.id)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
