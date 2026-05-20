import type { SupabaseClient } from "@supabase/supabase-js"
import type { Connection } from "@solana/web3.js"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { findEasetagSettlementForChainSuppression } from "@/lib/ledger/easetag-settlement"
import { reconcileNoahBankOnrampCreditForSolanaTx } from "@/lib/noah/credit-bank-onramp-wallet"
import { findNoahBankOnrampChainSettlementForSuppression } from "@/lib/noah/noah-bank-onramp-chain-suppression"
import { applyWalletBalanceDelta } from "@/lib/wallet/wallet-balances-db"
import { mintForStablecoinAsset } from "@/lib/solana/spl-mints"

type OwnerVaultCtx = { userId: string; businessId: string | null }

function parseAtomic(raw: string | undefined): bigint {
  if (!raw || !/^-?\d+$/.test(raw)) return BigInt(0)
  try {
    return BigInt(raw)
  } catch {
    return BigInt(0)
  }
}

function atomicToMajor(amount: bigint, decimals: number): number {
  const divisor = 10 ** Math.max(0, Math.min(9, decimals))
  return Number(amount) / divisor
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

/**
 * Parses one confirmed Solana tx and applies ledger + balance delta for a single USDC/EURC vault
 * (matched by owner pubkey in token balances).
 */
export async function ingestTurnkeySolanaTxForOwnerVault(
  admin: SupabaseClient,
  params: {
    ownerAddress: string
    asset: "USDC" | "EURC"
    ctx: OwnerVaultCtx
    signature: string
    blockTime: number | null
    connection: Connection
    /** Backfill/repair: upsert ledger rows only; balances come from ATA snapshot. */
    skipBalanceDelta?: boolean
  },
): Promise<
  | { upserts: number; kind: "applied" }
  | { upserts: number; kind: "noop" }
  | { upserts: number; kind: "error"; reason: string }
> {
  const ownerLower = params.ownerAddress.toLowerCase()
  const mint = mintForStablecoinAsset(params.asset)
  if (!mint) return { upserts: 0, kind: "noop" }

  let tx: Awaited<ReturnType<Connection["getParsedTransaction"]>> | null = null
  try {
    tx = await params.connection.getParsedTransaction(params.signature, {
      maxSupportedTransactionVersion: 0,
    })
  } catch {
    return { upserts: 0, kind: "noop" }
  }
  if (!tx?.meta) return { upserts: 0, kind: "noop" }

  const pre = tx.meta.preTokenBalances || []
  const post = tx.meta.postTokenBalances || []
  const preRow = pre.find((b) => (b.owner || "").toLowerCase() === ownerLower && b.mint === mint)
  const postRow = post.find((b) => (b.owner || "").toLowerCase() === ownerLower && b.mint === mint)
  const preAmt = parseAtomic(preRow?.uiTokenAmount?.amount)
  const postAmt = parseAtomic(postRow?.uiTokenAmount?.amount)
  const decimals = Number(postRow?.uiTokenAmount?.decimals ?? preRow?.uiTokenAmount?.decimals ?? 6)
  const delta = postAmt - preAmt
  if (delta === BigInt(0)) return { upserts: 0, kind: "noop" }

  const direction = delta > BigInt(0) ? "in" : "out"
  const absAtomic = delta > BigInt(0) ? delta : -delta
  const amount = atomicToMajor(absAtomic, decimals)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { upserts: 0, kind: "noop" }
  }

  const currency = params.asset === "EURC" ? "EUR" : "USD"
  const occurredAt = params.blockTime
    ? new Date(params.blockTime * 1000).toISOString()
    : new Date().toISOString()

  const easetagSuppressed = await findEasetagSettlementForChainSuppression(admin, {
    txHash: params.signature,
  })
  if (easetagSuppressed) {
    return { upserts: 0, kind: "noop" }
  }

  if (direction === "in") {
    const noahSuppressed = await findNoahBankOnrampChainSettlementForSuppression(admin, {
      txHash: params.signature,
      userId: params.ctx.userId,
      businessId: params.ctx.businessId,
    })
    if (noahSuppressed) {
      await reconcileNoahBankOnrampCreditForSolanaTx(admin, {
        solanaTxHash: params.signature,
        userId: params.ctx.userId,
        businessId: params.ctx.businessId,
      }).catch(() => {})
      return { upserts: 0, kind: "noop" }
    }
  }

  try {
    const upsert = await upsertLedgerTransaction(admin, {
      userId: params.ctx.userId,
      businessId: params.ctx.businessId,
      provider: "turnkey",
      providerTransactionId: `${params.signature}:${params.ownerAddress}:${params.asset}`,
      providerEventId: params.signature,
      status: "settled",
      amount,
      amountMinor: absAtomic.toString(),
      currency,
      direction,
      payload: { signature: params.signature, mint, source: "solana_rpc_backfill" },
      metadata: { source: "turnkey_onchain_backfill" },
      txHash: params.signature,
      walletAddress: params.ownerAddress,
      asset: params.asset,
      chain: "solana",
      occurredAt,
      settledAt: occurredAt,
      baseCurrency: currency,
    })

    if (!params.skipBalanceDelta && (upsert.inserted || upsert.becameSettled)) {
      const signed = direction === "in" ? amount : -amount
      await applyWalletBalanceDelta(admin, {
        businessId: params.ctx.businessId ? params.ctx.businessId : null,
        userId: params.ctx.businessId ? null : params.ctx.userId,
        currency,
        delta: signed,
      })
    }

    if (params.skipBalanceDelta && direction === "in" && upsert.transactionId) {
      const { credited } = await reconcileNoahBankOnrampCreditForSolanaTx(admin, {
        solanaTxHash: params.signature,
        userId: params.ctx.userId,
        businessId: params.ctx.businessId,
      }).catch(() => ({ credited: false }))
      if (credited) {
        const { data: row } = await admin
          .from("transactions")
          .select("metadata")
          .eq("id", upsert.transactionId)
          .maybeSingle()
        const prior = (row?.metadata as Record<string, unknown> | undefined) ?? {}
        await admin
          .from("transactions")
          .update({
            metadata: {
              ...prior,
              noah_bank_onramp_chain_mirror: true,
              suppress_in_feed: true,
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", upsert.transactionId)
      }
    }

    return { upserts: 1, kind: "applied" }
  } catch (e) {
    return {
      upserts: 0,
      kind: "error",
      reason: `ledger_upsert_failed:${errorMessage(e).slice(0, 80)}`,
    }
  }
}
