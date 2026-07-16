/**
 * Backfill occurred_at for Yellowcard ledger rows created without a list-sort anchor.
 *
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/backfill-yc-transaction-occurred-at.ts
 *   --dry-run   print rows only
 */
import { createClient } from "@supabase/supabase-js"

async function main() {
  const dryRun = process.argv.includes("--dry-run")
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
  if (!supabaseUrl || !serviceRoleKey) throw new Error("supabase_not_configured")

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: rows, error } = await admin
    .from("transactions")
    .select("id, created_at, occurred_at, easner_transaction_id, provider, status")
    .eq("provider", "yellowcard")
    .is("occurred_at", null)
    .order("created_at", { ascending: true })

  if (error) throw error

  let updated = 0
  for (const row of rows ?? []) {
    const createdAt = String(row.created_at ?? "").trim()
    if (!createdAt) continue
    if (dryRun) {
      console.log(JSON.stringify({ id: row.id, easner_transaction_id: row.easner_transaction_id, created_at: createdAt }))
      continue
    }
    const { error: upErr } = await admin
      .from("transactions")
      .update({ occurred_at: createdAt, updated_at: new Date().toISOString() })
      .eq("id", row.id)
    if (upErr) throw upErr
    updated += 1
  }

  console.log(JSON.stringify({ ok: true, dryRun, candidates: rows?.length ?? 0, updated }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
