/**
 * Import Ciuna-style exchange_rates INSERT dump into Easner `exchange_rates`.
 *
 * Maps columns:
 *   from_currency, to_currency, rate, fee_type, fee_amount, min_amount, max_amount, status
 * Ignores: bank_receive_*, cash_receive_*, logistics_*
 *
 * Usage:
 *   cd business
 *   node --env-file=.env.local --import tsx scripts/import-ciuna-exchange-rates.ts path/to/ciuna.insert.sql
 */
import { readFileSync } from "node:fs"
import { createSupabaseAdmin } from "../lib/supabase/admin"
import {
  mapLegacyExchangeRateRow,
  seedExchangeRatesFromLegacyRows,
  type ExchangeRateUpsertRow,
} from "../lib/admin/rates-service"

function parseInsertValues(sql: string): ExchangeRateUpsertRow[] {
  const rows: ExchangeRateUpsertRow[] = []
  const valuesIdx = sql.indexOf("VALUES")
  if (valuesIdx < 0) throw new Error("No VALUES clause found")

  const body = sql.slice(valuesIdx + 6)
  const tupleRe = /\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'/g

  let m: RegExpExecArray | null
  while ((m = tupleRe.exec(body)) !== null) {
    const [
      ,
      _id,
      from_currency,
      to_currency,
      rate,
      fee_type,
      fee_amount,
      min_amount,
      max_amount,
      status,
    ] = m

    rows.push(
      mapLegacyExchangeRateRow({
        from_currency,
        to_currency,
        rate,
        fee_type,
        fee_amount,
        min_amount,
        max_amount,
        status,
      }),
    )
  }

  return rows
}

async function main() {
  const file = process.argv[2]
  if (!file) {
    console.error("Usage: import-ciuna-exchange-rates.ts <path-to-insert.sql>")
    process.exit(1)
  }

  const sql = readFileSync(file, "utf8")
  const rows = parseInsertValues(sql)
  if (rows.length === 0) {
    console.error("No rows parsed — check INSERT format")
    process.exit(1)
  }

  console.log(`Parsed ${rows.length} rate rows`)
  const admin = createSupabaseAdmin()
  await seedExchangeRatesFromLegacyRows(admin, rows, { source: "ciuna_import" })
  console.log("Upsert complete")
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
