import type { SupabaseClient } from "@supabase/supabase-js"
import { Connection, PublicKey } from "@solana/web3.js"
import { deriveStablecoinAssociatedTokenAddress } from "@/lib/solana/ata"
import { ingestTurnkeySolanaTxForOwnerVault } from "@/lib/turnkey/ingest-solana-ledger-tx"

function getRpcUrl(): string {
  return (process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com").trim()
}

type LedgerScope = { userId: string; businessId: string | null }

async function resolveLedgerCtx(
  admin: SupabaseClient,
  walletOwnerId: string,
): Promise<LedgerScope | null> {
  const { data: owner } = await admin
    .from("wallet_owners")
    .select("owner_type, owner_ref")
    .eq("id", walletOwnerId)
    .maybeSingle()
  if (!owner?.owner_ref || !owner?.owner_type) return null

  if (owner.owner_type === "business") {
    const businessId = String(owner.owner_ref)
    const { data: orgOwner } = await admin
      .from("users")
      .select("id")
      .eq("easner_business_id", businessId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    return orgOwner?.id
      ? { userId: String(orgOwner.id), businessId }
      : null
  }
  return { userId: String(owner.owner_ref), businessId: null }
}

/**
 * ATA-first scan: ingest recent inbound deposits missing from `transactions` (feed source).
 * Runs when Turnkey balance webhooks are absent; complements generic signature backfill.
 */
export async function syncOrganicInboundDepositsForOwner(
  admin: SupabaseClient,
  input: {
    walletOwnerId: string
    signaturesPerAta?: number
    throttleMs?: number
  },
): Promise<{
  ataAddressesScanned: number
  signaturesScanned: number
  ingested: number
  noopReasons: Record<string, number>
}> {
  const limit = Math.max(5, Math.min(60, Math.floor(input.signaturesPerAta ?? 35)))
  const throttleMs = Math.max(0, Math.min(300, Math.floor(input.throttleMs ?? 100)))
  const ctx = await resolveLedgerCtx(admin, input.walletOwnerId)
  if (!ctx) {
    return { ataAddressesScanned: 0, signaturesScanned: 0, ingested: 0, noopReasons: { no_owner_ctx: 1 } }
  }

  const { data: accounts } = await admin
    .from("wallet_accounts")
    .select("id, address, asset, associated_token_account_address")
    .eq("wallet_owner_id", input.walletOwnerId)
    .eq("status", "active")
    .eq("chain", "solana")
    .in("asset", ["USDC", "EURC"])

  const connection = new Connection(getRpcUrl(), "confirmed")
  let signaturesScanned = 0
  let ingested = 0
  const noopReasons: Record<string, number> = {}
  const bumpNoop = (r: string) => {
    noopReasons[r] = (noopReasons[r] ?? 0) + 1
  }

  let ataAddressesScanned = 0

  for (const row of accounts ?? []) {
    const ownerAddress = String(row.address || "").trim()
    const asset = String(row.asset || "").trim() as "USDC" | "EURC"
    if (!ownerAddress || (asset !== "USDC" && asset !== "EURC")) continue

    const ata =
      String(row.associated_token_account_address || "").trim() ||
      deriveStablecoinAssociatedTokenAddress(ownerAddress, asset) ||
      ""
    if (!ata) continue

    let ataPk: PublicKey
    try {
      ataPk = new PublicKey(ata)
    } catch {
      continue
    }
    ataAddressesScanned += 1

    let sigs: { signature: string; blockTime?: number | null }[] = []
    try {
      sigs = await connection.getSignaturesForAddress(ataPk, { limit })
    } catch (e) {
      bumpNoop(`rpc_sigs:${e instanceof Error ? e.message.slice(0, 40) : "error"}`)
      continue
    }

    signaturesScanned += sigs.length

    let first = true
    for (const sig of sigs) {
      if (!first && throttleMs > 0) await new Promise((r) => setTimeout(r, throttleMs))
      first = false

      const res = await ingestTurnkeySolanaTxForOwnerVault(admin, {
        ownerAddress,
        asset,
        ctx,
        walletAccountId: String(row.id),
        signature: sig.signature,
        blockTime: sig.blockTime ?? null,
        connection,
        tokenAccountAddress: ata,
        skipBalanceDelta: true,
        skipIfLedgerRowExists: true,
      })
      if (res.kind === "applied") ingested += res.upserts
      else if (res.kind === "noop" && res.reason) bumpNoop(res.reason)
      else if (res.kind === "error" && res.reason) bumpNoop(res.reason)
    }
  }

  return { ataAddressesScanned, signaturesScanned, ingested, noopReasons }
}
