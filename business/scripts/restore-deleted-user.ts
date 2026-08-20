#!/usr/bin/env npx tsx
/**
 * Support restore for a closed or legacy hard-deleted individual user (same UUID keeps Noah KYC linkage).
 *
 * Usage:
 *   cd business
 *   npx tsx scripts/restore-deleted-user.ts --user-id <uuid> --email <email>
 *   npx tsx scripts/restore-deleted-user.ts --user-id c7ace38e-be38-43e7-86e1-6e66b90d4243 --email enyocreative@gmail.com
 *   npx tsx scripts/restore-deleted-user.ts ... --sync-noah   # pull KYC from Noah API after restore
 *   npx tsx scripts/restore-deleted-user.ts ... --execute     # required to mutate (default is dry-run)
 *
 * Steps:
 * 1. Create Supabase Auth user with fixed UUID (email_confirm: true)
 * 2. If profile exists with deleted_at → clear closed state (retain Noah/KYC data)
 *    If profile missing (legacy hard-delete) → upsert minimal row
 * 3. Optionally sync approved KYC + profile fields from Noah
 */

import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

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
    // optional – env may already be set in CI/production shells
  }
}

loadEnvLocal()

import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { noahCustomerIdFromUserId } from "@/lib/noah/customer-id"
import { fetchNoahCustomerWithIndividualFallback } from "@/lib/noah/fetch-customer"
import { mapNoahVerificationToKycStatus } from "@/lib/noah/map-kyc"
import { syncNoahCustomerToSupabase } from "@/lib/noah/sync-user"
import { restoreClosedAccount } from "@/lib/settings/account-deletion"

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

async function main() {
  const dryRun = !process.argv.includes("--execute")
  const syncNoah = process.argv.includes("--sync-noah")
  const syncOnly = process.argv.includes("--sync-noah-only")
  const userId = arg("--user-id")?.trim()
  const email = arg("--email")?.trim().toLowerCase()

  if (!userId || !isUuid(userId)) {
    throw new Error("--user-id must be a valid UUID")
  }
  if (!email || !email.includes("@")) {
    throw new Error("--email must be a valid email address")
  }

  const admin = createSupabaseAdmin()
  const noahCustomerId = noahCustomerIdFromUserId(userId)

  console.log("Restore closed/deleted user")
  console.log("  userId:", userId)
  console.log("  email:", email)
  console.log("  noahCustomerId:", noahCustomerId)
  console.log("  mode:", dryRun ? "DRY RUN (pass --execute to apply)" : "EXECUTE")

  const authExisting = await admin.auth.admin.getUserById(userId)
  const authExists = !authExisting.error && Boolean(authExisting.data.user?.id)
  console.log("  auth user:", authExists ? `exists (${authExisting.data.user?.email})` : "missing")

  const { data: userRow } = await admin
    .from("users")
    .select("id,email,noah_customer_id,noah_kyc_status,deleted_at")
    .eq("id", userId)
    .maybeSingle()
  console.log(
    "  users row:",
    userRow
      ? `exists (${userRow.email}, kyc=${userRow.noah_kyc_status}, closed=${Boolean(userRow.deleted_at)})`
      : "missing",
  )

  const { data: walletOwners } = await admin
    .from("wallet_owners")
    .select("id,turnkey_sub_organization_id")
    .eq("owner_type", "individual")
    .eq("owner_ref", userId)
  console.log(
    "  wallet_owners:",
    walletOwners?.length
      ? `${walletOwners.length} row(s), subOrg=${walletOwners[0]?.turnkey_sub_organization_id ?? "n/a"}`
      : "none",
  )

  if (dryRun) {
    console.log("\nDry run complete. Re-run with --execute to restore.")
    if (syncNoah || syncOnly) console.log("Will also sync from Noah after restore.")
    return
  }

  if (!syncOnly) {
    if (!authExists) {
      const { data, error } = await admin.auth.admin.createUser({
        id: userId,
        email,
        email_confirm: true,
      })
      if (error) throw new Error(`auth.admin.createUser: ${error.message}`)
      console.log("\nCreated auth user:", data.user?.id)
    } else if (authExisting.data.user?.email !== email) {
      const { error } = await admin.auth.admin.updateUserById(userId, {
        email,
        email_confirm: true,
      })
      if (error) throw new Error(`auth.admin.updateUserById email: ${error.message}`)
      console.log("\nUpdated auth user email to:", email)
    } else {
      console.log("\nAuth user already exists – skipped create")
    }

    if (userRow?.id && userRow.deleted_at) {
      await restoreClosedAccount(admin, userId)
      console.log("Cleared deleted_at on existing profile (Noah/KYC data retained)")
    } else if (!userRow?.id) {
      const now = new Date().toISOString()
      const profilePayload = {
        id: userId,
        email,
        role: "individual" as const,
        noah_customer_id: noahCustomerId,
        updated_at: now,
      }
      const { error: upsertErr } = await admin.from("users").upsert(profilePayload, { onConflict: "id" })
      if (upsertErr) throw new Error(`users upsert: ${upsertErr.message}`)
      console.log("Upserted public.users row (legacy hard-delete recovery)")
    } else {
      console.log("Profile row exists and is active – skipped profile upsert")
    }
  }

  if (syncNoah || syncOnly) {
    console.log("\nSyncing KYC from Noah API…")
    const { customer, resolvedCustomerId } = await fetchNoahCustomerWithIndividualFallback(
      userId,
      noahCustomerId,
    )
    const kyc = mapNoahVerificationToKycStatus(customer)
    console.log("  resolvedCustomerId:", resolvedCustomerId)
    console.log("  kycStatus:", kyc)
    await syncNoahCustomerToSupabase({ kind: "individual", userId }, customer, resolvedCustomerId)
    const { data: after } = await admin
      .from("users")
      .select("full_name,noah_kyc_status,kyc_verified_at,noah_usd_virtual_account_id,noah_eur_virtual_account_id,deleted_at")
      .eq("id", userId)
      .single()
    console.log("  synced profile:", after)
  }

  console.log("\nRestore complete.")
  console.log("Next steps for the user:")
  console.log("  - Sign in via mobile (password reset or existing OAuth if configured)")
  console.log("  - If KYC not synced, run: npx tsx scripts/restore-deleted-user.ts ... --execute --sync-noah")
  console.log("  - Or sign in and call POST /api/noah/sync-status from the app")
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
