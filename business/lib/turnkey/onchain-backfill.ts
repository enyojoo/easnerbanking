import type { SupabaseClient } from "@supabase/supabase-js"
import { Connection, PublicKey } from "@solana/web3.js"
import { deriveStablecoinAssociatedTokenAddress } from "@/lib/solana/ata"
import { ingestTurnkeySolanaTxForOwnerVault } from "@/lib/turnkey/ingest-solana-ledger-tx"

function getRpcUrl(): string {
  return (process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com").trim()
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message?: unknown }).message ?? "unknown_error")
  }
  try {
    return JSON.stringify(e)
  } catch {
    return String(e)
  }
}

function extractOwnerContext(
  ownerType: string,
  ownerRef: string,
  firstBusinessUserId: string | null,
): { userId: string | null; businessId: string | null } {
  if (ownerType === "business") return { userId: firstBusinessUserId, businessId: ownerRef }
  return { userId: ownerRef, businessId: null }
}

function mergeSignatureLists(
  lists: { signature: string; blockTime?: number | null }[][],
): { signature: string; blockTime: number | null }[] {
  const map = new Map<string, number | null>()
  for (const list of lists) {
    for (const x of list) {
      const prev = map.get(x.signature)
      const bt = x.blockTime ?? prev ?? null
      map.set(x.signature, bt)
    }
  }
  return [...map.entries()]
    .map(([signature, blockTime]) => ({ signature, blockTime }))
    .sort((a, b) => {
      const ta = a.blockTime ?? 0
      const tb = b.blockTime ?? 0
      return tb - ta
    })
}

export async function backfillTurnkeyOnchainTransactions(
  admin: SupabaseClient,
  input?: { signaturesPerAddress?: number; walletOwnerId?: string },
): Promise<{
  addressesScanned: number
  signaturesScanned: number
  upserts: number
  skipped: number
  skipReasons: Record<string, number>
}> {
  const limit = Math.max(1, Math.min(200, Math.floor(input?.signaturesPerAddress ?? 120)))
  const connection = new Connection(getRpcUrl(), "confirmed")

  let accQuery = admin
    .from("wallet_accounts")
    .select("wallet_owner_id,address,asset,chain,associated_token_account_address")
    .eq("status", "active")
    .eq("chain", "solana")
    .in("asset", ["USDC", "EURC"])

  const ownerFilter = String(input?.walletOwnerId ?? "").trim()
  if (ownerFilter) {
    accQuery = accQuery.eq("wallet_owner_id", ownerFilter)
  }

  const { data: accounts } = await accQuery

  const rows = (accounts || []).filter((r) => String(r.address || "").trim())
  let signaturesScanned = 0
  let upserts = 0
  let skipped = 0
  const skipReasons: Record<string, number> = {}
  const bump = (k: string) => {
    skipReasons[k] = (skipReasons[k] ?? 0) + 1
  }

  for (const row of rows) {
    const walletAddress = String(row.address || "").trim()
    const walletOwnerId = String(row.wallet_owner_id || "").trim()
    const asset = String(row.asset || "").trim()
    if (!walletAddress || !walletOwnerId || (asset !== "USDC" && asset !== "EURC")) {
      skipped += 1
      bump("missing_wallet_address_or_owner_or_asset")
      continue
    }

    const { data: owner } = await admin
      .from("wallet_owners")
      .select("owner_type,owner_ref")
      .eq("id", walletOwnerId)
      .maybeSingle()
    if (!owner?.owner_type || !owner?.owner_ref) {
      skipped += 1
      bump("missing_wallet_owner_record")
      continue
    }

    let firstBusinessUserId: string | null = null
    if (owner.owner_type === "business") {
      const { data: orgOwner } = await admin
        .from("users")
        .select("id")
        .eq("easner_business_id", String(owner.owner_ref))
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()
      firstBusinessUserId = orgOwner?.id ? String(orgOwner.id) : null
    }
    const ctx = extractOwnerContext(
      String(owner.owner_type),
      String(owner.owner_ref),
      firstBusinessUserId,
    )
    if (!ctx.userId) {
      skipped += 1
      bump("missing_user_context")
      continue
    }

    let ownerPk: PublicKey
    try {
      ownerPk = new PublicKey(walletAddress)
    } catch {
      skipped += 1
      bump("invalid_wallet_address")
      continue
    }

    const ataStored = String(row.associated_token_account_address || "").trim()
    const ata =
      ataStored ||
      deriveStablecoinAssociatedTokenAddress(walletAddress, asset) ||
      ""
    let ataPk: PublicKey | null = null
    if (ata) {
      try {
        ataPk = new PublicKey(ata)
      } catch {
        ataPk = null
      }
    }

    const sigLists: { signature: string; blockTime?: number | null | undefined }[][] = []
    try {
      sigLists.push(await connection.getSignaturesForAddress(ownerPk, { limit }))
    } catch (e) {
      const msg = errorMessage(e)
      bump(`rpc_get_signatures_owner:${msg.slice(0, 80)}`)
    }
    if (ataPk) {
      try {
        sigLists.push(await connection.getSignaturesForAddress(ataPk, { limit }))
      } catch (e) {
        const msg = errorMessage(e)
        bump(`rpc_get_signatures_ata:${msg.slice(0, 80)}`)
      }
    }

    const sigs = mergeSignatureLists(sigLists)
    signaturesScanned += sigs.length

    for (const sig of sigs) {
      const res = await ingestTurnkeySolanaTxForOwnerVault(admin, {
        ownerAddress: walletAddress,
        asset,
        ctx: { userId: ctx.userId, businessId: ctx.businessId },
        signature: sig.signature,
        blockTime: sig.blockTime,
        connection,
      })
      if (res.kind === "applied") upserts += res.upserts
      if (res.kind === "error") {
        skipped += 1
        bump(res.reason)
      }
    }
  }

  return {
    addressesScanned: rows.length,
    signaturesScanned,
    upserts,
    skipped,
    skipReasons,
  }
}
