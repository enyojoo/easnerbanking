#!/usr/bin/env npx tsx
/**
 * Read-only audit: map Turnkey sub-orgs ↔ emails ↔ Supabase wallet_owners ↔ Noah.
 * Does NOT modify anything.
 *
 * Usage:
 *   cd business
 *   npx tsx scripts/audit-turnkey-email-linkage.ts
 *   npx tsx scripts/audit-turnkey-email-linkage.ts --emails hello@easner.com,enyo@easner.com,enyocreative@gmail.com
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
    // env may already be set
  }
}

loadEnvLocal()

import { getTurnkeyApiClient } from "@/lib/turnkey/client"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { noahCustomerIdFromBusinessId, noahCustomerIdFromUserId, parseEasnerNoahCustomerId } from "@/lib/noah/customer-id"

type TurnkeyUserRow = {
  userId: string
  userName?: string
  userEmail?: string
}

type SubOrgAudit = {
  subOrganizationId: string
  rootUsers: TurnkeyUserRow[]
  humanRootUsers: TurnkeyUserRow[]
}

function argEmails(): string[] {
  const i = process.argv.indexOf("--emails")
  const raw =
    i >= 0
      ? process.argv[i + 1]
      : "hello@easner.com,enyo@easner.com,enyocreative@gmail.com"
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

async function listAllSubOrgIds(client: NonNullable<ReturnType<typeof getTurnkeyApiClient>>): Promise<string[]> {
  const ids: string[] = []
  // Turnkey paginates sub-org ids; loop until no new ids.
  for (let page = 0; page < 50; page++) {
    const res = await (
      client as {
        getSubOrgIds: (p: { paginationOptions?: { limit?: string; cursor?: string } }) => Promise<{
          organizationIds?: string[]
          organizationId?: string[]
        }>
      }
    ).getSubOrgIds({
      paginationOptions: page === 0 ? { limit: "100" } : { limit: "100", cursor: ids[ids.length - 1] },
    })
    const batch = res.organizationIds ?? res.organizationId ?? []
    if (!batch.length) break
    let added = 0
    for (const id of batch) {
      if (!ids.includes(id)) {
        ids.push(id)
        added++
      }
    }
    if (added === 0 || batch.length < 100) break
  }
  return ids
}

async function getSubOrgUsers(
  client: NonNullable<ReturnType<typeof getTurnkeyApiClient>>,
  subOrgId: string,
): Promise<TurnkeyUserRow[]> {
  const res = await (
    client as { getUsers: (p: { organizationId: string }) => Promise<{ users?: TurnkeyUserRow[] }> }
  ).getUsers({ organizationId: subOrgId })
  return res.users ?? []
}

async function main() {
  const watchEmails = new Set(argEmails())
  const client = getTurnkeyApiClient()
  if (!client) throw new Error("Turnkey not configured")

  const admin = createSupabaseAdmin()

  console.log("=== Turnkey sub-org email audit (read-only) ===")
  console.log("Watching emails:", [...watchEmails].join(", "))
  console.log()

  const subOrgIds = await listAllSubOrgIds(client)
  console.log(`Found ${subOrgIds.length} Turnkey sub-org(s)\n`)

  const audits: SubOrgAudit[] = []
  const emailIndex = new Map<string, SubOrgAudit[]>()

  for (const subOrganizationId of subOrgIds) {
    let users: TurnkeyUserRow[] = []
    try {
      users = await getSubOrgUsers(client, subOrganizationId)
    } catch (e) {
      console.warn(`  skip ${subOrganizationId}:`, e instanceof Error ? e.message : e)
      continue
    }

    const humanRootUsers = users.filter(
      (u) => u.userEmail && !u.userName?.toLowerCase().includes("provisioner"),
    )
    const entry: SubOrgAudit = { subOrganizationId, rootUsers: users, humanRootUsers }
    audits.push(entry)

    for (const u of humanRootUsers) {
      const email = (u.userEmail ?? "").toLowerCase()
      if (!email) continue
      const list = emailIndex.get(email) ?? []
      list.push(entry)
      emailIndex.set(email, list)
    }
  }

  // --- Turnkey by watched email ---
  console.log("--- Turnkey sub-orgs by human root email ---")
  for (const email of [...watchEmails].sort()) {
    const matches = emailIndex.get(email) ?? []
    console.log(`\n${email}: ${matches.length} sub-org(s)`)
    for (const m of matches) {
      const human = m.humanRootUsers.find((u) => (u.userEmail ?? "").toLowerCase() === email)
      console.log(`  subOrg: ${m.subOrganizationId}`)
      console.log(`    userName: ${human?.userName ?? "?"}`)
      console.log(`    userId:   ${human?.userId ?? "?"}`)
    }
    if (!matches.length) console.log("  (none)")
  }

  // --- Supabase wallet_owners ---
  const { data: walletOwners, error: woErr } = await admin
    .from("wallet_owners")
    .select("id,owner_type,owner_ref,noah_customer_id,turnkey_sub_organization_id,kyc_status")
    .not("turnkey_sub_organization_id", "is", null)
  if (woErr) throw woErr

  console.log("\n\n--- Supabase wallet_owners (with Turnkey sub-org) ---")
  for (const wo of walletOwners ?? []) {
    const sub = String(wo.turnkey_sub_organization_id ?? "")
    const tk = audits.find((a) => a.subOrganizationId === sub)
    const human = tk?.humanRootUsers[0]
    console.log({
      wallet_owner_id: wo.id,
      owner_type: wo.owner_type,
      owner_ref: wo.owner_ref,
      noah_customer_id: wo.noah_customer_id,
      turnkey_sub_org: sub,
      turnkey_root_email: human?.userEmail ?? "(unknown)",
      turnkey_root_name: human?.userName ?? "(unknown)",
    })
  }

  // --- Supabase users/auth for watched emails ---
  console.log("\n\n--- Supabase auth + users for watched emails ---")
  for (const email of [...watchEmails].sort()) {
    const { data: authList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const authUsers = (authList?.users ?? []).filter(
      (u) => (u.email ?? "").toLowerCase() === email,
    )

    const { data: userRows } = await admin.from("users").select("*").ilike("email", email)

    console.log(`\n${email}:`)
    console.log("  auth:", authUsers.map((u) => ({ id: u.id, email: u.email, confirmed: u.email_confirmed_at })))
    console.log(
      "  users:",
      (userRows ?? []).map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        full_name: u.full_name,
        easner_business_id: u.easner_business_id,
        noah_customer_id: u.noah_customer_id,
        noah_kyc_status: u.noah_kyc_status,
        deleted_at: u.deleted_at,
      })),
    )

    for (const u of userRows ?? []) {
      const expectedIndividual = noahCustomerIdFromUserId(u.id)
      if (u.role === "individual") {
        console.log(`    expected eind_: ${expectedIndividual}`)
      }
      if (u.easner_business_id) {
        console.log(`    business_id: ${u.easner_business_id}`)
        console.log(`    expected ebiz_: ${noahCustomerIdFromBusinessId(u.easner_business_id)}`)
      }
    }
  }

  // --- Focus: Easner Group business (ebiz_4769...) ---
  const focusNoah = "ebiz_4769329da17149cf86477e9b8a0128d3"
  const parsed = parseEasnerNoahCustomerId(focusNoah)
  console.log("\n\n--- Focus: Easner Group KYB linkage ---")
  console.log("noah:", focusNoah, "→ businessId:", parsed?.kind === "business" ? parsed.businessId : "?")

  if (parsed?.kind === "business") {
    const bid = parsed.businessId
    const { data: biz } = await admin.from("businesses").select("*").eq("id", bid).maybeSingle()
    const { data: wo } = await admin
      .from("wallet_owners")
      .select("*")
      .eq("owner_type", "business")
      .eq("owner_ref", bid)
      .maybeSingle()
    const { data: members } = await admin
      .from("business_memberships")
      .select("user_id,role,status")
      .eq("business_id", bid)

    console.log("business:", {
      id: biz?.id,
      name: biz?.name,
      grid_customer_id: biz?.grid_customer_id,
      verification_status: biz?.verification_status,
    })
    console.log("wallet_owner:", wo)
    console.log("memberships:", members)

    for (const m of members ?? []) {
      const auth = await admin.auth.admin.getUserById(m.user_id)
      console.log(`  member ${m.role}:`, {
        user_id: m.user_id,
        auth_email: auth.data.user?.email,
      })
    }

    const sub = String(wo?.turnkey_sub_organization_id ?? "")
    const tk = audits.find((a) => a.subOrganizationId === sub)
    console.log("turnkey sub-org users:", tk?.rootUsers.map((u) => ({
      userName: u.userName,
      userEmail: u.userEmail,
      userId: u.userId,
    })))
  }

  // --- Orphan Turnkey sub-orgs (no wallet_owners row) ---
  const linkedSubs = new Set((walletOwners ?? []).map((w) => String(w.turnkey_sub_organization_id)))
  const orphans = audits.filter((a) => !linkedSubs.has(a.subOrganizationId))
  const watchedOrphans = orphans.filter((a) =>
    a.humanRootUsers.some((u) => watchEmails.has((u.userEmail ?? "").toLowerCase())),
  )

  console.log("\n\n--- Watched-email Turnkey sub-orgs WITHOUT Supabase wallet_owners link ---")
  if (!watchedOrphans.length) {
    console.log("(none)")
  } else {
    for (const o of watchedOrphans) {
      console.log({
        subOrg: o.subOrganizationId,
        emails: o.humanRootUsers.map((u) => u.userEmail),
        names: o.humanRootUsers.map((u) => u.userName),
      })
    }
  }

  console.log("\n\n--- Recommended next steps (no changes made) ---")
  const helloSubs = emailIndex.get("hello@easner.com") ?? []
  const enyoSubs = emailIndex.get("enyo@easner.com") ?? []
  const enyocSubs = emailIndex.get("enyocreative@gmail.com") ?? []
  console.log(`hello@easner.com Turnkey sub-orgs: ${helloSubs.length}`)
  console.log(`enyo@easner.com Turnkey sub-orgs: ${enyoSubs.length}`)
  console.log(`enyocreative@gmail.com Turnkey sub-orgs: ${enyocSubs.length}`)

  const activeWo = (walletOwners ?? []).find(
    (w) => w.noah_customer_id === focusNoah || w.owner_ref === "4769329d-a171-49cf-8647-7e9b8a0128d3",
  )
  if (activeWo) {
    const sub = String(activeWo.turnkey_sub_organization_id)
    const tkEmail = audits.find((a) => a.subOrganizationId === sub)?.humanRootUsers[0]?.userEmail
    console.log(`\nActive KYB wallet sub-org: ${sub}`)
    console.log(`  Turnkey root email today: ${tkEmail ?? "?"}`)
    console.log(`  Supabase owner auth email: hello@easner.com (owner 6e037c2b-...)`)
    if ((tkEmail ?? "").toLowerCase() !== "hello@easner.com") {
      console.log("  → Fix option A: update Turnkey root user email enyo@easner.com → hello@easner.com (if API supports)")
      console.log("  → Fix option B: leave sub-org as-is (server provisioner key drives wallet ops; root email may be cosmetic)")
      if (helloSubs.some((s) => s.subOrganizationId !== sub)) {
        console.log("  → Caution: hello@easner.com already has other sub-org(s) – do not swap IDs without audit")
      }
    }
  }

  // --- Wallet accounts for key sub-orgs ---
  const keySubs: Array<[string, string]> = [
    ["KYB Easner Group (linked)", "4daf7b5f-2adb-46a3-8296-acf259dd9a67"],
    ["hello@easner.com orphan", "aa580d4a-3895-4789-8d0d-730b830e117e"],
    ["hello@easner.com orphan", "27d01f45-bc48-4e0d-b528-346d9fed663d"],
    ["hello@easner.com → c7ace38e individual", "ddd0463d-c476-4b5d-8789-ded021e4b549"],
    ["enyocreative@gmail.com → 99fad1d4 individual", "62b87ad8-bb38-419b-b1e8-1289d9475e9c"],
    ["enyo@easner.com orphan", "e75e43be-73f1-4640-a1bd-f8415313232a"],
    ["enyo@easner.com orphan", "d1f97029-da50-4b71-9aa8-159310733049"],
  ]

  console.log("\n\n--- Wallet accounts for key sub-orgs ---")
  for (const [label, subId] of keySubs) {
    const { data: wo } = await admin
      .from("wallet_owners")
      .select("id,owner_type,owner_ref,noah_customer_id")
      .eq("turnkey_sub_organization_id", subId)
      .maybeSingle()
    let accounts: unknown[] = []
    if (wo?.id) {
      const { data: accts } = await admin
        .from("wallet_accounts")
        .select("asset,chain,address,status")
        .eq("wallet_owner_id", wo.id)
      accounts = accts ?? []
    }
    console.log(`\n${label}`)
    console.log(`  subOrg: ${subId}`)
    console.log(`  wallet_owner:`, wo ?? "NONE")
    console.log(`  accounts:`, accounts)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
