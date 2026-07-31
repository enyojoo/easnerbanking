#!/usr/bin/env npx tsx
/**
 * Custodial Turnkey DA migration
 *
 * Idempotently provisions non-root easner-da user + policy pack on:
 * - every linked wallet_owners.turnkey_sub_organization_id
 * - parent org (omnibus) — may require 2-of-3 second approver on parent root quorum
 *
 * Parent org 2-of-3 ceremony (one-time):
 * 1. Run with --apply (this script submits createUsers + createPolicy on parent org).
 * 2. If activities stay pending, Approver B (second parent root user) approves in Turnkey dashboard.
 * 3. Re-run until parent reports ready; migration prints TURNKEY_PARENT_DA_USER_ID for env.
 * 4. After all sub-orgs migrated + smoke pass, set TURNKEY_DA_SENDS_STRICT=true (optional hardening).
 *
 * Auto-wiring: once TURNKEY_DA_* keys are in env, migrated sub-orgs use DA automatically.
 * Unmigrated sub-orgs keep root until migrated (no TURNKEY_DA_SENDS_ENABLED flip needed).
 *
 * Threat model (custodial):
 * - Stolen DA key: constrained sign; cannot export or escalate.
 * - Stolen root key: still full admin until ops isolates root from app workers.
 * - Stolen user session: app-layer only (unchanged).
 *
 * Usage:
 *   npx tsx business/scripts/migrate-turnkey-custodial-da.ts --dry-run
 *   npx tsx business/scripts/migrate-turnkey-custodial-da.ts --apply
 *   npx tsx business/scripts/migrate-turnkey-custodial-da.ts --apply --require-complete
 *   npx tsx business/scripts/migrate-turnkey-custodial-da.ts --apply --parent-only
 */
import { readFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { createClient } from "@supabase/supabase-js"

function loadEnvLocal() {
  const envPath = join(dirname(fileURLToPath(import.meta.url)), "../.env.local")
  try {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const eq = trimmed.indexOf("=")
      if (eq <= 0) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (process.env[key] == null) process.env[key] = value
    }
  } catch {
    // optional
  }
}

loadEnvLocal()

import {
  getTurnkeyRootApiClient,
  getTurnkeyRootApiClientForSubOrganization,
} from "@/lib/turnkey/client"
import {
  getTurnkeyOrganizationId,
  isTurnkeyDaConfigured,
  isTurnkeyConfigured,
} from "@/lib/turnkey/config"
import { markParentOrgDaReadyInCache, markSubOrgDaReadyInCache, markCustodialDaMigrationCompleteInCache } from "@/lib/turnkey/da-readiness"
import { provisionCustodialDaForOrganization } from "@/lib/turnkey/provision-custodial-da"

type Args = {
  dryRun: boolean
  apply: boolean
  requireComplete: boolean
  parentOnly: boolean
  subOrgsOnly: boolean
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  return {
    dryRun: argv.includes("--dry-run") || !argv.includes("--apply"),
    apply: argv.includes("--apply"),
    requireComplete: argv.includes("--require-complete"),
    parentOnly: argv.includes("--parent-only"),
    subOrgsOnly: argv.includes("--sub-orgs-only"),
  }
}

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ""
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")
  return createClient(url, key, { auth: { persistSession: false } })
}

async function main() {
  const args = parseArgs()
  console.log("migrate-turnkey-custodial-da", args)

  if (!isTurnkeyConfigured()) {
    throw new Error("Turnkey root not configured")
  }
  if (!isTurnkeyDaConfigured()) {
    throw new Error("TURNKEY_DA_API_PUBLIC_KEY / TURNKEY_DA_API_PRIVATE_KEY required")
  }

  const parentOrgId = getTurnkeyOrganizationId()
  const admin = supabaseAdmin()

  let unmigrated = 0
  let migrated = 0
  let skipped = 0
  const pendingActivities: string[] = []

  if (!args.subOrgsOnly) {
    console.log("\n--- Parent org (omnibus) ---")
    if (args.dryRun) {
      console.log(`Would provision easner-da + policies on parent org ${parentOrgId}`)
      console.log("Note: parent 2-of-3 may require second root approver after submit.")
    } else {
      const root = getTurnkeyRootApiClient()
      if (!root) throw new Error("root client unavailable")
      const result = await provisionCustodialDaForOrganization({
        organizationId: parentOrgId,
        rootClient: root as Record<string, (...args: unknown[]) => Promise<unknown>>,
      })
      console.log("Parent provision:", result)
      pendingActivities.push(...result.pendingActivityIds)
      markParentOrgDaReadyInCache()
      console.log(`\nAdd to env (optional, avoids parent listUsers on cold start):`)
      console.log(`TURNKEY_PARENT_DA_USER_ID=${result.daUserId}`)
    }
  }

  if (!args.parentOnly) {
    const { data: owners, error } = await admin
      .from("wallet_owners")
      .select("id, owner_ref, turnkey_sub_organization_id, turnkey_da_user_id")
      .not("turnkey_sub_organization_id", "is", null)

    if (error) throw new Error(error.message)

    const bySub = new Map<string, { ownerIds: string[]; daUserId: string | null }>()
    for (const row of owners ?? []) {
      const sub = String(row.turnkey_sub_organization_id ?? "").trim()
      if (!sub) continue
      const cur = bySub.get(sub) ?? { ownerIds: [], daUserId: null }
      cur.ownerIds.push(String(row.id))
      if (row.turnkey_da_user_id) cur.daUserId = String(row.turnkey_da_user_id)
      bySub.set(sub, cur)
    }

    console.log(`\n--- Sub-orgs (${bySub.size} unique) ---`)

    for (const [subOrgId, meta] of bySub) {
      if (meta.daUserId) {
        console.log(`SKIP ${subOrgId.slice(0, 8)}… already has turnkey_da_user_id`)
        skipped += 1
        continue
      }

      if (args.dryRun) {
        console.log(`WOULD migrate ${subOrgId} (${meta.ownerIds.length} wallet_owner row(s))`)
        unmigrated += 1
        continue
      }

      const subRoot = getTurnkeyRootApiClientForSubOrganization(subOrgId)
      if (!subRoot) throw new Error(`sub-org root client unavailable: ${subOrgId}`)

      const result = await provisionCustodialDaForOrganization({
        organizationId: subOrgId,
        rootClient: subRoot as Record<string, (...args: unknown[]) => Promise<unknown>>,
      })

      pendingActivities.push(...result.pendingActivityIds)
      markSubOrgDaReadyInCache(subOrgId)

      const now = new Date().toISOString()
      const { error: updErr } = await admin
        .from("wallet_owners")
        .update({ turnkey_da_user_id: result.daUserId, updated_at: now })
        .eq("turnkey_sub_organization_id", subOrgId)

      if (updErr) {
        console.error(`DB update failed for ${subOrgId}:`, updErr.message)
        unmigrated += 1
      } else {
        console.log(`OK ${subOrgId.slice(0, 8)}… daUserId=${result.daUserId}`)
        migrated += 1
      }
    }
  }

  console.log("\n--- Summary ---")
  console.log({ migrated, skipped, unmigrated, pendingActivityCount: pendingActivities.length })
  if (pendingActivities.length > 0) {
    console.log("Pending activity ids (may need parent 2-of-3 approval):", pendingActivities)
  }

  if (args.apply && unmigrated === 0 && skipped > 0 && pendingActivities.length === 0) {
    markCustodialDaMigrationCompleteInCache()
    console.log("\nCustodial DA migration complete — auto fail-closed on stragglers (no STRICT flag needed).")
  }

  if (args.requireComplete && unmigrated > 0) {
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
