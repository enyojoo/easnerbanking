#!/usr/bin/env npx tsx
/**
 * Remove ghost wallet_owner (99fad1d4) + zero-balance orphan Turnkey sub-orgs.
 * Does NOT touch any other Supabase wallet_owners.
 *
 * Usage:
 *   cd business
 *   npx tsx scripts/cleanup-orphan-turnkey-suborgs.ts
 *   npx tsx scripts/cleanup-orphan-turnkey-suborgs.ts --execute
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

const GHOST = {
  label: "ghost 99fad1d4",
  walletOwnerId: "1e4d3bed-8ce4-43b0-ad42-b79092034ed9",
  ownerRef: "99fad1d4-5187-431f-8aeb-29514aa2ed86",
  subOrg: "62b87ad8-bb38-419b-b1e8-1289d9475e9c",
}

const ORPHAN_SUB_ORGS: Array<{ label: string; subOrg: string }> = [
  { label: "hello orphan 1", subOrg: "aa580d4a-3895-4789-8d0d-730b830e117e" },
  { label: "hello orphan 2", subOrg: "27d01f45-bc48-4e0d-b528-346d9fed663d" },
  { label: "enyo orphan 1", subOrg: "e75e43be-73f1-4640-a1bd-f8415313232a" },
  { label: "enyo orphan 2", subOrg: "d1f97029-da50-4b71-9aa8-159310733049" },
  { label: "enyoc orphan 1", subOrg: "04820d36-a8c5-4527-ac59-96036ec8d553" },
  { label: "enyoc orphan 2", subOrg: "05246b87-5dab-4760-8d9f-98e3f1f839ba" },
  { label: "enyoc orphan 3", subOrg: "3bed889f-eeb4-49c3-9c15-dc105dcdfe9d" },
]

type GwClient = {
  getWallets: (p: { organizationId: string }) => Promise<{ wallets?: Array<{ walletId?: string; walletName?: string }> }>
  getWalletAccounts: (p: { organizationId: string; walletId: string }) => Promise<{
    accounts?: Array<{ address?: string }>
    walletAccounts?: Array<{ address?: string }>
  }>
  deleteSubOrganization: (p: { organizationId: string; deleteWithoutExport: boolean }) => Promise<{
    activity?: { id?: string; status?: string }
  }>
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

async function assertSafeToProceed(
  admin: ReturnType<typeof createSupabaseAdmin>,
  client: GwClient,
) {
  const { data: allOwners, error } = await admin
    .from("wallet_owners")
    .select("id,owner_ref,turnkey_sub_organization_id")
  if (error) throw new Error(`wallet_owners load failed: ${error.message}`)

  const protectedSubs = new Set<string>()
  for (const wo of allOwners ?? []) {
    const sub = String(wo.turnkey_sub_organization_id ?? "").trim()
    if (!sub) continue
    if (wo.id === GHOST.walletOwnerId) continue
    protectedSubs.add(sub)
  }

  const deleteTargets = [GHOST.subOrg, ...ORPHAN_SUB_ORGS.map((o) => o.subOrg)]
  for (const sub of deleteTargets) {
    if (protectedSubs.has(sub)) {
      throw new Error(`Refusing to delete protected linked sub-org: ${sub}`)
    }
  }

  for (const sub of deleteTargets) {
    const { data: wo } = await admin
      .from("wallet_owners")
      .select("id,owner_ref")
      .eq("turnkey_sub_organization_id", sub)
      .maybeSingle()
    if (wo && wo.id !== GHOST.walletOwnerId) {
      throw new Error(`Unexpected wallet_owner on delete target ${sub}: ${wo.id}`)
    }
  }

  for (const item of [{ label: GHOST.label, subOrg: GHOST.subOrg }, ...ORPHAN_SUB_ORGS]) {
    const bal = await vaultBalances(client, item.subOrg)
    if (bal.USD !== 0 || bal.EUR !== 0) {
      throw new Error(`${item.label} has non-zero balance: $${bal.USD} / €${bal.EUR}`)
    }
  }

  const ghostBal = await admin
    .from("wallet_balances")
    .select("currency,available_balance")
    .eq("user_id", GHOST.ownerRef)
  for (const row of ghostBal.data ?? []) {
    if (Number(row.available_balance) !== 0) {
      throw new Error(`Ghost wallet_balances non-zero: ${row.currency}=${row.available_balance}`)
    }
  }

  console.log(`Safety OK: ${protectedSubs.size} protected sub-org(s), ${deleteTargets.length} delete target(s), all zero balance`)
  return { protectedCount: protectedSubs.size, deleteTargets }
}

async function deleteGhostSupabase(admin: ReturnType<typeof createSupabaseAdmin>, execute: boolean) {
  console.log("\n— Ghost Supabase cleanup —")
  const { data: wo } = await admin
    .from("wallet_owners")
    .select("id,owner_ref,turnkey_sub_organization_id")
    .eq("id", GHOST.walletOwnerId)
    .maybeSingle()
  if (!wo) {
    console.log("  wallet_owner already gone")
    return
  }
  if (wo.owner_ref !== GHOST.ownerRef || wo.turnkey_sub_organization_id !== GHOST.subOrg) {
    throw new Error("Ghost wallet_owner row does not match expected ids")
  }

  const { count: acctCount } = await admin
    .from("wallet_accounts")
    .select("*", { count: "exact", head: true })
    .eq("wallet_owner_id", GHOST.walletOwnerId)
  const { count: balCount } = await admin
    .from("wallet_balances")
    .select("*", { count: "exact", head: true })
    .eq("user_id", GHOST.ownerRef)

  console.log(`  would delete wallet_balances (${balCount ?? 0}), wallet_accounts (${acctCount ?? 0}), wallet_owner ${GHOST.walletOwnerId}`)
  if (!execute) return

  const delBal = await admin.from("wallet_balances").delete().eq("user_id", GHOST.ownerRef)
  if (delBal.error) throw new Error(`wallet_balances delete: ${delBal.error.message}`)

  const delAcct = await admin.from("wallet_accounts").delete().eq("wallet_owner_id", GHOST.walletOwnerId)
  if (delAcct.error) throw new Error(`wallet_accounts delete: ${delAcct.error.message}`)

  const delWo = await admin.from("wallet_owners").delete().eq("id", GHOST.walletOwnerId)
  if (delWo.error) throw new Error(`wallet_owners delete: ${delWo.error.message}`)

  console.log("  Supabase ghost rows deleted")
}

async function deleteTurnkeySubOrg(
  client: GwClient,
  item: { label: string; subOrg: string },
  execute: boolean,
) {
  console.log(`\n— Turnkey ${item.label} (${item.subOrg}) —`)
  if (!execute) {
    console.log("  would call deleteSubOrganization({ deleteWithoutExport: true })")
    return
  }

  const result = await client.deleteSubOrganization({
    organizationId: item.subOrg,
    deleteWithoutExport: true,
  })
  console.log("  activity:", {
    id: result.activity?.id,
    status: result.activity?.status,
  })
  if (result.activity?.status !== "ACTIVITY_STATUS_COMPLETED") {
    throw new Error(`deleteSubOrganization did not complete for ${item.subOrg}`)
  }

  try {
    await client.getWallets({ organizationId: item.subOrg })
    throw new Error(`Sub-org still reachable after delete: ${item.subOrg}`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/not found|invalid|permission|denied|404/i.test(msg)) {
      console.log("  confirmed removed (getWallets failed as expected)")
      return
    }
    console.log("  post-delete getWallets:", msg.slice(0, 120))
  }
}

async function main() {
  const execute = process.argv.includes("--execute")
  const client = getTurnkeyApiClient() as unknown as GwClient
  const admin = createSupabaseAdmin()
  if (!client) throw new Error("Turnkey not configured")

  console.log(execute ? "EXECUTE mode" : "DRY RUN (pass --execute to apply)")
  await assertSafeToProceed(admin, client)
  await deleteGhostSupabase(admin, execute)

  for (const item of [{ label: GHOST.label, subOrg: GHOST.subOrg }, ...ORPHAN_SUB_ORGS]) {
    await deleteTurnkeySubOrg(client, item, execute)
  }

  if (execute) {
    const { data: remaining } = await admin.from("wallet_owners").select("id").eq("id", GHOST.walletOwnerId)
    if (remaining?.length) throw new Error("Ghost wallet_owner still present after cleanup")
    console.log(`\nDone. wallet_owners count: ${(await admin.from("wallet_owners").select("*", { count: "exact", head: true })).count}`)
  } else {
    console.log("\nDry run complete. Re-run with --execute to apply.")
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
