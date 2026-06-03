/**
 * Patch GH/ZA/RW bank_transfer fields_schema.processing_seconds to 50 (NG tier).
 * Usage: cd business && npx tsx scripts/patch-gh-za-processing-seconds.ts
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createSupabaseAdmin } from "../lib/supabase/admin"

/** Match `NG_BANK_ARRIVAL_PROCESSING_SECONDS` in @easner/shared (avoid barrel import in scripts). */
const NG_BANK_ARRIVAL_PROCESSING_SECONDS = 50

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
  for (const country_code of ["GH", "ZA", "RW"]) {
    const { data: rows, error } = await admin
      .from("payout_corridors")
      .select("id, fields_schema, currency_code")
      .eq("country_code", country_code)
      .eq("rail", "bank_transfer")
    if (error) throw error
    for (const row of rows ?? []) {
      const schema = (row.fields_schema as Record<string, unknown> | null) ?? {}
      const next = { ...schema, processing_seconds: NG_BANK_ARRIVAL_PROCESSING_SECONDS }
      const { error: upErr } = await admin
        .from("payout_corridors")
        .update({ fields_schema: next, updated_at: new Date().toISOString() })
        .eq("id", row.id)
      if (upErr) throw upErr
      console.log("patched", country_code, row.currency_code, row.id)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
