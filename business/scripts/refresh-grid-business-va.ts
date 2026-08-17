/**
 * Refresh Grid INTERNAL_FIAT receive rails for a Grid-verified business.
 * Optionally retire stray Noah business VA rows (does not mutate them into Grid).
 *
 * Usage:
 *   cd business
 *   npx tsx scripts/refresh-grid-business-va.ts --business-id <uuid>
 *   npx tsx scripts/refresh-grid-business-va.ts --business-id <uuid> --retire-noah
 *   npx tsx scripts/refresh-grid-business-va.ts --business-id <uuid> --dry-run
 */

import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { businessUsesGridVerification } from "@/lib/compliance/business-tier1"
import { refreshGridBusinessReceiveRails } from "@/lib/grid/provision-after-approval"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const businessId = arg("--business-id")?.trim()
  if (!businessId) {
    throw new Error("--business-id is required")
  }
  const dryRun = process.argv.includes("--dry-run")
  const retireNoah = process.argv.includes("--retire-noah")

  const admin = createSupabaseAdmin()
  const { data: biz, error } = await admin
    .from("businesses")
    .select("id,name,verification_provider,verification_status,grid_customer_id")
    .eq("id", businessId)
    .maybeSingle()
  if (error || !biz) throw new Error(error?.message ?? "Business not found")
  if (!businessUsesGridVerification(biz as { verification_provider?: string | null })) {
    throw new Error("Business is not Grid verification SoR")
  }

  const gridCustomerId = String(biz.grid_customer_id ?? "").trim()
  if (!gridCustomerId) throw new Error("Missing grid_customer_id on business")

  const ownerUserId = await resolveBusinessOrgOwnerUserId(admin, businessId)
  if (!ownerUserId) throw new Error("Could not resolve org owner user id")

  const { data: noahRows } = await admin
    .from("virtual_accounts")
    .select("id,provider,currency,provider_virtual_account_id,status")
    .eq("business_id", businessId)
    .eq("provider", "noah")
    .eq("status", "active")

  console.log("Business:", biz.name, biz.id)
  console.log("Grid customer:", gridCustomerId)
  console.log("Owner user:", ownerUserId)
  console.log("Active Noah VAs:", noahRows ?? [])

  if (dryRun) {
    console.log("\nDry run — no changes applied.")
    return
  }

  const result = await refreshGridBusinessReceiveRails({
    admin,
    businessId,
    userId: ownerUserId,
    gridCustomerId,
  })
  console.log("\nGrid refresh:", result)

  const { data: gridRows } = await admin
    .from("virtual_accounts")
    .select("id,provider,currency,provider_virtual_account_id,status,account_number,routing_number,iban")
    .eq("business_id", businessId)
    .eq("provider", "grid")
    .neq("status", "retired")
  console.log("\nGrid VAs after refresh:", gridRows ?? [])

  if (retireNoah && (noahRows?.length ?? 0) > 0) {
    const ids = noahRows!.map((r) => r.id)
    const { error: retireErr } = await admin
      .from("virtual_accounts")
      .update({ status: "retired", updated_at: new Date().toISOString() })
      .in("id", ids)
    if (retireErr) throw new Error(retireErr.message)
    console.log("\nRetired Noah VA rows:", ids)
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
