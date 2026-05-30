/**
 * Backfill `hidden_from_feed` on historical ledger rows using the same rules as write-time upserts.
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/backfill-hidden-from-feed.ts --dry-run
 *   cd business && node --env-file=.env.local --import tsx scripts/backfill-hidden-from-feed.ts
 */
import { createSupabaseAdmin } from "../lib/supabase/admin"
import { resolveHiddenFromFeed } from "../lib/transactions/ledger-list-cursor"

const dryRun = process.argv.includes("--dry-run")
const BATCH = 500

async function main() {
  const admin = createSupabaseAdmin()
  let offset = 0
  let scanned = 0
  let tagged = 0
  let cleared = 0

  for (;;) {
    const { data: rows, error } = await admin
      .from("transactions")
      .select("id, metadata, payload, hidden_from_feed")
      .order("created_at", { ascending: true })
      .range(offset, offset + BATCH - 1)

    if (error) throw error
    if (!rows?.length) break

    for (const row of rows) {
      scanned += 1
      const shouldHide = resolveHiddenFromFeed(row.metadata, row.payload)
      const currentlyHidden = row.hidden_from_feed === true
      if (shouldHide === currentlyHidden) continue

      if (shouldHide) tagged += 1
      else cleared += 1

      if (!dryRun) {
        const { error: updErr } = await admin
          .from("transactions")
          .update({ hidden_from_feed: shouldHide })
          .eq("id", row.id)
        if (updErr) throw updErr
      }
    }

    if (rows.length < BATCH) break
    offset += BATCH
  }

  console.info(
    JSON.stringify({
      dry_run: dryRun,
      scanned,
      set_hidden: tagged,
      cleared_hidden: cleared,
    }),
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
