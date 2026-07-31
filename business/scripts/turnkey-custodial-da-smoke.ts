#!/usr/bin/env npx tsx
/**
 * Staging smoke checklist for custodial DA cutover.
 * Run after migrate-turnkey-custodial-da --apply.
 *
 * Auto-wiring: with TURNKEY_DA_* in env, migrated orgs use DA without a separate enable flag.
 * After 100% coverage, optionally set TURNKEY_DA_SENDS_STRICT=true.
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

import { isTurnkeyDaConfigured } from "@/lib/turnkey/config"
import { assessCustodialDaMigration } from "@/lib/turnkey/da-readiness"
import { buildCustodialDaPolicyPack, CUSTODIAL_DA_POLICY_NAMES } from "@/lib/turnkey/policies/custodial-da-policies"
import { resolveParentOrgCustodialDaUserId } from "@/lib/turnkey/turnkey-org-users"

async function main() {
  const checks: Array<{ name: string; ok: boolean; detail?: string }> = []

  checks.push({
    name: "da_keys_configured",
    ok: isTurnkeyDaConfigured(),
    detail: "TURNKEY_DA_API_PUBLIC_KEY + TURNKEY_DA_API_PRIVATE_KEY",
  })

  const parentDaUserId = await resolveParentOrgCustodialDaUserId()
  checks.push({
    name: "parent_da_user",
    ok: Boolean(parentDaUserId),
    detail: parentDaUserId ? `easner-da id ${parentDaUserId}` : "run parent migration + 2-of-3 approval",
  })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ""
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  if (url && key) {
    const admin = createClient(url, key, { auth: { persistSession: false } })
    const migration = await assessCustodialDaMigration(admin)
    checks.push({
      name: "migration_complete",
      ok: migration.complete,
      detail: migration.complete
        ? `${migration.subOrgsMigrated}/${migration.subOrgsTotal} sub-orgs + parent policies`
        : [
            !migration.parentDaUserReady ? "parent easner-da missing" : null,
            !migration.parentPoliciesReady ? "parent policies missing" : null,
            migration.unmigratedSubOrgIds.length > 0
              ? `${migration.unmigratedSubOrgIds.length} unmigrated sub-org(s)`
              : null,
          ]
            .filter(Boolean)
            .join("; ") || "incomplete",
    })
    checks.push({
      name: "sub_org_da_coverage",
      ok: migration.subOrgsTotal === 0 || migration.subOrgsMigrated >= migration.subOrgsTotal,
      detail: `${migration.subOrgsMigrated}/${migration.subOrgsTotal} linked owners have turnkey_da_user_id`,
    })
  }

  const samplePolicies = buildCustodialDaPolicyPack("00000000-0000-4000-8000-000000000001")
  checks.push({
    name: "policy_pack_complete",
    ok: samplePolicies.length === Object.keys(CUSTODIAL_DA_POLICY_NAMES).length,
  })

  console.log("turnkey-custodial-da-smoke\n")
  let failed = 0
  for (const c of checks) {
    const mark = c.ok ? "PASS" : "FAIL"
    if (!c.ok) failed += 1
    console.log(`${mark} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`)
  }

  console.log("\nWhen migration_complete passes, DA auto-wires in prod — no TURNKEY_DA_SENDS_STRICT flag needed.")
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
