/**
 * Diagnose fiat admin rows that show all dashes (no provider capability).
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/diagnose-fiat-admin-gaps.ts
 */
import { createSupabaseAdmin } from "../lib/supabase/admin"
import { annotateAdminCorridorsWithProviderHealth } from "../lib/admin/annotate-payout-corridors"
import {
  corridorHasRailCapability,
  isZombiePayoutCorridor,
  zombieCorridorKey,
} from "../lib/admin/corridor-rail-capability"

function rowMetadata(row: { metadata?: unknown }) {
  return (row.metadata ?? {}) as Record<string, unknown>
}

type Row = Awaited<ReturnType<typeof annotateAdminCorridorsWithProviderHealth>>[number]

function rowSupportsNoahPayout(row: Row) {
  return row.noah_sell_available === true
}

function rowSupportsYcPayout(row: Row) {
  const meta = rowMetadata(row)
  return meta.yc_send === true || row.yc_send_available === true
}

function rowSupportsGridPayout(row: Row) {
  const meta = rowMetadata(row)
  return meta.grid_send === true || row.grid_send_available === true
}

function rowSupportsYcPayIn(row: Row) {
  const meta = rowMetadata(row)
  return meta.yc_receive === true || row.yc_receive_available === true
}

function rowSupportsGridPayIn(row: Row) {
  const meta = rowMetadata(row)
  return meta.grid_receive === true || row.grid_receive_available === true
}

function rowSupportsNoahPayIn(row: Row) {
  return rowMetadata(row).noah_receive === true
}

function showsBadge(row: Row) {
  const meta = rowMetadata(row)
  return (
    row.noah_sell_available === true ||
    meta.noah_receive === true ||
    row.yc_send_available === true ||
    row.yc_receive_available === true ||
    meta.yc_send === true ||
    meta.yc_receive === true ||
    row.grid_send_available === true ||
    row.grid_receive_available === true ||
    meta.grid_send === true ||
    meta.grid_receive === true
  )
}

function hasAnyPayout(row: Row) {
  return rowSupportsNoahPayout(row) || rowSupportsYcPayout(row) || rowSupportsGridPayout(row)
}

function hasAnyPayIn(row: Row) {
  return rowSupportsNoahPayIn(row) || rowSupportsYcPayIn(row) || rowSupportsGridPayIn(row)
}

async function main() {
  const admin = createSupabaseAdmin()
  const { data: rows } = await admin.from("payout_corridors").select("*").order("country_name")
  const annotated = await annotateAdminCorridorsWithProviderHealth(rows ?? [])

  const byRail = { bank_transfer: [] as typeof annotated, mobile_money: [] as typeof annotated }
  for (const r of annotated) {
    const rail = r.rail === "mobile_money" ? "mobile_money" : "bank_transfer"
    byRail[rail].push(r)
  }

  const zombies = annotated.filter((r) => isZombiePayoutCorridor(r))
  console.log(`\n=== ZOMBIE / EXCLUDED DELETE CANDIDATES: ${zombies.length} ===`)
  for (const r of zombies) {
    console.log(`  ${zombieCorridorKey(r)} id=${r.id}`)
  }

  for (const rail of ["bank_transfer", "mobile_money"] as const) {
    const visible = byRail[rail].filter((r) => corridorHasRailCapability(r))
    const hidden = byRail[rail].filter((r) => !corridorHasRailCapability(r))
    const dashOnlyVisible = visible.filter((r) => !showsBadge(r) && !hasAnyPayout(r) && !hasAnyPayIn(r))

    console.log(`\n=== ${rail} ===`)
    console.log(`  total DB rows: ${byRail[rail].length}`)
    console.log(`  visible after capability filter: ${visible.length}`)
    console.log(`  hidden by filter: ${hidden.length}`)
    console.log(`  visible but no badge/payout/payin: ${dashOnlyVisible.length}`)

    const empty = byRail[rail].filter((r) => !showsBadge(r))
    console.log(`  rows with NO provider badge (all DB): ${empty.length}/${byRail[rail].length}`)
    for (const r of empty.slice(0, 20)) {
      const meta = rowMetadata(r)
      console.log(
        `    ${r.country_code}:${r.currency_code}`,
        `visible=${corridorHasRailCapability(r)}`,
        `zombie=${isZombiePayoutCorridor(r)}`,
        `enabled=${r.enabled}`,
        `routing=${JSON.stringify(r.provider_routing)}`,
        `meta=${JSON.stringify({ grid_send: meta.grid_send, grid_receive: meta.grid_receive, yc_send: meta.yc_send, yc_receive: meta.yc_receive })}`,
      )
    }
    if (empty.length > 20) console.log(`    ... and ${empty.length - 20} more`)
  }

  const userAsked = [
    ["NG", "NGN", "mobile_money"],
    ["PH", "PHP", "mobile_money"],
    ["IN", "INR", "mobile_money"],
    ["AU", "AUD", "bank_transfer"],
    ["NG", "NGN", "bank_transfer"],
  ] as const

  console.log("\n=== USER-MENTIONED SAMPLES ===")
  for (const [cc, cur, rail] of userAsked) {
    const r = annotated.find((x) => x.country_code === cc && x.currency_code === cur && x.rail === rail)
    if (!r) {
      console.log(`${cc}:${cur}:${rail} — NO DB ROW`)
      continue
    }
    console.log(`${cc}:${cur}:${rail}`, {
      visible: corridorHasRailCapability(r),
      zombie: isZombiePayoutCorridor(r),
      badge: showsBadge(r),
      payout: hasAnyPayout(r),
      payin: hasAnyPayIn(r),
      noah_sell: r.noah_sell_available,
      yc_send: r.yc_send_available,
      grid_send: r.grid_send_available,
      grid_receive: r.grid_receive_available,
      metadata: rowMetadata(r),
    })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
