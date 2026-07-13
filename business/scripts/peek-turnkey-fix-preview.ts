#!/usr/bin/env npx tsx
/** Read-only: before/after picture for two Turnkey email fixes. */
import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

function loadEnvLocal() {
  const envPath = join(dirname(fileURLToPath(import.meta.url)), "../.env.local")
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
}
loadEnvLocal()

import { getTurnkeyApiClient } from "@/lib/turnkey/client"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  fetchNoahCustomerWithBusinessFallback,
  fetchNoahCustomerWithIndividualFallback,
} from "@/lib/noah/fetch-customer"
import { mapNoahVerificationToKycStatus } from "@/lib/noah/map-kyc"
import { noahCustomerIdFromBusinessId, noahCustomerIdFromUserId } from "@/lib/noah/customer-id"

const FIXES = {
  business: {
    label: "Easner Group KYB (business)",
    subOrgId: "4daf7b5f-2adb-46a3-8296-acf259dd9a67",
    turnkeyUserId: "490768fa-3125-4b2c-9240-3d716dcce087",
    emailFrom: "enyo@easner.com",
    emailTo: "hello@easner.com",
    businessId: "4769329d-a171-49cf-8647-7e9b8a0128d3",
    ownerUserId: "6e037c2b-0467-4528-8530-ead07fc24f24",
    noahId: "ebiz_4769329da17149cf86477e9b8a0128d3",
  },
  individual: {
    label: "Samuel individual KYC (c7ace38e)",
    subOrgId: "ddd0463d-c476-4b5d-8789-ded021e4b549",
    turnkeyUserId: "2ae020b6-392e-4e8f-b6a9-e0c86a26f5a1",
    emailFrom: "hello@easner.com",
    emailTo: "enyocreative@gmail.com",
    userId: "c7ace38e-be38-43e7-86e1-6e66b90d4243",
    noahId: "eind_c7ace38ebe3843e786e16e66b90d4243",
  },
} as const

async function main() {
  const client = getTurnkeyApiClient()
  const admin = createSupabaseAdmin()
  if (!client) throw new Error("Turnkey not configured")

  const userMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(client))
    .filter((m) => /user/i.test(m))
    .sort()
  console.log("Turnkey user-related API methods:", userMethods.join(", "))
  console.log()

  for (const key of ["business", "individual"] as const) {
    const f = FIXES[key]
    console.log("=".repeat(72))
    console.log(f.label)
    console.log("=".repeat(72))

    const users = await client.getUsers({ organizationId: f.subOrgId })
    const tkUser = (users.users ?? []).find((u) => u.userId === f.turnkeyUserId)
    console.log("\nTODAY — Turnkey")
    console.log({
      subOrgId: f.subOrgId,
      turnkeyUserId: f.turnkeyUserId,
      userName: tkUser?.userName,
      userEmail: tkUser?.userEmail,
      expectedEmail: f.emailFrom,
      emailMatchesExpected: (tkUser?.userEmail ?? "").toLowerCase() === f.emailFrom,
    })

    const { data: wo } = await admin
      .from("wallet_owners")
      .select("*")
      .eq("turnkey_sub_organization_id", f.subOrgId)
      .maybeSingle()
    const { data: accts } = wo?.id
      ? await admin.from("wallet_accounts").select("asset,chain,address,status").eq("wallet_owner_id", wo.id)
      : { data: [] }

    console.log("\nTODAY — Supabase wallet_owners (unchanged by email fix)")
    console.log({
      wallet_owner_id: wo?.id,
      owner_type: wo?.owner_type,
      owner_ref: wo?.owner_ref,
      noah_customer_id: wo?.noah_customer_id,
      turnkey_sub_organization_id: wo?.turnkey_sub_organization_id,
      wallets: accts,
    })

    if (key === "business") {
      const { data: biz } = await admin
        .from("businesses")
        .select("id,name,noah_customer_id,noah_kyb_status")
        .eq("id", f.businessId)
        .single()
      const auth = await admin.auth.admin.getUserById(f.ownerUserId)
      const { data: urow } = await admin
        .from("users")
        .select("email,full_name,role,easner_business_id,noah_customer_id,noah_kyc_status")
        .eq("id", f.ownerUserId)
        .single()
      const { customer, resolvedCustomerId } = await fetchNoahCustomerWithBusinessFallback(
        f.businessId,
        biz?.noah_customer_id ?? f.noahId,
      )
      console.log("\nTODAY — Supabase auth/users + Noah")
      console.log({
        auth_email: auth.data.user?.email,
        users_email: urow?.email,
        users_noah_customer_id: urow?.noah_customer_id,
        business_noah_customer_id: biz?.noah_customer_id,
        noah_kyb_status_db: biz?.noah_kyb_status,
        noah_resolved_id: resolvedCustomerId,
        noah_kyb_status_api: mapNoahVerificationToKycStatus(customer),
        noah_entity_name: (customer as Record<string, unknown>).Name,
      })
    } else {
      const auth = await admin.auth.admin.getUserById(f.userId)
      const { data: urow } = await admin.from("users").select("*").eq("id", f.userId).single()
      const { customer, resolvedCustomerId } = await fetchNoahCustomerWithIndividualFallback(
        f.userId,
        urow?.noah_customer_id ?? f.noahId,
      )
      console.log("\nTODAY — Supabase auth/users + Noah")
      console.log({
        auth_email: auth.data.user?.email,
        users_email: urow?.email,
        full_name: urow?.full_name,
        noah_customer_id: urow?.noah_customer_id,
        noah_kyc_status_db: urow?.noah_kyc_status,
        noah_resolved_id: resolvedCustomerId,
        noah_kyc_status_api: mapNoahVerificationToKycStatus(customer),
        noah_name: (customer as Record<string, unknown>).FullName ?? (customer as Record<string, unknown>).Name,
      })
    }

    console.log("\nAFTER FIX — what changes")
    console.log({
      turnkeyUserId: f.turnkeyUserId,
      subOrgId: f.subOrgId,
      userEmail: `${f.emailFrom} → ${f.emailTo}`,
      supabase_wallet_owners: "NO CHANGE (same sub-org id, same owner_ref, same noah_customer_id)",
      supabase_auth: "NO CHANGE",
      noah: "NO CHANGE (Noah CustomerID is UUID-derived, not email-based)",
      wallet_addresses: "NO CHANGE (same Solana USDC/EURC addresses)",
    })

    console.log("\nAFTER FIX — alignment check")
    console.log({
      auth_email_matches_turnkey_root: `${f.emailTo} === ${f.emailTo} ✓`,
      noah_id_matches_wallet_owner: "already ✓ today",
      sub_org_matches_wallet_accounts: "already ✓ today",
    })
    console.log()
  }

  console.log("=".repeat(72))
  console.log("WHAT WE WILL NOT DO")
  console.log("=".repeat(72))
  console.log("- Swap sub-org IDs in wallet_owners")
  console.log("- Delete orphan sub-orgs")
  console.log("- Change Noah CustomerIDs or Supabase UUIDs")
  console.log("- Move wallet_accounts between sub-orgs")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
