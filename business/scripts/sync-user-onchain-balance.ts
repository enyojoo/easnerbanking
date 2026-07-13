/**
 * Compare wallet_balances vs on-chain ATA for one user.
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/sync-user-onchain-balance.ts <userId>
 */
import { createSupabaseAdmin } from "../lib/supabase/admin"
import { syncWalletBalancesFromSolanaAtaForOwner } from "../lib/wallet/sync-wallet-balances-from-ata"
import { createSolanaRpcConnection } from "../lib/solana/rpc-connection"

const userId = process.argv[2]?.trim()
if (!userId) {
  console.error("Usage: sync-user-onchain-balance.ts <userId>")
  process.exit(1)
}

async function main() {
  const admin = createSupabaseAdmin()

  const { data: owner } = await admin
    .from("wallet_owners")
    .select("id")
    .eq("owner_type", "individual")
    .eq("owner_ref", userId)
    .maybeSingle()
  if (!owner?.id) throw new Error(`wallet_owner not found for user ${userId}`)

  const { data: before } = await admin
    .from("wallet_balances")
    .select("currency, available_balance, version, updated_at")
    .eq("user_id", userId)
    .eq("currency", "USD")
    .maybeSingle()

  console.log("before DB USD:", before)

  const sync = await syncWalletBalancesFromSolanaAtaForOwner(
    admin,
    String(owner.id),
    createSolanaRpcConnection(),
  )
  console.log("on-chain sync:", sync)

  const { data: after } = await admin
    .from("wallet_balances")
    .select("currency, available_balance, version, updated_at")
    .eq("user_id", userId)
    .eq("currency", "USD")
    .maybeSingle()

  console.log("after DB USD:", after)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
