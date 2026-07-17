#!/usr/bin/env npx tsx
/**
 * Catch up stuck payouts when provider webhooks fail or arrive late.
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/reconcile-stuck-payouts.ts [--days=7] [--min-age-minutes=5] [--dry-run]
 */
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { reconcileStuckPayouts } from "@/lib/reconciliation/reconcile-stuck-payouts"

function readArg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? (hit.split("=")[1] ?? fallback) : fallback
}

async function main() {
  const days = Number.parseInt(readArg("days", "7"), 10)
  const minAgeMinutes = Number.parseInt(readArg("min-age-minutes", "5"), 10)
  const dryRun = process.argv.includes("--dry-run")

  const admin = createSupabaseAdmin()
  const result = await reconcileStuckPayouts(admin, {
    sinceDays: days,
    minAgeMinutes,
    dryRun,
  })

  console.info("[reconcile-stuck-payouts]", { dryRun, days, minAgeMinutes, ...result })
}

void main().catch((err) => {
  console.error(err)
  process.exit(1)
})
