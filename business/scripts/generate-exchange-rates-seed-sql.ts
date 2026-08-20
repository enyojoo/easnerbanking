/**
 * Convert a Ciuna `INSERT INTO exchange_rates ...` dump into Easner seed SQL.
 *
 * Reads only the first 11 string fields per row (through updated_at); ignores
 * logistics_fee_type, bank_receive_*, cash_receive_*, etc.
 *
 * Usage:
 *   cd business
 *   npx tsx scripts/generate-exchange-rates-seed-sql.ts \
 *     scripts/data/ciuna-exchange-rates.insert.sql \
 *     supabase/migrations/20250526120000_seed_exchange_rates_ciuna.sql
 */
import { readFileSync, writeFileSync } from "node:fs"

const TUPLE_RE =
  /\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'/g

type ParsedRow = {
  from: string
  to: string
  rate: string
  feeType: string
  feeAmount: string
  minAmount: string
  maxAmount: string
  status: string
  asOf: string
}

function parseInsertValues(sql: string): ParsedRow[] {
  const valuesIdx = sql.indexOf("VALUES")
  if (valuesIdx < 0) throw new Error("No VALUES clause found")

  const body = sql.slice(valuesIdx + 6)
  const rows: ParsedRow[] = []

  let m: RegExpExecArray | null
  while ((m = TUPLE_RE.exec(body)) !== null) {
    const [
      ,
      ,
      from,
      to,
      rate,
      feeTypeRaw,
      feeAmount,
      minAmount,
      maxAmount,
      status,
      ,
      updated,
    ] = m

    let feeType = feeTypeRaw.toLowerCase()
    if (!["free", "fixed", "percentage"].includes(feeType)) feeType = "free"

    rows.push({
      from: from.toUpperCase(),
      to: to.toUpperCase(),
      rate,
      feeType,
      feeAmount,
      minAmount,
      maxAmount,
      status,
      asOf: updated,
    })
  }

  return rows
}

function escapeSqlString(s: string): string {
  return s.replace(/'/g, "''")
}

function buildSeedSql(rows: ParsedRow[]): string {
  const lines: string[] = [
    "-- Seed exchange_rates from Ciuna platform (Office Rates tab)",
    "-- Only Easner columns; no logistics_fee, bank_receive, or cash_receive.",
    "",
    "INSERT INTO public.exchange_rates (",
    "  from_currency, to_currency, rate, source, as_of,",
    "  fee_type, fee_amount, min_amount, max_amount, status, updated_at",
    ") VALUES",
  ]

  const values = rows
    .filter((r) => r.from.length === 3 && r.to.length === 3)
    .map((r) => {
      const asOf = escapeSqlString(r.asOf)
      return (
        `  ('${r.from}', '${r.to}', ${r.rate}, 'ciuna_import', '${asOf}'::timestamptz, ` +
        `'${r.feeType}', ${r.feeAmount}, ${r.minAmount}, ${r.maxAmount}, '${r.status}', '${asOf}'::timestamptz)`
      )
    })

  lines.push(values.join(",\n"))
  lines.push("ON CONFLICT (from_currency, to_currency) DO UPDATE SET")
  lines.push("  rate = EXCLUDED.rate,")
  lines.push("  fee_type = EXCLUDED.fee_type,")
  lines.push("  fee_amount = EXCLUDED.fee_amount,")
  lines.push("  min_amount = EXCLUDED.min_amount,")
  lines.push("  max_amount = EXCLUDED.max_amount,")
  lines.push("  status = EXCLUDED.status,")
  lines.push("  source = EXCLUDED.source,")
  lines.push("  as_of = EXCLUDED.as_of,")
  lines.push("  updated_at = EXCLUDED.updated_at;")

  return `${lines.join("\n")}\n`
}

function main() {
  const [input, output] = process.argv.slice(2)
  if (!input || !output) {
    console.error(
      "Usage: generate-exchange-rates-seed-sql.ts <ciuna.insert.sql> <output.sql>",
    )
    process.exit(1)
  }

  const sql = readFileSync(input, "utf8")
  const rows = parseInsertValues(sql)
  if (rows.length === 0) {
    console.error("No rows parsed – check INSERT format")
    process.exit(1)
  }

  const out = buildSeedSql(rows)
  writeFileSync(output, out)
  console.log(`Wrote ${rows.length} rows to ${output}`)
}

main()
