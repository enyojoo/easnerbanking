#!/usr/bin/env npx tsx
/** Read-only: Turnkey wallet inventory + on-chain balances for cleanup candidates. */
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

const ORPHANS = [
  { label: "hello orphan 1", subOrg: "aa580d4a-3895-4789-8d0d-730b830e117e" },
  { label: "hello orphan 2", subOrg: "27d01f45-bc48-4e0d-b528-346d9fed663d" },
  { label: "enyo orphan 1", subOrg: "e75e43be-73f1-4640-a1bd-f8415313232a" },
  { label: "enyo orphan 2", subOrg: "d1f97029-da50-4b71-9aa8-159310733049" },
  { label: "enyoc orphan 1", subOrg: "04820d36-a8c5-4527-ac59-96036ec8d553" },
  { label: "enyoc orphan 2", subOrg: "05246b87-5dab-4760-8d9f-98e3f1f839ba" },
  { label: "enyoc orphan 3", subOrg: "3bed889f-eeb4-49c3-9c15-dc105dcdfe9d" },
]
const GHOST = {
  label: "ghost 99fad1d4",
  subOrg: "62b87ad8-bb38-419b-b1e8-1289d9475e9c",
}
const KEEP = [
  { label: "KYB linked", subOrg: "4daf7b5f-2adb-46a3-8296-acf259dd9a67" },
  { label: "Samuel linked", subOrg: "ddd0463d-c476-4b5d-8789-ded021e4b549" },
]

type GwClient = {
  getWallets: (p: { organizationId: string }) => Promise<{ wallets?: Array<{ walletId?: string; walletName?: string }> }>
  getWalletAccounts: (p: {
    organizationId: string
    walletId?: string
    paginationOptions?: { limit?: string }
  }) => Promise<{
    accounts?: Array<{ address?: string; path?: string; walletId?: string }>
    walletAccounts?: Array<{ address?: string; path?: string; walletId?: string }>
  }>
}

async function turnkeyInventory(client: GwClient, subOrg: string) {
  const walletsRes = await client.getWallets({ organizationId: subOrg })
  const wallets = walletsRes.wallets ?? []
  const accounts: Array<{ walletId: string; walletName: string; address: string; path: string }> = []
  for (const w of wallets) {
    const walletId = String(w.walletId ?? "")
    const walletName = String(w.walletName ?? "")
    if (!walletId) continue
    const acctRes = await client.getWalletAccounts({ organizationId: subOrg, walletId })
    const rows = acctRes.accounts ?? acctRes.walletAccounts ?? []
    for (const a of rows) {
      const address = String(a.address ?? "").trim()
      if (!address) continue
      accounts.push({ walletId, walletName, address, path: String(a.path ?? "") })
    }
  }
  return { walletCount: wallets.length, accounts }
}

async function supabaseAccounts(admin: ReturnType<typeof createSupabaseAdmin>, subOrg: string) {
  const { data: wo } = await admin
    .from("wallet_owners")
    .select("id,owner_ref,owner_type,noah_customer_id")
    .eq("turnkey_sub_organization_id", subOrg)
    .maybeSingle()
  if (!wo?.id) return { walletOwner: null, accounts: [] as unknown[], balances: null }
  const { data: accts } = await admin
    .from("wallet_accounts")
    .select("asset,chain,address,status,associated_token_account_address")
    .eq("wallet_owner_id", wo.id)
  const conn = createSolanaRpcConnection()
  const balances = await fetchStablecoinBalancesFromAta(accts ?? [], conn)
  return { walletOwner: wo, accounts: accts ?? [], balances }
}

async function turnkeyVaultBalances(
  client: GwClient,
  subOrg: string,
  conn: ReturnType<typeof createSolanaRpcConnection>,
) {
  const walletsRes = await client.getWallets({ organizationId: subOrg })
  const rows: Array<{ asset: string; address: string }> = []
  for (const w of walletsRes.wallets ?? []) {
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
  const balances = await fetchStablecoinBalancesFromAta(rows, conn)
  return { vaultRows: rows, balances }
}

async function auditItem(
  client: GwClient,
  admin: ReturnType<typeof createSupabaseAdmin>,
  item: { label: string; subOrg: string },
) {
  console.log(`--- ${item.label} (${item.subOrg}) ---`)
  let tk = { walletCount: 0, accounts: [] as Array<{ walletId: string; walletName: string; address: string; path: string }> }
  try {
    tk = await turnkeyInventory(client, item.subOrg)
    console.log("Turnkey wallets:", tk.walletCount)
    console.log("Turnkey accounts:", tk.accounts.length ? tk.accounts : "(none)")
  } catch (e) {
    console.log("Turnkey error:", e instanceof Error ? e.message : e)
  }
  const conn = createSolanaRpcConnection()
  let vaultBal = null as Awaited<ReturnType<typeof turnkeyVaultBalances>> | null
  try {
    vaultBal = await turnkeyVaultBalances(client, item.subOrg, conn)
    console.log("Turnkey vault addresses:", vaultBal.vaultRows.length ? vaultBal.vaultRows : "(none)")
    console.log("Turnkey vault on-chain (USD/EUR):", vaultBal.balances)
  } catch (e) {
    console.log("Vault balance error:", e instanceof Error ? e.message : e)
  }

  const sb = await supabaseAccounts(admin, item.subOrg)
  console.log("Supabase wallet_owner:", sb.walletOwner ?? "NONE")
  console.log("Supabase accounts:", sb.accounts.length ? sb.accounts : "(none)")
  if (sb.balances) console.log("On-chain balances (USD/EUR):", sb.balances)

  const vaultZero = vaultBal == null || (vaultBal.balances.USD === 0 && vaultBal.balances.EUR === 0)
  const sbZero = sb.balances == null || (sb.balances.USD === 0 && sb.balances.EUR === 0)
  const isGhost = Boolean(sb.walletOwner) && !sb.walletOwner?.owner_ref?.startsWith?.("c7ace38e")
  const safeToDelete =
    vaultZero &&
    sbZero &&
    (isGhost || !sb.walletOwner)
  const deleteNote = isGhost
    ? safeToDelete
      ? "YES — ghost: delete Supabase rows + Turnkey sub-org"
      : "NO — ghost has funds or unreadable balance"
    : safeToDelete
      ? "YES (zero balance, no DB link)"
      : "NO — review"
  console.log("Safe to delete:", deleteNote)
  console.log("")
  return { ...item, tk, sb, vaultBal, safeToDelete }
}

async function main() {
  const client = getTurnkeyApiClient() as unknown as GwClient
  const admin = createSupabaseAdmin()
  if (!client) throw new Error("Turnkey not configured")

  console.log("=== CLEANUP CANDIDATE INVENTORY ===\n")
  const results = []
  for (const item of [...ORPHANS, GHOST]) {
    results.push(await auditItem(client, admin, item))
  }

  console.log("=== PRODUCTION (control) ===\n")
  for (const item of KEEP) {
    await auditItem(client, admin, item)
  }

  console.log("=== SUMMARY ===")
  for (const r of results) {
    const vault = r.vaultBal?.balances
    console.log(
      `${r.safeToDelete ? "✓" : "✗"} ${r.label}: tkVaults=$${vault?.USD ?? "?"} €${vault?.EUR ?? "?"} sbOwner=${r.sb.walletOwner ? "yes" : "no"} sbBal=${r.sb.balances ? `$${r.sb.balances.USD}/€${r.sb.balances.EUR}` : "n/a"}`,
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
