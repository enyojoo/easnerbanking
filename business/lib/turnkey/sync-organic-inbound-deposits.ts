import type { SupabaseClient } from "@supabase/supabase-js"
import type { Connection } from "@solana/web3.js"
import { PublicKey } from "@solana/web3.js"
import { deriveStablecoinAssociatedTokenAddress } from "@/lib/solana/ata"
import { createSolanaRpcConnection, isSolanaRpcRateLimitedError } from "@/lib/solana/rpc-connection"
import { turnkeyInboundLedgerRowExists } from "@/lib/turnkey/ledger-inbound-exists"
import { ingestTurnkeySolanaTxForOwnerVault } from "@/lib/turnkey/ingest-solana-ledger-tx"

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
 * ATA-only scan for missing inbound deposits. Parses only signatures not already in the ledger (RPC-efficient).
 */
export async function syncOrganicInboundDepositsForOwner(
  admin: SupabaseClient,
  input: {
    walletOwnerId: string
    connection?: Connection
    signaturesPerAta?: number
    throttleMs?: number
    /** Max `getParsedTransaction` calls per vault per run (default 5). */
    maxParsePerAccount?: number
    /** Stop entire run after this many new rows ingested (default 4). */
    maxIngestPerRun?: number
  },
): Promise<{
  ataAddressesScanned: number
  signaturesListed: number
  signaturesParsed: number
  ingested: number
  rateLimited: boolean
  noopReasons: Record<string, number>
}> {
  const listLimit = Math.max(3, Math.min(20, Math.floor(input.signaturesPerAta ?? 8)))
  const throttleMs = Math.max(150, Math.min(500, Math.floor(input.throttleMs ?? 280)))
  const maxParsePerAccount = Math.max(1, Math.min(10, Math.floor(input.maxParsePerAccount ?? 5)))
  const maxIngestPerRun = Math.max(1, Math.min(8, Math.floor(input.maxIngestPerRun ?? 4)))

  const ctx = await resolveLedgerCtx(admin, input.walletOwnerId)
  if (!ctx) {
    return {
      ataAddressesScanned: 0,
      signaturesListed: 0,
      signaturesParsed: 0,
      ingested: 0,
      rateLimited: false,
      noopReasons: { no_owner_ctx: 1 },
    }
  }

  const { data: accounts } = await admin
    .from("wallet_accounts")
    .select("id, address, asset, associated_token_account_address")
    .eq("wallet_owner_id", input.walletOwnerId)
    .eq("status", "active")
    .eq("chain", "solana")
    .in("asset", ["USDC", "EURC"])

  const connection = input.connection ?? createSolanaRpcConnection()
  let signaturesListed = 0
  let signaturesParsed = 0
  let ingested = 0
  let rateLimited = false
  const noopReasons: Record<string, number> = {}
  const bumpNoop = (r: string) => {
    noopReasons[r] = (noopReasons[r] ?? 0) + 1
  }

  let ataAddressesScanned = 0

  for (const row of accounts ?? []) {
    if (rateLimited || ingested >= maxIngestPerRun) break

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
      sigs = await connection.getSignaturesForAddress(ataPk, { limit: listLimit })
    } catch (e) {
      if (isSolanaRpcRateLimitedError(e)) rateLimited = true
      bumpNoop(`rpc_sigs:${e instanceof Error ? e.message.slice(0, 40) : "error"}`)
      break
    }

    signaturesListed += sigs.length
    let parsedThisAccount = 0

    for (const sig of sigs) {
      if (rateLimited || ingested >= maxIngestPerRun || parsedThisAccount >= maxParsePerAccount) break

      const exists = await turnkeyInboundLedgerRowExists(admin, {
        signature: sig.signature,
        userId: ctx.userId,
        businessId: ctx.businessId,
      })
      if (exists) {
        bumpNoop("already_in_ledger")
        continue
      }

      if (parsedThisAccount > 0 && throttleMs > 0) {
        await new Promise((r) => setTimeout(r, throttleMs))
      }
      parsedThisAccount += 1
      signaturesParsed += 1

      try {
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
          skipIfLedgerRowExists: false,
        })
        if (res.kind === "applied") ingested += res.upserts
        else if (res.kind === "noop" && res.reason) bumpNoop(res.reason)
        else if (res.kind === "error") {
          bumpNoop(res.reason)
          if (res.reason.includes("429") || /rate/i.test(res.reason)) rateLimited = true
        }
      } catch (e) {
        if (isSolanaRpcRateLimitedError(e)) {
          rateLimited = true
          break
        }
        bumpNoop(`ingest:${e instanceof Error ? e.message.slice(0, 40) : "error"}`)
      }
    }
  }

  return {
    ataAddressesScanned,
    signaturesListed,
    signaturesParsed,
    ingested,
    rateLimited,
    noopReasons,
  }
}
