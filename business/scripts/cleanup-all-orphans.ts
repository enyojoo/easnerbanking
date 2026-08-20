#!/usr/bin/env npx tsx
/**
 * Remove Supabase ghost wallet_owners (no auth/users) + unlinked zero-balance Turnkey sub-orgs.
 * Skips sub-orgs without Easner provisioner (cannot delete via server API).
 *
 * Usage:
 *   cd business
 *   npx tsx scripts/cleanup-all-orphans.ts
 *   npx tsx scripts/cleanup-all-orphans.ts --execute
 */

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
import { fetchStablecoinBalancesFromAta } from "@/lib/solana/ata-balances"
import { createSolanaRpcConnection } from "@/lib/solana/rpc-connection"

type GwClient = {
  getSubOrgIds: (p: { paginationOptions?: { limit?: string; cursor?: string } }) => Promise<{
    organizationIds?: string[]
  }>
  getUsers: (p: { organizationId: string }) => Promise<{
    users?: Array<{ userId: string; userName?: string; userEmail?: string }>
  }>
  getWallets: (p: { organizationId: string }) => Promise<{ wallets?: Array<{ walletId?: string; walletName?: string }> }>
  getWalletAccounts: (p: { organizationId: string; walletId: string }) => Promise<{
    accounts?: Array<{ address?: string }>
    walletAccounts?: Array<{ address?: string }>
  }>
  deleteSubOrganization: (p: { organizationId: string; deleteWithoutExport: boolean }) => Promise<{
    activity?: { id?: string; status?: string }
  }>
}

type GhostOwner = {
  walletOwnerId: string
  ownerRef: string
  subOrg: string
  label: string
}

type OrphanSubOrg = {
  subOrg: string
  label: string
  email: string
  hasProvisioner: boolean
}

async function listAllSubOrgIds(client: GwClient): Promise<string[]> {
  const ids: string[] = []
  for (let page = 0; page < 50; page++) {
    const res = await client.getSubOrgIds({
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

async function vaultBalances(client: GwClient, subOrg: string) {
  const rows: Array<{ asset: string; address: string }> = []
  for (const w of (await client.getWallets({ organizationId: subOrg })).wallets ?? []) {
    const name = String(w.walletName ?? "").toLowerCase()
    const asset = name.includes("usdc") ? "USDC" : name.includes("eurc") ? "EURC" : null
    if (!asset) continue
    const walletId = String(w.walletId ?? "")
    if (!walletId) continue
    const acctRes = await client.getWalletAccounts({ organizationId: subOrg, walletId })
    for (const a of acctRes.accounts ?? acctRes.walletAccounts ?? []) {
      const address = String(a.address ?? "").trim()
      if (!address || address.startsWith("0x")) continue
      rows.push({ asset, address })
    }
  }
  return fetchStablecoinBalancesFromAta(rows, createSolanaRpcConnection())
}

async function discoverTargets(admin: ReturnType<typeof createSupabaseAdmin>, client: GwClient) {
  const { data: walletOwners, error } = await admin
    .from("wallet_owners")
    .select("id,owner_type,owner_ref,turnkey_sub_organization_id")
  if (error) throw new Error(error.message)

  const ghosts: GhostOwner[] = []
  for (const wo of walletOwners ?? []) {
    if (wo.owner_type !== "individual") continue
    const ownerRef = String(wo.owner_ref)
    const auth = await admin.auth.admin.getUserById(ownerRef)
    const { data: profile } = await admin.from("users").select("id").eq("id", ownerRef).maybeSingle()
    if (auth.data.user || profile) continue

    const { data: accts } = await admin
      .from("wallet_accounts")
      .select("asset,address,associated_token_account_address")
      .eq("wallet_owner_id", wo.id)
    const bal = await fetchStablecoinBalancesFromAta(accts ?? [], createSolanaRpcConnection())
    if (bal.USD !== 0 || bal.EUR !== 0) {
      throw new Error(`Ghost wallet_owner ${wo.id} has non-zero balance: $${bal.USD}/€${bal.EUR}`)
    }

    const { data: bals } = await admin.from("wallet_balances").select("currency,available_balance").eq("user_id", ownerRef)
    for (const row of bals ?? []) {
      if (Number(row.available_balance) !== 0) {
        throw new Error(`Ghost wallet_balances non-zero for ${ownerRef}: ${row.currency}=${row.available_balance}`)
      }
    }

    ghosts.push({
      walletOwnerId: wo.id,
      ownerRef,
      subOrg: String(wo.turnkey_sub_organization_id ?? ""),
      label: `ghost ${ownerRef.slice(0, 8)}`,
    })
  }

  const ghostOwnerIds = new Set(ghosts.map((g) => g.walletOwnerId))
  const protectedSubs = new Set(
    (walletOwners ?? [])
      .filter((w) => !ghostOwnerIds.has(w.id))
      .map((w) => String(w.turnkey_sub_organization_id ?? "").trim())
      .filter(Boolean),
  )

  const subOrgIds = await listAllSubOrgIds(client)
  const orphans: OrphanSubOrg[] = []
  const skippedNoProvisioner: OrphanSubOrg[] = []

  for (const subOrg of subOrgIds) {
    if (protectedSubs.has(subOrg)) continue

    let users: Array<{ userId: string; userName?: string; userEmail?: string }> = []
    try {
      const res = await client.getUsers({ organizationId: subOrg })
      users = res.users ?? []
    } catch {
      continue
    }

    const human = users.find((u) => u.userEmail && !u.userName?.toLowerCase().includes("provisioner"))
    const hasProvisioner = users.some((u) => u.userName?.toLowerCase().includes("provisioner"))
    const email = (human?.userEmail ?? "unknown").toLowerCase()
    const item: OrphanSubOrg = {
      subOrg,
      label: `${email || "unknown"} orphan`,
      email,
      hasProvisioner,
    }

    const bal = await vaultBalances(client, item.subOrg)
    if (bal.USD !== 0 || bal.EUR !== 0) {
      throw new Error(`Orphan ${subOrg} (${email}) has funds: $${bal.USD}/€${bal.EUR}`)
    }

    if (hasProvisioner) orphans.push(item)
    else skippedNoProvisioner.push(item)
  }

  return { protectedSubs, ghosts, orphans, skippedNoProvisioner, walletOwnerCount: walletOwners?.length ?? 0 }
}

async function deleteGhostSupabase(admin: ReturnType<typeof createSupabaseAdmin>, ghost: GhostOwner, execute: boolean) {
  console.log(`\n– Supabase ghost ${ghost.label} –`)
  console.log(`  wallet_owner: ${ghost.walletOwnerId}`)
  console.log(`  owner_ref:    ${ghost.ownerRef}`)
  console.log(`  sub-org:      ${ghost.subOrg}`)

  const { data: wo } = await admin.from("wallet_owners").select("id").eq("id", ghost.walletOwnerId).maybeSingle()
  if (!wo) {
    console.log("  already deleted")
    return
  }

  if (!execute) {
    console.log("  would delete wallet_balances, wallet_accounts, wallet_owner")
    return
  }

  const delBal = await admin.from("wallet_balances").delete().eq("user_id", ghost.ownerRef)
  if (delBal.error) throw new Error(`wallet_balances: ${delBal.error.message}`)

  const delAcct = await admin.from("wallet_accounts").delete().eq("wallet_owner_id", ghost.walletOwnerId)
  if (delAcct.error) throw new Error(`wallet_accounts: ${delAcct.error.message}`)

  const delWo = await admin.from("wallet_owners").delete().eq("id", ghost.walletOwnerId)
  if (delWo.error) throw new Error(`wallet_owners: ${delWo.error.message}`)

  console.log("  deleted")
}

async function deleteTurnkeySubOrg(client: GwClient, item: OrphanSubOrg, execute: boolean) {
  console.log(`\n– Turnkey ${item.label} (${item.subOrg}) –`)
  if (!execute) {
    console.log("  would deleteSubOrganization")
    return "dry"
  }

  try {
    const result = await client.deleteSubOrganization({
      organizationId: item.subOrg,
      deleteWithoutExport: true,
    })
    console.log("  activity:", { id: result.activity?.id, status: result.activity?.status })
    if (result.activity?.status !== "ACTIVITY_STATUS_COMPLETED") {
      throw new Error("activity not completed")
    }
    console.log("  deleted")
    return "ok"
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.log("  FAILED:", msg.slice(0, 200))
    return "failed"
  }
}

async function main() {
  const execute = process.argv.includes("--execute")
  const client = getTurnkeyApiClient() as unknown as GwClient
  const admin = createSupabaseAdmin()
  if (!client) throw new Error("Turnkey not configured")

  console.log(execute ? "EXECUTE mode" : "DRY RUN (pass --execute to apply)")

  const plan = await discoverTargets(admin, client)
  console.log(`\nPlan:`)
  console.log(`  protected linked sub-orgs: ${plan.protectedSubs.size}`)
  console.log(`  Supabase ghosts to remove:  ${plan.ghosts.length}`)
  console.log(`  Turnkey orphans to delete:  ${plan.orphans.length}`)
  console.log(`  skipped (no provisioner):   ${plan.skippedNoProvisioner.length}`)

  if (plan.skippedNoProvisioner.length) {
    console.log("\nSkipped (manual Turnkey dashboard only):")
    for (const s of plan.skippedNoProvisioner) {
      console.log(`  ${s.subOrg}  ${s.email}`)
    }
  }

  for (const ghost of plan.ghosts) {
    await deleteGhostSupabase(admin, ghost, execute)

    if (!ghost.subOrg) continue
    const res = await client.getUsers({ organizationId: ghost.subOrg })
    const hasProvisioner = (res.users ?? []).some((u) => u.userName?.toLowerCase().includes("provisioner"))
    if (!hasProvisioner) {
      console.log(`\n– Ghost Turnkey ${ghost.subOrg} skipped (no provisioner) –`)
      continue
    }
    await deleteTurnkeySubOrg(
      client,
      { subOrg: ghost.subOrg, label: `${ghost.label} turnkey`, email: "", hasProvisioner: true },
      execute,
    )
  }

  let deleted = 0
  let failed = 0
  for (const orphan of plan.orphans) {
    if (plan.protectedSubs.has(orphan.subOrg)) {
      throw new Error(`Refusing to delete linked sub-org ${orphan.subOrg}`)
    }
    const ghostSubs = new Set(plan.ghosts.map((g) => g.subOrg).filter(Boolean))
    if (ghostSubs.has(orphan.subOrg)) continue
    const result = await deleteTurnkeySubOrg(client, orphan, execute)
    if (result === "ok") deleted++
    if (result === "failed") failed++
  }

  if (execute) {
    const { count } = await admin.from("wallet_owners").select("*", { count: "exact", head: true })
    const subs = await listAllSubOrgIds(client)
    console.log(`\nDone. wallet_owners: ${count}, Turnkey sub-orgs: ${subs.length}`)
    console.log(`Turnkey deleted: ${deleted}, failed: ${failed}, skipped: ${plan.skippedNoProvisioner.length}`)
  } else {
    console.log("\nDry run complete. Re-run with --execute to apply.")
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
