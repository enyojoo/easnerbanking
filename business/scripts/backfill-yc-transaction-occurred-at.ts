/**
 * Backfill occurred_at for Yellowcard ledger rows so list feeds sort correctly.
 *
 * 1. Rows with null occurred_at → set to created_at
 * 2. Settled fund_balance rows still anchored at quote time → bump to settled_at / completed_at
 *
 * Usage: cd business && npx tsx --env-file=.env.local scripts/backfill-yc-transaction-occurred-at.ts
 *   --dry-run   print rows only
 */
import { createClient } from "@supabase/supabase-js"

function asMeta(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
}

function pickIso(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (c == null) continue
    const s = String(c).trim()
    if (s) return s
  }
  return null
}

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
    .select("id, created_at, occurred_at, settled_at, easner_transaction_id, provider, status, metadata")
    .eq("provider", "yellowcard")
    .order("created_at", { ascending: true })

  if (error) throw error

  let updated = 0
  for (const row of rows ?? []) {
    const meta = asMeta(row.metadata)
    const isFundBalance = String(meta.yc_mode ?? "").toLowerCase() === "fund_balance"
    const status = String(row.status ?? "").toLowerCase()
    const createdAt = pickIso(row.created_at)
    const settledAt = pickIso(row.settled_at)
    const completedAt = pickIso(meta.completed_at, meta.on_chain_settled_at)
    const currentOccurred = pickIso(row.occurred_at)

    let nextOccurred: string | null = null
    if (!currentOccurred && createdAt) {
      nextOccurred = createdAt
    } else if (
      isFundBalance &&
      (status === "settled" || status === "completed") &&
      currentOccurred &&
      (settledAt || completedAt)
    ) {
      const anchor = settledAt ?? completedAt!
      if (new Date(anchor).getTime() > new Date(currentOccurred).getTime()) {
        nextOccurred = anchor
      }
    }

    if (!nextOccurred || nextOccurred === currentOccurred) continue

    if (dryRun) {
      console.log(
        JSON.stringify({
          id: row.id,
          easner_transaction_id: row.easner_transaction_id,
          from: currentOccurred,
          to: nextOccurred,
        }),
      )
      continue
    }

    const { error: upErr } = await admin
      .from("transactions")
      .update({ occurred_at: nextOccurred, updated_at: new Date().toISOString() })
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
