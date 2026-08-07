import { createClient } from "@supabase/supabase-js"
import { deriveStablecoinAssociatedTokenAddress } from "../lib/solana/ata"
import { needsRelayDepositRecipientReprovision } from "../lib/relay-deposit/recipient"

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("supabase_not_configured")

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: rows } = await admin
    .from("relay_deposit_addresses")
    .select("wallet_owner_id, recipient_vault_ata, tron_address, metadata")
    .eq("route", "tron_usdt_to_sol_usdc")
    .eq("status", "active")

  const { data: vaults } = await admin
    .from("wallet_accounts")
    .select("wallet_owner_id, address")
    .eq("chain", "solana")
    .eq("asset", "USDC")
    .eq("status", "active")

  const vaultByOwner = new Map((vaults ?? []).map((v) => [v.wallet_owner_id, v.address]))
  let legacy = 0
  let ok = 0
  const bad: Array<Record<string, unknown>> = []

  for (const row of rows ?? []) {
    const vault = String(vaultByOwner.get(row.wallet_owner_id) ?? "")
    const stored = String(row.recipient_vault_ata ?? "")
    if (needsRelayDepositRecipientReprovision(stored, vault)) {
      legacy += 1
      bad.push({
        walletOwnerId: row.wallet_owner_id,
        stored,
        vault,
        ata: deriveStablecoinAssociatedTokenAddress(vault, "USDC"),
      })
    } else {
      ok += 1
    }
  }

  const { data: jobs } = await admin
    .from("relay_deposit_provision_jobs")
    .select("state")
    .in("state", ["pending", "retry", "dead_letter"])

  const jobCounts: Record<string, number> = {}
  for (const j of jobs ?? []) {
    jobCounts[j.state] = (jobCounts[j.state] ?? 0) + 1
  }

  console.log(
    JSON.stringify(
      {
        activeRows: rows?.length ?? 0,
        vaultRows: vaults?.length ?? 0,
        ok,
        legacy,
        jobCounts,
        badSample: bad.slice(0, 5),
      },
      null,
      2,
    ),
  )

  if (legacy > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
