import type { SupabaseClient } from "@supabase/supabase-js"
import { generateTransactionId } from "@/lib/transaction-id"
import { buildWalletReportingSnapshot } from "@/lib/transactions/reporting-snapshot"
import { inboundHashHasVisibleLedgerCredit } from "@/lib/turnkey/inbound-hash-visible-ledger"
import { withOrganicStablecoinDepositMetadata } from "@/lib/turnkey/organic-stablecoin-deposit-metadata"
import { resolveTurnkeyWalletScopeFromEvent } from "@/lib/turnkey/resolve-turnkey-wallet-scope"
import { turnkeyBalanceDepositProviderTransactionId } from "@/lib/turnkey/turnkey-balance-webhook-payload"
import { deriveStablecoinAssociatedTokenAddress } from "@/lib/solana/ata"
import { createSolanaRpcConnection } from "@/lib/solana/rpc-connection"
import { mintForStablecoinAsset } from "@/lib/solana/spl-mints"
import { resolveSolanaInboundSenderFromTxHash } from "@/lib/turnkey/solana-inbound-sender"
import {
  isWalletSendFeeSolanaAddress,
  resolveWalletSendFeeSolanaAddress,
} from "@/lib/wallet-send/fee-address"
import { computeSweepAmountFromMetadata } from "@/lib/processing-fee/fee-wallet-sweep-meta"
import {
  buildOrgTreasuryInboundWriteMetadata,
  orgTreasuryKindFromRelatedDirection,
  type OrgTreasuryInboundKind,
} from "@easner/shared"

export function feeWalletSweepAmountFromMeta(meta: Record<string, unknown>): number {
  const stamped = Number(meta.fee_wallet_sweep ?? meta.easner_revenue_sweep_amount ?? 0)
  if (Number.isFinite(stamped) && stamped > 0) return stamped
  return computeSweepAmountFromMetadata(meta)
}

export function isFeeWalletDestinationAddress(address: string): boolean {
  const addr = String(address || "").trim()
  if (!addr) return false
  if (isWalletSendFeeSolanaAddress(addr)) return true
  const usd = resolveWalletSendFeeSolanaAddress({ ledgerCurrency: "USD" })
  const eur = resolveWalletSendFeeSolanaAddress({ ledgerCurrency: "EUR" })
  if (usd && deriveStablecoinAssociatedTokenAddress(usd, "USDC") === addr) return true
  if (eur && deriveStablecoinAssociatedTokenAddress(eur, "EURC") === addr) return true
  return false
}

async function resolveSenderVaultAddress(
  admin: SupabaseClient,
  input: { userId?: string | null; businessId?: string | null; asset: "USDC" | "EURC" },
): Promise<string | null> {
  const businessId = String(input.businessId || "").trim()
  const userId = String(input.userId || "").trim()
  const ownerLookups: Array<{ owner_type: string; owner_ref: string }> = businessId
    ? [{ owner_type: "business", owner_ref: businessId }]
    : userId
      ? [
          { owner_type: "individual", owner_ref: userId },
          { owner_type: "user", owner_ref: userId },
        ]
      : []
  for (const lookup of ownerLookups) {
    const { data: owner } = await admin
      .from("wallet_owners")
      .select("id")
      .eq("owner_type", lookup.owner_type)
      .eq("owner_ref", lookup.owner_ref)
      .maybeSingle()
    const ownerId = String(owner?.id || "").trim()
    if (!ownerId) continue
    const { data: wallet } = await admin
      .from("wallet_accounts")
      .select("address")
      .eq("wallet_owner_id", ownerId)
      .eq("status", "active")
      .eq("chain", "solana")
      .eq("asset", input.asset)
      .limit(1)
      .maybeSingle()
    const address = String(wallet?.address || "").trim()
    if (address) return address
  }
  return null
}

/**
 * Book the org-vault Stablecoin deposit for a fee-wallet sweep.
 * Chain already credited the ATA — do not apply wallet_balances again.
 * CLI-safe (no Next `server-only` ledger helpers).
 */
export async function ensureFeeWalletRevenueDeposit(
  admin: SupabaseClient,
  input: {
    txHash: string
    amount: number
    asset?: "USDC" | "EURC"
    fromAddress?: string | null
    senderUserId?: string | null
    senderBusinessId?: string | null
    relatedEasnerTransactionId?: string | null
    relatedDirection?: "in" | "out" | null
    orgTreasuryKind?: OrgTreasuryInboundKind
    occurredAt?: string | null
  },
): Promise<{ inserted: boolean; existing: boolean }> {
  const txHash = String(input.txHash || "").trim()
  const amount = Number(input.amount)
  const asset = input.asset === "EURC" ? "EURC" : "USDC"
  if (!txHash || !Number.isFinite(amount) || amount <= 0) {
    return { inserted: false, existing: false }
  }

  const feeWallet =
    asset === "EURC"
      ? resolveWalletSendFeeSolanaAddress({ ledgerCurrency: "EUR" })
      : resolveWalletSendFeeSolanaAddress({ ledgerCurrency: "USD" })
  if (!feeWallet) return { inserted: false, existing: false }

  const scope = await resolveTurnkeyWalletScopeFromEvent(admin, {
    address: feeWallet,
    txHash,
    asset,
    msg: { address: feeWallet, txHash, operation: "deposit" },
  })
  if (!scope) return { inserted: false, existing: false }

  const visible = await inboundHashHasVisibleLedgerCredit(admin, {
    txHash,
    userId: scope.userId,
    businessId: scope.businessId,
  })
  if (visible) return { inserted: false, existing: true }

  let fromAddress =
    String(input.fromAddress || "").trim() ||
    (await resolveSenderVaultAddress(admin, {
      userId: input.senderUserId,
      businessId: input.senderBusinessId,
      asset,
    }))
  if (!fromAddress) {
    const mint = mintForStablecoinAsset(asset)
    if (mint) {
      fromAddress =
        (await resolveSolanaInboundSenderFromTxHash(createSolanaRpcConnection(), {
          txHash,
          mint,
          ownerAddress: feeWallet,
        }).catch(() => null)) || ""
    }
  }

  const currency = asset === "EURC" ? "EUR" : "USD"
  const occurredAt = String(input.occurredAt || "").trim() || new Date().toISOString()
  const addressForId = scope.tokenAccountAddress || scope.walletAddress
  const providerTransactionId = turnkeyBalanceDepositProviderTransactionId(
    { txHash, eventId: `fee-wallet-sweep:${txHash}`, asset },
    addressForId,
  )
  const easnerTransactionId = generateTransactionId()
  const orgTreasuryKind =
    input.orgTreasuryKind ?? orgTreasuryKindFromRelatedDirection(input.relatedDirection)
  const orgTreasuryFields = buildOrgTreasuryInboundWriteMetadata({
    kind: orgTreasuryKind,
    relatedEasnerTransactionId: input.relatedEasnerTransactionId,
  })
  const metadata = withOrganicStablecoinDepositMetadata({
    source: "turnkey_balance_webhook",
    operation: "deposit",
    source_payment_rail: "solana",
    source_currency: asset,
    organic_deposit_fallback: true,
    balance_delta_applied: true,
    easner_transaction_id: easnerTransactionId,
    ...orgTreasuryFields,
    ...(fromAddress ? { from_address: fromAddress } : {}),
    ...buildWalletReportingSnapshot({ amount, currency, fxRates: [] }),
  })

  const { error } = await admin.from("transactions").insert({
    user_id: scope.userId,
    business_id: scope.businessId,
    provider: "turnkey",
    provider_transaction_id: providerTransactionId,
    provider_event_id: `fee-wallet-sweep:${txHash}`,
    status: "settled",
    amount,
    currency,
    direction: "in",
    payload: { source: "fee_wallet_revenue_sweep", signature: txHash, asset },
    metadata,
    tx_hash: txHash,
    wallet_address: scope.walletAddress,
    counterparty_address: fromAddress || null,
    asset,
    chain: "solana",
    occurred_at: occurredAt,
    settled_at: occurredAt,
    base_currency: currency,
    base_amount: amount,
    easner_transaction_id: easnerTransactionId,
    hidden_from_feed: false,
  })
  if (error) {
    if (String(error.code) === "23505") return { inserted: false, existing: true }
    throw error
  }
  return { inserted: true, existing: false }
}

export async function findRelatedByFeeWalletSweepHash(
  admin: SupabaseClient,
  txHash: string,
): Promise<{ easnerTransactionId: string | null; direction: "in" | "out" | null } | null> {
  const hash = String(txHash || "").trim()
  if (!hash) return null
  try {
    const { data } = await admin
      .from("transactions")
      .select("easner_transaction_id, direction")
      .filter("metadata->>fee_wallet_sweep_tx_hash", "eq", hash)
      .limit(5)
    const rows = Array.isArray(data) ? data : data ? [data] : []
    const row =
      rows.find((r) => String(r.direction ?? "").toLowerCase() === "out") ??
      rows.find((r) => String(r.direction ?? "").toLowerCase() === "in") ??
      rows[0]
    if (!row) return null
    const direction = String(row.direction ?? "").toLowerCase()
    return {
      easnerTransactionId: row.easner_transaction_id ? String(row.easner_transaction_id) : null,
      direction: direction === "in" || direction === "out" ? direction : null,
    }
  } catch {
    return null
  }
}

export async function findEtidForLedgerRowId(
  admin: SupabaseClient,
  transactionId: string | null | undefined,
): Promise<string | null> {
  const id = String(transactionId || "").trim()
  if (!id) return null
  if (/^ETID/i.test(id)) return id
  try {
    const { data } = await admin
      .from("transactions")
      .select("easner_transaction_id")
      .eq("id", id)
      .maybeSingle()
    const etid = String(data?.easner_transaction_id ?? "").trim()
    return etid || null
  } catch {
    return null
  }
}

export async function findTransactionByFeeTurnkeySendId(
  admin: SupabaseClient,
  turnkeySendId: string,
): Promise<{
  id: string
  user_id: string
  business_id: string | null
  easner_transaction_id: string | null
  metadata: Record<string, unknown>
} | null> {
  const tid = String(turnkeySendId || "").trim()
  if (!tid) return null
  const select = "id, user_id, business_id, easner_transaction_id, metadata"
  for (const column of ["processing_fee_turnkey_send_id", "margin_turnkey_send_id"] as const) {
    const { data } = await admin
      .from("transactions")
      .select(select)
      .eq("direction", "out")
      .filter(`metadata->>${column}`, "eq", tid)
      .limit(1)
      .maybeSingle()
    if (data?.id) {
      return {
        id: String(data.id),
        user_id: String(data.user_id ?? ""),
        business_id: data.business_id != null ? String(data.business_id) : null,
        easner_transaction_id: data.easner_transaction_id
          ? String(data.easner_transaction_id)
          : null,
        metadata: (data.metadata || {}) as Record<string, unknown>,
      }
    }
  }
  return null
}

/** Write the sweep hash on the payout and book the fee-wallet Stablecoin deposit. */
export async function stampFeeWalletSweepHashOnTransaction(
  admin: SupabaseClient,
  input: {
    transactionId: string
    meta: Record<string, unknown>
    txHash: string
    userId: string
    businessId: string | null
    relatedEasnerTransactionId?: string | null
    relatedDirection?: "in" | "out" | null
    orgTreasuryKind?: OrgTreasuryInboundKind
    sendStatus?: string
    fromAddress?: string | null
    extraMeta?: Record<string, unknown>
  },
): Promise<{ booked: boolean }> {
  const txHash = String(input.txHash || "").trim()
  const transactionId = String(input.transactionId || "").trim()
  if (!txHash || !transactionId) return { booked: false }

  const meta = {
    ...input.meta,
    ...input.extraMeta,
    fee_wallet_sweep_tx_hash: txHash,
    processing_fee_pending: false,
    processing_fee_turnkey_send_status: input.sendStatus ?? "settled",
    processing_fee_captured_at:
      String(input.meta.processing_fee_captured_at ?? "").trim() || new Date().toISOString(),
  }
  await admin
    .from("transactions")
    .update({ metadata: meta, updated_at: new Date().toISOString() })
    .eq("id", transactionId)

  const amount = feeWalletSweepAmountFromMeta(meta)
  if (amount <= 0) return { booked: false }

  const result = await ensureFeeWalletRevenueDeposit(admin, {
    txHash,
    amount,
    fromAddress: input.fromAddress,
    senderUserId: input.userId,
    senderBusinessId: input.businessId,
    relatedEasnerTransactionId: input.relatedEasnerTransactionId ?? null,
    relatedDirection: input.relatedDirection ?? "out",
    orgTreasuryKind: input.orgTreasuryKind,
  })
  return { booked: result.inserted || result.existing }
}
