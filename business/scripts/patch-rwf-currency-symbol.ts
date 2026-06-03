/**
 * Fix Rwandan Franc display symbol in public.currencies (Intl narrow "RF" → Easner "R₣").
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/patch-rwf-currency-symbol.ts --dry-run
 *   cd business && node --env-file=.env.local --import tsx scripts/patch-rwf-currency-symbol.ts
 */
import { createSupabaseAdmin } from "../lib/supabase/admin"
import { defaultCurrencyMeta } from "../lib/admin/currency-catalog-defaults"

const CODE = "RWF"
const CANONICAL_SYMBOL = "R₣"
const LEGACY_SYMBOLS = new Set(["RF", "RWF", "Fr", "fr"])

const dryRun = process.argv.includes("--dry-run")

async function main() {
  const admin = createSupabaseAdmin()
  const meta = defaultCurrencyMeta(CODE)

  const { data: rows, error: selErr } = await admin
    .from("currencies")
    .select("id, code, name, symbol")
    .eq("code", CODE)

  if (selErr) throw selErr

  const row = (rows ?? [])[0] as { id: string; code: string; name: string; symbol: string } | undefined

  if (!row) {
    if (dryRun) {
      console.info(
        JSON.stringify({
          dry_run: true,
          action: "would_insert",
          code: CODE,
          name: meta.name,
          symbol: CANONICAL_SYMBOL,
        }),
      )
      return
    }

    const now = new Date().toISOString()
    const { data: inserted, error: insErr } = await admin
      .from("currencies")
      .insert({
        code: CODE,
        name: meta.name,
        symbol: CANONICAL_SYMBOL,
        status: "active",
        can_send: true,
        can_receive: true,
        updated_at: now,
      })
      .select("id, code, symbol")
      .single()

    if (insErr) throw insErr
    console.info(JSON.stringify({ action: "inserted", currency: inserted }))
    return
  }

  const current = String(row.symbol ?? "").trim()
  if (current === CANONICAL_SYMBOL) {
    console.info(JSON.stringify({ action: "noop", code: CODE, symbol: current }))
    return
  }

  if (!LEGACY_SYMBOLS.has(current) && current.length > 0) {
    console.warn(
      `RWF row has unexpected symbol "${current}"; updating to ${CANONICAL_SYMBOL} anyway.`,
    )
  }

  if (dryRun) {
    console.info(
      JSON.stringify({
        dry_run: true,
        action: "would_update",
        id: row.id,
        code: CODE,
        from_symbol: current || null,
        to_symbol: CANONICAL_SYMBOL,
      }),
    )
    return
  }

  const now = new Date().toISOString()
  const { data: updated, error: updErr } = await admin
    .from("currencies")
    .update({
      symbol: CANONICAL_SYMBOL,
      name: row.name?.trim() || meta.name,
      updated_at: now,
    })
    .eq("id", row.id)
    .select("id, code, symbol")
    .single()

  if (updErr) throw updErr
  console.info(
    JSON.stringify({
      action: "updated",
      from_symbol: current || null,
      currency: updated,
    }),
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
