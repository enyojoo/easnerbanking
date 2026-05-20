/**
 * One-time cleanup: tag Turnkey inbound rows that duplicate Noah bank on-ramp settlement hashes.
 *
 * Usage:
 *   cd business && npx tsx scripts/suppress-noah-turnkey-mirror-rows.ts
 *   cd business && npx tsx scripts/suppress-noah-turnkey-mirror-rows.ts --dry-run
 */
import { config } from "dotenv"
config({ path: ".env.local" })

import { createSupabaseAdmin } from "../lib/supabase/admin"

const dryRun = process.argv.includes("--dry-run")

async function main() {
  const admin = createSupabaseAdmin()

  const { data: noahRows, error: noahErr } = await admin
    .from("transactions")
    .select("id, tx_hash, user_id, business_id, direction, metadata")
    .eq("provider", "noah")
    .not("tx_hash", "is", null)
    .limit(5000)

  if (noahErr) throw noahErr

  const hashToNoah = new Map<string, { userId: string | null; businessId: string | null }>()
  for (const row of noahRows ?? []) {
    const h = String(row.tx_hash ?? "").trim()
    if (!h) continue
    const meta = (row.metadata as Record<string, unknown> | undefined) ?? {}
    const isOnramp =
      meta.flow === "bank_onramp" ||
      meta.noah_rule_execution_id ||
      meta.noah_orchestration_settlement_leg
    if (!isOnramp && String(row.direction) !== "out") continue
    hashToNoah.set(h, {
      userId: row.user_id != null ? String(row.user_id) : null,
      businessId: row.business_id != null ? String(row.business_id) : null,
    })
  }

  const { data: turnkeyRows, error: tkErr } = await admin
    .from("transactions")
    .select("id, tx_hash, user_id, business_id, metadata")
    .eq("provider", "turnkey")
    .eq("direction", "in")
    .not("tx_hash", "is", null)
    .limit(5000)

  if (tkErr) throw tkErr

  let updated = 0
  for (const row of turnkeyRows ?? []) {
    const h = String(row.tx_hash ?? "").trim()
    if (!h || !hashToNoah.has(h)) continue

    const scope = hashToNoah.get(h)!
    const userId = row.user_id != null ? String(row.user_id) : null
    const businessId = row.business_id != null ? String(row.business_id) : null
    if (scope.businessId) {
      if (businessId !== scope.businessId) continue
    } else if (userId !== scope.userId) {
      continue
    }

    const prior = (row.metadata as Record<string, unknown> | undefined) ?? {}
    if (prior.suppress_in_feed === true && prior.noah_bank_onramp_chain_mirror === true) continue

    const meta = {
      ...prior,
      suppress_in_feed: true,
      noah_bank_onramp_chain_mirror: true,
    }

    console.log(`${dryRun ? "[dry-run] " : ""}suppress turnkey mirror id=${row.id} tx=${h.slice(0, 12)}…`)
    if (!dryRun) {
      await admin
        .from("transactions")
        .update({ metadata: meta, updated_at: new Date().toISOString() })
        .eq("id", row.id)
    }
    updated += 1
  }

  console.log(`Done. ${updated} Turnkey mirror row(s) ${dryRun ? "would be " : ""}tagged.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
