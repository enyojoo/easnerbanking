#!/usr/bin/env npx tsx
/**
 * Install parent-org policy so server API user can create sub-orgs without 2-of-3 quorum.
 *
 * One-time: if parent root quorum is 2-of-3, a second root user must approve the policy
 * activity in Turnkey dashboard before auto-provisioning works.
 *
 * Usage:
 *   cd business
 *   node --env-file=.env.local --import ./scripts/stub-server-only.mjs --import tsx scripts/install-turnkey-parent-provisioning-policy.ts
 */
import { ensureParentSubOrgProvisioningPolicy } from "@/lib/turnkey/ensure-parent-provisioning-policy"

async function main() {
  const result = await ensureParentSubOrgProvisioningPolicy()
  console.log(JSON.stringify(result, null, 2))
  if (!result.ok) process.exit(1)
  if (result.pendingActivityId) {
    console.log(
      "\nApprove this activity in Turnkey dashboard (second root user), then re-run heal/provision.",
    )
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
