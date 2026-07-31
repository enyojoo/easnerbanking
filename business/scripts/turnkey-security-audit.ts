#!/usr/bin/env npx tsx
/**
 * Turnkey security audit: migration status, root API key inventory, sensitive activities.
 *
 * Usage:
 *   npx tsx business/scripts/turnkey-security-audit.ts
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

import { getTurnkeyRootApiClient, getTurnkeyDaApiClient } from "@/lib/turnkey/client"
import {
  getTurnkeyApiPublicKey,
  getTurnkeyDaApiPublicKey,
  getTurnkeyOrganizationId,
  isTurnkeyDaConfigured,
  isTurnkeyRootProvisioningConfigured,
} from "@/lib/turnkey/config"
import { assessCustodialDaMigration } from "@/lib/turnkey/da-readiness"
import { listTurnkeyOrgUsers } from "@/lib/turnkey/turnkey-org-users"

const SENSITIVE_ACTIVITY_TYPES = new Set([
  "ACTIVITY_TYPE_EXPORT_WALLET",
  "ACTIVITY_TYPE_EXPORT_WALLET_ACCOUNT",
  "ACTIVITY_TYPE_EXPORT_PRIVATE_KEY",
  "ACTIVITY_TYPE_CREATE_API_KEYS",
  "ACTIVITY_TYPE_CREATE_API_KEYS_V2",
  "ACTIVITY_TYPE_DELETE_API_KEYS",
  "ACTIVITY_TYPE_CREATE_POLICY",
  "ACTIVITY_TYPE_CREATE_POLICY_V3",
  "ACTIVITY_TYPE_CREATE_POLICIES",
  "ACTIVITY_TYPE_UPDATE_POLICY",
  "ACTIVITY_TYPE_UPDATE_POLICY_V2",
  "ACTIVITY_TYPE_DELETE_POLICY",
  "ACTIVITY_TYPE_CREATE_USERS",
  "ACTIVITY_TYPE_CREATE_USERS_V3",
  "ACTIVITY_TYPE_CREATE_USERS_V4",
  "ACTIVITY_TYPE_UPDATE_ROOT_QUORUM",
])

function asRecord(v: unknown): Record<string, unknown> {
  return v != null && typeof v === "object" ? (v as Record<string, unknown>) : {}
}

async function main() {
  const orgId = getTurnkeyOrganizationId()
  console.log("turnkey-security-audit\n")
  console.log("org:", orgId)
  console.log("root provisioning configured:", isTurnkeyRootProvisioningConfigured())
  console.log("da configured:", isTurnkeyDaConfigured())
  console.log("root public key prefix:", getTurnkeyApiPublicKey().slice(0, 12) + "…")
  console.log("da public key prefix:", getTurnkeyDaApiPublicKey().slice(0, 12) + "…")

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ""
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  if (url && key) {
    const admin = createClient(url, key, { auth: { persistSession: false } })
    const migration = await assessCustodialDaMigration(admin)
    console.log("\n--- Migration ---")
    console.log("complete:", migration.complete)
    console.log("sub-orgs:", `${migration.subOrgsMigrated}/${migration.subOrgsTotal}`)
    console.log("parent user:", migration.parentDaUserReady)
    console.log("parent policies:", migration.parentPoliciesReady)
    if (migration.unmigratedSubOrgIds.length > 0) {
      console.log("unmigrated:", migration.unmigratedSubOrgIds)
    }
  }

  const rootClient = getTurnkeyRootApiClient()
  if (!rootClient) {
    console.error("\nRoot client unavailable — skip Turnkey API inventory")
    process.exit(1)
  }

  console.log("\n--- Parent org users ---")
  const users = await listTurnkeyOrgUsers(
    rootClient as Record<string, (...args: unknown[]) => Promise<unknown>>,
    orgId,
  )
  for (const u of users) {
    let apiKeyCount = 0
    if (typeof rootClient.getUser === "function") {
      const detail = await rootClient.getUser({ organizationId: orgId, userId: u.userId })
      const r = asRecord(detail)
      const user = asRecord(r.user)
      const keys = user.apiKeys ?? user.api_keys
      if (Array.isArray(keys)) apiKeyCount = keys.length
    }
    console.log(`  ${u.userName} (${u.userId.slice(0, 8)}…) apiKeys=${apiKeyCount}`)
  }

  const enyo = users.find((u) => u.userName.toLowerCase().includes("enyo"))
  if (enyo && typeof rootClient.getUser === "function") {
    const detail = await rootClient.getUser({ organizationId: orgId, userId: enyo.userId })
    const user = asRecord(asRecord(detail).user)
    const keys = (user.apiKeys ?? user.api_keys) as unknown[] | undefined
    console.log("\n--- Enyo API keys (check duplicate removed) ---")
    if (Array.isArray(keys)) {
      for (const raw of keys) {
        const k = asRecord(raw)
        const name = String(k.apiKeyName ?? k.api_key_name ?? k.name ?? "unnamed")
        const pub = String(k.credential?.publicKey ?? k.publicKey ?? k.public_key ?? "").slice(0, 16)
        const matchesServer = pub && getTurnkeyApiPublicKey().startsWith(pub.slice(0, 12))
        console.log(`  ${name} pub=${pub}… ${matchesServer ? "(matches TURNKEY_API_PUBLIC_KEY)" : ""}`)
      }
      console.log(`  total: ${keys.length} (expect 1 server key + passkey, not 2 duplicate API keys)`)
    }
  }

  if (typeof rootClient.getActivities === "function") {
    console.log("\n--- Recent sensitive activities (last 30) ---")
    const res = await rootClient.getActivities({
      organizationId: orgId,
      paginationOptions: { limit: "30" },
    })
    const acts = (res as { activities?: unknown[] }).activities ?? []
    let shown = 0
    for (const raw of acts) {
      const a = asRecord(raw)
      const type = String(a.type ?? "")
      const status = String(a.status ?? "")
      if (!SENSITIVE_ACTIVITY_TYPES.has(type) && !status.includes("DENIED")) continue
      console.log(`  ${status} ${type} ${String(a.id ?? "").slice(0, 36)}`)
      shown += 1
    }
    if (shown === 0) console.log("  (none in last 30 activities)")
  }

  const daClient = getTurnkeyDaApiClient()
  if (daClient) {
    try {
      await daClient.getWhoami({})
      console.log("\nDA getWhoami: ok")
    } catch (e) {
      console.log("\nDA getWhoami: FAIL", e instanceof Error ? e.message : e)
    }
  }

  console.log("\n--- Live send smoke (manual) ---")
  console.log("1. Vault SPL send → Activity log should show easner-da (not Enyo root)")
  console.log("2. LI.FI wallet send → same")
  console.log("3. Omnibus send (if enabled) → parent easner-da")
  console.log("4. Set up Turnkey activity webhook alert for EXPORT / CREATE_POLICY / CREATE_API_KEYS")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
