#!/usr/bin/env npx tsx
/**
 * Find processed Turnkey balance deposit webhooks with no visible ledger credit and replay them.
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/reconcile-missing-turnkey-deposits.ts [--days=14] [--limit=200] [--dry-run]
 */
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { reconcileMissingTurnkeyDeposits } from "@/lib/reconciliation/reconcile-missing-turnkey-deposits"

function readArg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? (hit.split("=")[1] ?? fallback) : fallback
}

async function main() {
  const sinceDays = Number.parseInt(readArg("days", "14"), 10)
  const limit = Number.parseInt(readArg("limit", "200"), 10)
  const dryRun = process.argv.includes("--dry-run")

  const admin = createSupabaseAdmin()
  const result = await reconcileMissingTurnkeyDeposits(admin, { sinceDays, limit, dryRun })

  console.info("[reconcile-missing-turnkey-deposits]", {
    dryRun,
    sinceDays,
    limit,
    scanned: result.scanned,
    missing: result.missing,
    repaired: result.repaired,
    failed: result.failed,
  })
  for (const row of result.rows.filter((r) => r.action === "missing_ledger")) {
    console.info("missing", row)
  }
}

void main().catch((err) => {
  console.error(err)
  process.exit(1)
})
