#!/usr/bin/env npx tsx
/** Read-only: detect duplicate sub-orgs, wallet_owners, emails across Supabase + Turnkey. */
import { readFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"

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

type TurnkeyUserRow = { userId: string; userName?: string; userEmail?: string }

async function listAllSubOrgIds(client: NonNullable<ReturnType<typeof getTurnkeyApiClient>>): Promise<string[]> {
  const ids: string[] = []
  for (let page = 0; page < 50; page++) {
    const res = await (
      client as {
        getSubOrgIds: (p: { paginationOptions?: { limit?: string; cursor?: string } }) => Promise<{
          organizationIds?: string[]
        }>
      }
    ).getSubOrgIds({
      paginationOptions: page === 0 ? { limit: "100" } : { limit: "100", cursor: ids[ids.length - 1] },
    })
    const batch = res.organizationIds ?? []
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

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const key = keyFn(item)
    if (!key) continue
    const list = map.get(key) ?? []
    list.push(item)
    map.set(key, list)
  }
  return map
}

function printDupes(title: string, groups: Map<string, unknown[]>, min = 2) {
  const dupes = [...groups.entries()].filter(([, v]) => v.length >= min)
  console.log(`\n=== ${title} ===`)
  if (!dupes.length) {
    console.log("(none)")
    return dupes
  }
  for (const [key, rows] of dupes.sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n${key} (${rows.length} rows):`)
    console.log(JSON.stringify(rows, null, 2))
  }
  return dupes
}

async function main() {
  const client = getTurnkeyApiClient()
  if (!client) throw new Error("Turnkey not configured")
  const admin = createSupabaseAdmin()

  console.log("=== Duplicate / linkage audit (read-only) ===\n")

  // --- Supabase wallet_owners ---
  const { data: walletOwners, error: woErr } = await admin
    .from("wallet_owners")
    .select("id,owner_type,owner_ref,noah_customer_id,turnkey_sub_organization_id,created_at")
    .order("created_at")
  if (woErr) throw woErr
  const wo = walletOwners ?? []

  printDupes(
    "Supabase: duplicate turnkey_sub_organization_id",
    groupBy(wo.filter((r) => r.turnkey_sub_organization_id), (r) => String(r.turnkey_sub_organization_id)),
  )
  printDupes(
    "Supabase: duplicate owner_ref + owner_type",
    groupBy(wo, (r) => `${r.owner_type}:${r.owner_ref}`),
  )
  printDupes(
    "Supabase: duplicate noah_customer_id",
    groupBy(wo.filter((r) => r.noah_customer_id), (r) => String(r.noah_customer_id)),
  )

  // --- Supabase users ---
  const { data: users } = await admin
    .from("users")
    .select("id,email,role,full_name,noah_customer_id,deleted_at,created_at")
    .order("created_at")
  const userRows = users ?? []

  printDupes(
    "Supabase users: duplicate email",
    groupBy(
      userRows.filter((u) => u.email),
      (u) => String(u.email).toLowerCase(),
    ),
  )
  printDupes(
    "Supabase users: duplicate noah_customer_id",
    groupBy(
      userRows.filter((u) => u.noah_customer_id),
      (u) => String(u.noah_customer_id),
    ),
  )

  // --- Auth emails (paginated) ---
  const authByEmail = new Map<string, Array<{ id: string; email: string }>>()
  let page = 1
  while (page <= 50) {
    const { data: authPage, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    for (const u of authPage.users ?? []) {
      const email = String(u.email ?? "").toLowerCase()
      if (!email) continue
      const list = authByEmail.get(email) ?? []
      list.push({ id: u.id, email: u.email ?? "" })
      authByEmail.set(email, list)
    }
    if ((authPage.users?.length ?? 0) < 200) break
    page++
  }
  const authDupes = [...authByEmail.entries()].filter(([, v]) => v.length > 1)
  console.log("\n=== Supabase auth: duplicate email ===")
  if (!authDupes.length) console.log("(none)")
  else for (const [email, rows] of authDupes) console.log(email, rows)

  // --- wallet_owner without auth / users row ---
  console.log("\n=== wallet_owners missing auth or users row ===")
  const orphanOwners: unknown[] = []
  for (const row of wo) {
    if (row.owner_type !== "individual") continue
    const userId = String(row.owner_ref)
    const auth = await admin.auth.admin.getUserById(userId)
    const { data: profile } = await admin.from("users").select("id,email").eq("id", userId).maybeSingle()
    if (!auth.data.user || !profile) {
      orphanOwners.push({
        wallet_owner_id: row.id,
        owner_ref: userId,
        turnkey_sub_org: row.turnkey_sub_organization_id,
        noah_customer_id: row.noah_customer_id,
        has_auth: !!auth.data.user,
        has_users_row: !!profile,
      })
    }
  }
  console.log(orphanOwners.length ? orphanOwners : "(none)")

  // --- Turnkey scan ---
  const subOrgIds = await listAllSubOrgIds(client)
  console.log(`\n=== Turnkey: ${subOrgIds.length} sub-org(s) ===`)

  type SubInfo = {
    subOrg: string
    humanEmail: string
    humanName: string
    humanUserId: string
    hasProvisioner: boolean
    linkedWalletOwnerId: string | null
    ownerRef: string | null
  }
  const subInfos: SubInfo[] = []
  const linkedSubs = new Set(wo.map((r) => String(r.turnkey_sub_organization_id ?? "")).filter(Boolean))
  const subToOwners = groupBy(
    wo.filter((r) => r.turnkey_sub_organization_id),
    (r) => String(r.turnkey_sub_organization_id),
  )

  for (const subOrg of subOrgIds) {
    let users: TurnkeyUserRow[] = []
    try {
      const res = await client.getUsers({ organizationId: subOrg })
      users = res.users ?? []
    } catch {
      continue
    }
    const human = users.find((u) => u.userEmail && !u.userName?.toLowerCase().includes("provisioner"))
    const hasProvisioner = users.some((u) => u.userName?.toLowerCase().includes("provisioner"))
    const owners = subToOwners.get(subOrg) ?? []
    subInfos.push({
      subOrg,
      humanEmail: (human?.userEmail ?? "").toLowerCase(),
      humanName: human?.userName ?? "",
      humanUserId: human?.userId ?? "",
      hasProvisioner,
      linkedWalletOwnerId: owners[0]?.id ?? null,
      ownerRef: owners[0]?.owner_ref ?? null,
    })
  }

  printDupes(
    "Turnkey: same human root email on multiple sub-orgs",
    groupBy(
      subInfos.filter((s) => s.humanEmail),
      (s) => s.humanEmail,
    ),
  )

  console.log("\n=== Turnkey sub-org → multiple wallet_owners ===")
  const multiLinked = [...subToOwners.entries()].filter(([, rows]) => rows.length > 1)
  if (!multiLinked.length) console.log("(none)")
  else for (const [subOrg, rows] of multiLinked) console.log(subOrg, rows)

  const orphans = subInfos.filter((s) => !linkedSubs.has(s.subOrg))
  console.log(`\n=== Turnkey sub-orgs without wallet_owners link (${orphans.length}) ===`)
  for (const o of orphans) {
    console.log({
      subOrg: o.subOrg,
      email: o.humanEmail || "(no human root)",
      name: o.humanName,
      hasProvisioner: o.hasProvisioner,
    })
  }

  // --- Email mismatches: auth vs Turnkey root for linked sub-orgs ---
  console.log("\n=== Linked sub-orgs: auth email ≠ Turnkey root email ===")
  const mismatches: unknown[] = []
  for (const row of wo) {
    const sub = String(row.turnkey_sub_organization_id ?? "")
    if (!sub) continue
    const info = subInfos.find((s) => s.subOrg === sub)
    if (!info?.humanEmail) continue

    let authEmail: string | null = null
    if (row.owner_type === "individual") {
      const auth = await admin.auth.admin.getUserById(String(row.owner_ref))
      authEmail = auth.data.user?.email?.toLowerCase() ?? null
    } else if (row.owner_type === "business") {
      const { data: members } = await admin
        .from("business_memberships")
        .select("user_id,role")
        .eq("business_id", row.owner_ref)
        .eq("role", "owner")
        .eq("status", "active")
        .limit(1)
      const ownerId = members?.[0]?.user_id
      if (ownerId) {
        const auth = await admin.auth.admin.getUserById(ownerId)
        authEmail = auth.data.user?.email?.toLowerCase() ?? null
      }
    }

    if (authEmail && authEmail !== info.humanEmail) {
      mismatches.push({
        wallet_owner_id: row.id,
        owner_type: row.owner_type,
        owner_ref: row.owner_ref,
        turnkey_sub_org: sub,
        auth_email: authEmail,
        turnkey_root_email: info.humanEmail,
      })
    }
  }
  console.log(mismatches.length ? mismatches : "(none)")

  // --- Summary ---
  console.log("\n=== SUMMARY ===")
  console.log(`wallet_owners: ${wo.length}`)
  console.log(`Turnkey sub-orgs: ${subInfos.length}`)
  console.log(`Linked sub-orgs: ${subInfos.filter((s) => linkedSubs.has(s.subOrg)).length}`)
  console.log(`Orphan Turnkey sub-orgs: ${orphans.length}`)
  console.log(`Auth email dupes: ${authDupes.length}`)
  console.log(`Users email dupes: ${[...groupBy(userRows.filter((u) => u.email), (u) => String(u.email).toLowerCase())].filter(([, v]) => v.length > 1).length}`)
  console.log(`Owner_ref dupes: ${[...groupBy(wo, (r) => `${r.owner_type}:${r.owner_ref}`)].filter(([, v]) => v.length > 1).length}`)
  console.log(`Sub-org ID dupes in DB: ${[...groupBy(wo.filter((r) => r.turnkey_sub_organization_id), (r) => String(r.turnkey_sub_organization_id))].filter(([, v]) => v.length > 1).length}`)
  console.log(`Email mismatches (linked): ${mismatches.length}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
