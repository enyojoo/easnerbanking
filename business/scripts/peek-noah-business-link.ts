#!/usr/bin/env npx tsx
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

import { parseEasnerNoahCustomerId, noahCustomerIdFromBusinessId } from "@/lib/noah/customer-id"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { fetchNoahCustomerWithBusinessFallback } from "@/lib/noah/fetch-customer"
import { mapNoahVerificationToKycStatus } from "@/lib/noah/map-kyc"

const noahId = process.argv[2] ?? "ebiz_4769329da17149cf86477e9b8a0128d3"
const parsed = parseEasnerNoahCustomerId(noahId)
const businessId = parsed?.kind === "business" ? parsed.businessId : null
const expected = businessId ? noahCustomerIdFromBusinessId(businessId) : null

console.log("noahId:", noahId)
console.log("parsed businessId:", businessId)
console.log("expected ebiz id matches:", expected === noahId)

async function main() {
  if (!businessId) throw new Error("Not a valid ebiz customer id")
  const admin = createSupabaseAdmin()

  const { data: biz } = await admin.from("businesses").select("*").eq("id", businessId).maybeSingle()
  console.log("\n--- businesses row ---")
  console.log(
    biz
      ? {
          id: biz.id,
          name: biz.name,
          email: biz.email,
          noah_customer_id: biz.noah_customer_id,
          noah_kyb_status: biz.noah_kyb_status,
        }
      : "NOT FOUND",
  )

  const { data: bizByNoah } = await admin
    .from("businesses")
    .select("id,name,email,noah_customer_id,noah_kyb_status")
    .eq("noah_customer_id", noahId)
    .maybeSingle()
  console.log("\n--- businesses by noah_customer_id ---")
  console.log(bizByNoah ?? "none")

  const { data: members } = await admin
    .from("business_memberships")
    .select("user_id,role,status")
    .eq("business_id", businessId)
  console.log("\n--- business_memberships ---")
  console.log(members)

  const owner = members?.find((m) => m.role === "owner") ?? members?.[0]
  const ownerUserId = owner?.user_id as string | undefined

  if (ownerUserId) {
    const auth = await admin.auth.admin.getUserById(ownerUserId)
    const { data: userRow } = await admin
      .from("users")
      .select("id,email,full_name,role,easner_business_id,noah_customer_id,noah_kyc_status,deleted_at")
      .eq("id", ownerUserId)
      .maybeSingle()
    console.log("\n--- owner auth ---")
    console.log({
      id: auth.data.user?.id,
      email: auth.data.user?.email,
      confirmed: auth.data.user?.email_confirmed_at,
    })
    console.log("\n--- owner users row ---")
    console.log(userRow)
  }

  const { data: walletOwners } = await admin
    .from("wallet_owners")
    .select("id,owner_type,owner_ref,noah_customer_id,turnkey_sub_organization_id,kyc_status")
    .or(`owner_ref.eq.${businessId},noah_customer_id.eq.${noahId}`)

  console.log("\n--- wallet_owners ---")
  console.log(walletOwners)

  for (const wo of walletOwners ?? []) {
    const { data: accounts } = await admin
      .from("wallet_accounts")
      .select("id,asset,chain,address,turnkey_sub_organization_id")
      .eq("wallet_owner_id", wo.id)
      .limit(8)
    console.log(`wallet_accounts for ${wo.id}:`, accounts)
  }

  try {
    const { customer, resolvedCustomerId } = await fetchNoahCustomerWithBusinessFallback(
      businessId,
      (biz?.noah_customer_id as string | null) ?? noahId,
    )
    const kyb = mapNoahVerificationToKycStatus(customer)
    const c = customer as Record<string, unknown>
    console.log("\n--- Noah API ---")
    console.log({
      resolvedCustomerId,
      kybStatus: kyb,
      customerEmail: c.Email ?? c.email ?? c.PrimaryContactEmail,
      customerName: c.Name ?? c.name ?? c.RegisteredName,
      customerId: c.CustomerID ?? c.customerId,
    })
  } catch (e) {
    console.log("\n--- Noah API error ---", e instanceof Error ? e.message : e)
  }

  try {
    const { getTurnkeyApiClient } = await import("@/lib/turnkey/client")
    const subOrg = walletOwners?.[0]?.turnkey_sub_organization_id as string | undefined
    const client = getTurnkeyApiClient()
    if (client && subOrg) {
      const org = await client.getOrganization({ organizationId: subOrg })
      const users = await client.getUsers({ organizationId: subOrg })
      console.log("\n--- Turnkey ---")
      console.log("subOrg:", subOrg, "name:", org.organization?.organizationName)
      for (const u of users.users ?? []) {
        console.log("  user:", { userName: u.userName, userEmail: u.userEmail })
      }
    }
  } catch (e) {
    console.log("\n--- Turnkey error ---", e instanceof Error ? e.message : e)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
