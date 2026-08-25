/**
 * Audit verified customers missing Turnkey sub-orgs (business Grid + mobile Noah paths).
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/audit-turnkey-provisioning-gaps.ts
 */
import { createSupabaseAdmin } from "../lib/supabase/admin"
import { auditTurnkeyProvisioningGaps } from "../lib/wallet/audit-turnkey-provisioning-gaps"

async function main() {
  const admin = createSupabaseAdmin()
  const report = await auditTurnkeyProvisioningGaps(admin)
  console.log(JSON.stringify(report, null, 2))
  if (
    report.summary.businessApprovedWithoutSubOrg > 0 ||
    report.summary.individualApprovedWithoutSubOrg > 0 ||
    report.awaitingSubOrgJobCount > 0
  ) {
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
