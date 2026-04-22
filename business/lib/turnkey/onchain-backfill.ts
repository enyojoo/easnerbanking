import type { SupabaseClient } from "@supabase/supabase-js"
import { Connection, PublicKey } from "@solana/web3.js"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { applyWalletBalanceDelta } from "@/lib/wallet/wallet-balances-db"

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
const EURC_MINT = "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr"

function getRpcUrl(): string {
  return (process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com").trim()
}

function atomicToMajor(amount: bigint, decimals: number): number {
  const divisor = 10 ** Math.max(0, Math.min(9, decimals))
  return Number(amount) / divisor
}

function parseAtomic(raw: string | undefined): bigint {
  if (!raw || !/^-?\d+$/.test(raw)) return 0n
  try {
    return BigInt(raw)
  } catch {
    return 0n
  }
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
    .select("wallet_owner_id,address,asset,chain")
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
    if (!walletAddress || !walletOwnerId) {
      skipped += 1
      bump("missing_wallet_address_or_owner")
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

    let pubkey: PublicKey
    try {
      pubkey = new PublicKey(walletAddress)
    } catch {
      skipped += 1
      bump("invalid_wallet_address")
      continue
    }

    let sigs: { signature: string; blockTime: number | null }[] = []
    try {
      sigs = await connection.getSignaturesForAddress(pubkey, { limit })
    } catch (e) {
      skipped += 1
      const msg = errorMessage(e)
      bump(`rpc_get_signatures_failed:${msg.slice(0, 80)}`)
      continue
    }
    signaturesScanned += sigs.length

    for (const sig of sigs) {
      let tx: Awaited<ReturnType<Connection["getParsedTransaction"]>> | null = null
      try {
        tx = await connection.getParsedTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        })
      } catch {
        continue
      }
      if (!tx?.meta) continue

      const pre = tx.meta.preTokenBalances || []
      const post = tx.meta.postTokenBalances || []
      const mints = [USDC_MINT, EURC_MINT]

      for (const mint of mints) {
        const preRow = pre.find(
          (b) => (b.owner || "").toLowerCase() === walletAddress.toLowerCase() && b.mint === mint,
        )
        const postRow = post.find(
          (b) => (b.owner || "").toLowerCase() === walletAddress.toLowerCase() && b.mint === mint,
        )
        const preAmt = parseAtomic(preRow?.uiTokenAmount?.amount)
        const postAmt = parseAtomic(postRow?.uiTokenAmount?.amount)
        const decimals = Number(postRow?.uiTokenAmount?.decimals ?? preRow?.uiTokenAmount?.decimals ?? 6)
        const delta = postAmt - preAmt
        if (delta === 0n) continue

        const direction = delta > 0n ? "in" : "out"
        const absAtomic = delta > 0n ? delta : -delta
        const amount = atomicToMajor(absAtomic, decimals)
        if (!Number.isFinite(amount) || amount <= 0) continue

        const asset = mint === EURC_MINT ? "EURC" : "USDC"
        const currency = mint === EURC_MINT ? "EUR" : "USD"
        const occurredAt = sig.blockTime ? new Date(sig.blockTime * 1000).toISOString() : new Date().toISOString()

        try {
          await upsertLedgerTransaction(admin, {
            userId: ctx.userId,
            businessId: ctx.businessId,
            provider: "turnkey",
            providerTransactionId: `${sig.signature}:${walletAddress}:${asset}`,
            providerEventId: sig.signature,
            status: "settled",
            amount,
            amountMinor: absAtomic.toString(),
            currency,
            direction,
            payload: { signature: sig.signature, mint, source: "solana_rpc_backfill" },
            metadata: { source: "turnkey_onchain_backfill" },
            txHash: sig.signature,
            walletAddress,
            asset,
            chain: "solana",
            occurredAt,
            settledAt: occurredAt,
            baseCurrency: currency,
          })
          upserts += 1
          // Apply the same delta to the DB snapshot so dashboards can update from DB truth.
          const signed = direction === "in" ? amount : -amount
          await applyWalletBalanceDelta(admin, {
            businessId: ctx.businessId ? ctx.businessId : null,
            userId: ctx.businessId ? null : ctx.userId,
            currency,
            delta: signed,
          })
        } catch (e) {
          skipped += 1
          const msg = errorMessage(e)
          bump(`ledger_upsert_failed:${msg.slice(0, 80)}`)
        }
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
