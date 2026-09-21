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
  const metadata = withOrganicStablecoinDepositMetadata({
    source: "turnkey_balance_webhook",
    operation: "deposit",
    source_payment_rail: "solana",
    source_currency: asset,
    organic_deposit_fallback: true,
    fee_wallet_revenue_sweep: true,
    balance_delta_applied: true,
    easner_transaction_id: easnerTransactionId,
    ...(input.relatedEasnerTransactionId
      ? { related_easner_transaction_id: input.relatedEasnerTransactionId }
      : {}),
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
