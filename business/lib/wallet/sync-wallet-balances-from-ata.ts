import type { SupabaseClient } from "@supabase/supabase-js"
import type { Connection } from "@solana/web3.js"
import { fetchStablecoinBalancesFromAta } from "@/lib/solana/ata-balances"
import { upsertWalletBalanceSnapshot } from "@/lib/wallet/wallet-balances-db"

type OwnerScope = {
  businessId: string | null
  userId: string | null
}

async function resolveOwnerScope(
  admin: SupabaseClient,
  walletOwnerId: string,
): Promise<OwnerScope | null> {
  const { data: owner } = await admin
    .from("wallet_owners")
    .select("owner_type,owner_ref")
    .eq("id", walletOwnerId)
    .maybeSingle()
  if (!owner?.owner_type || !owner?.owner_ref) return null

  const ownerType = String(owner.owner_type).toLowerCase()
  const ownerRef = String(owner.owner_ref).trim()
  if (!ownerRef) return null

  if (ownerType === "business") {
    return { businessId: ownerRef, userId: null }
  }
  if (ownerType === "individual") {
    return { businessId: null, userId: ownerRef }
  }
  return null
}

/**
 * Overwrite `wallet_balances` from on-chain SPL ATA balances (source of truth).
 * Use after ledger backfill so historical tx replay does not drift balances via deltas.
 */
export async function syncWalletBalancesFromSolanaAtaForOwner(
  admin: SupabaseClient,
  walletOwnerId: string,
  connection?: Connection,
): Promise<{ ok: boolean; USD: number; EUR: number; reason?: string }> {
  const scope = await resolveOwnerScope(admin, walletOwnerId)
  if (!scope) return { ok: false, USD: 0, EUR: 0, reason: "missing_owner_scope" }

  const { data: accounts } = await admin
    .from("wallet_accounts")
    .select("address,asset,associated_token_account_address")
    .eq("wallet_owner_id", walletOwnerId)
    .eq("status", "active")
    .eq("chain", "solana")
    .in("asset", ["USDC", "EURC"])

  const rows = (accounts || []).filter((r) => String(r.address || "").trim())
  const { USD, EUR, readOk } = await fetchStablecoinBalancesFromAta(rows, connection)
  if (!readOk) {
    return { ok: false, USD: 0, EUR: 0, reason: "ata_balance_read_failed" }
  }

  await Promise.all([
    upsertWalletBalanceSnapshot(admin, {
      businessId: scope.businessId,
      userId: scope.userId,
      currency: "USD",
      availableBalance: USD,
    }),
    upsertWalletBalanceSnapshot(admin, {
      businessId: scope.businessId,
      userId: scope.userId,
      currency: "EUR",
      availableBalance: EUR,
    }),
  ])

  return { ok: true, USD, EUR }
}

export async function syncWalletBalancesFromSolanaAtaForOwners(
  admin: SupabaseClient,
  walletOwnerIds: string[],
): Promise<{
  ownersAttempted: number
  ownersWritten: number
  failures: Array<{ walletOwnerId: string; reason: string }>
}> {
  const unique = [...new Set(walletOwnerIds.map((id) => String(id).trim()).filter(Boolean))]
  let ownersWritten = 0
  const failures: Array<{ walletOwnerId: string; reason: string }> = []

  for (const ownerId of unique) {
    try {
      const res = await syncWalletBalancesFromSolanaAtaForOwner(admin, ownerId)
      if (res.ok) ownersWritten += 1
      else failures.push({ walletOwnerId: ownerId, reason: res.reason ?? "sync_failed" })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      failures.push({ walletOwnerId: ownerId, reason: msg.slice(0, 120) })
    }
  }

  return { ownersAttempted: unique.length, ownersWritten, failures }
}
