import type { SupabaseClient } from "@supabase/supabase-js"
import type { Connection } from "@solana/web3.js"
import { applyTurnkeyInboundLedgerEvent } from "@/lib/turnkey/apply-turnkey-inbound-ledger"
import { withOrganicStablecoinDepositMetadata } from "@/lib/turnkey/organic-stablecoin-deposit-metadata"
import {
  resolveSplTransferSenderForVaultInbound,
  tokenBalanceDeltaForVault,
} from "@/lib/turnkey/solana-inbound-sender"
import { type ParsedTx, resolvedAccountKeys } from "@/lib/turnkey/solana-parsed-tx-accounts"
import { findEasetagSettlementForChainSuppression } from "@/lib/ledger/easetag-settlement"
import { findNoahBankOnrampChainSettlementForSuppression } from "@/lib/noah/noah-bank-onramp-chain-suppression"
import { findYcFundBalanceChainSettlementForSuppression } from "@/lib/yellowcard/yc-ledger"
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
 * Find SPL balance change for vault owner or ATA (handles v0 txs and missing `owner` on token rows).
 */
export { tokenBalanceDeltaForVault } from "@/lib/turnkey/solana-inbound-sender"

export async function ingestTurnkeySolanaTxForOwnerVault(
  admin: SupabaseClient,
  params: {
    ownerAddress: string
    asset: "USDC" | "EURC"
    ctx: OwnerVaultCtx
    signature: string
    blockTime: number | null
    connection: Connection
    tokenAccountAddress?: string | null
    walletAccountId?: string
    skipBalanceDelta?: boolean
    /** When true, skip ingest if a settled inbound turnkey row already exists for this signature. */
    skipIfLedgerRowExists?: boolean
  },
): Promise<
  | { upserts: number; kind: "applied" }
  | { upserts: number; kind: "noop"; reason?: string }
  | { upserts: number; kind: "error"; reason: string }
> {
  const ownerLower = params.ownerAddress.toLowerCase()
  const mint = mintForStablecoinAsset(params.asset)
  if (!mint) return { upserts: 0, kind: "noop", reason: "unknown_mint" }

  const noahMirror = await findNoahBankOnrampChainSettlementForSuppression(admin, {
    txHash: params.signature,
    userId: params.ctx.userId,
    businessId: params.ctx.businessId,
  })
  if (noahMirror) {
    return { upserts: 0, kind: "noop", reason: "noah_bank_onramp" }
  }

  const ycFundBalanceMirror = await findYcFundBalanceChainSettlementForSuppression(admin, {
    txHash: params.signature,
    userId: params.ctx.userId,
    businessId: params.ctx.businessId,
  })
  if (ycFundBalanceMirror) {
    return { upserts: 0, kind: "noop", reason: "yc_fund_balance" }
  }

  if (params.skipIfLedgerRowExists) {
    let existsQ = admin
      .from("transactions")
      .select("id")
      .eq("provider", "turnkey")
      .eq("tx_hash", params.signature)
      .eq("direction", "in")
      .eq("status", "settled")
    if (params.ctx.businessId) {
      existsQ = existsQ.eq("business_id", params.ctx.businessId)
    } else {
      existsQ = existsQ.eq("user_id", params.ctx.userId).is("business_id", null)
    }
    const { data: existing } = await existsQ.maybeSingle()
    if (existing?.id) return { upserts: 0, kind: "noop", reason: "already_in_ledger" }
  }

  let tx: ParsedTx | null = null
  try {
    tx = await params.connection.getParsedTransaction(params.signature, {
      maxSupportedTransactionVersion: 0,
    })
  } catch {
    return { upserts: 0, kind: "noop", reason: "rpc_get_tx_failed" }
  }
  if (!tx?.meta) return { upserts: 0, kind: "noop", reason: "tx_meta_missing" }

  const ataLower = String(params.tokenAccountAddress || "").trim().toLowerCase() || null
  const balanceDelta = tokenBalanceDeltaForVault(tx, mint, ownerLower, ataLower)
  if (!balanceDelta) return { upserts: 0, kind: "noop", reason: "no_vault_token_delta" }
  const { delta, decimals } = balanceDelta

  const direction = delta > BigInt(0) ? "in" : "out"
  const absAtomic = delta > BigInt(0) ? delta : -delta
  const amount = atomicToMajor(absAtomic, decimals)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { upserts: 0, kind: "noop", reason: "zero_amount" }
  }

  const currency = params.asset === "EURC" ? "EUR" : "USD"
  const occurredAt = params.blockTime
    ? new Date(params.blockTime * 1000).toISOString()
    : new Date().toISOString()

  const easetagSuppressed = await findEasetagSettlementForChainSuppression(admin, {
    txHash: params.signature,
  })
  if (easetagSuppressed) {
    return { upserts: 0, kind: "noop", reason: "easetag_settlement" }
  }

  const { findStripeOnrampChainSettlementForSuppression } = await import("@/lib/stripe/onramp-ledger")
  const stripeOnrampMirror = await findStripeOnrampChainSettlementForSuppression(admin, {
    txHash: params.signature,
    userId: params.ctx.userId,
    businessId: params.ctx.businessId,
    walletAddress: params.ownerAddress,
    amount,
  })
  if (stripeOnrampMirror) {
    return { upserts: 0, kind: "noop", reason: "stripe_onramp" }
  }

  const counterpartyAddress = resolveSplTransferSenderForVaultInbound(
    tx,
    mint,
    ownerLower,
    ataLower,
  )

  try {
    const ledgerInput = {
      userId: params.ctx.userId,
      businessId: params.ctx.businessId,
      walletAccount: {
        id: params.walletAccountId ?? "sync",
        address: params.ownerAddress,
        asset: params.asset,
        chain: "solana",
        associated_token_account_address: params.tokenAccountAddress ?? null,
      },
      providerTransactionId: `${params.signature}:${params.ownerAddress}:${params.asset}`,
      providerEventId: params.signature,
      status: "settled" as const,
      amount,
      currency,
      direction,
      payload: {
        signature: params.signature,
        mint,
        source: "solana_rpc_sync",
        accountKeys: resolvedAccountKeys(tx).length,
      },
      metadata: {
        source: "turnkey_chain_sync",
        source_payment_rail: "solana",
        source_currency: params.asset,
        ...(counterpartyAddress ? { from_address: counterpartyAddress } : {}),
      },
      txHash: params.signature,
      walletAddress: params.ownerAddress,
      counterpartyAddress,
      occurredAt,
      settledAt: occurredAt,
      asset: params.asset,
      chain: "solana",
      amountMinor: absAtomic.toString(),
    }

    let result = await applyTurnkeyInboundLedgerEvent(admin, ledgerInput, {
      skipBalanceDelta: params.skipBalanceDelta ?? true,
    })

    if (result.kind === "skipped") {
      result = await applyTurnkeyInboundLedgerEvent(
        admin,
        {
          ...ledgerInput,
          metadata: withOrganicStablecoinDepositMetadata({
            ...ledgerInput.metadata,
            organic_deposit_fallback: true,
          }),
        },
        {
          skipBalanceDelta: params.skipBalanceDelta ?? true,
          forceOrganicStablecoinDeposit: true,
        },
      )
    }

    if (result.kind === "suppressed_noah") {
      return { upserts: 0, kind: "noop", reason: "noah_bank_onramp" }
    }
    if (result.kind === "suppressed_easetag") {
      return { upserts: 0, kind: "noop", reason: "easetag_settlement" }
    }
    if (result.kind === "applied") return { upserts: 1, kind: "applied" }
    return { upserts: 0, kind: "noop", reason: "pipeline_skipped" }
  } catch (e) {
    return {
      upserts: 0,
      kind: "error",
      reason: `ledger_upsert_failed:${errorMessage(e).slice(0, 80)}`,
    }
  }
}
