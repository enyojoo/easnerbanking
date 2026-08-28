import type { SupabaseClient } from "@supabase/supabase-js"
import { applyTurnkeyInboundLedgerEvent } from "@/lib/turnkey/apply-turnkey-inbound-ledger"
import { isTurnkeyBalanceWebhooksIngestEnabled } from "@/lib/turnkey/config"
import { inboundHashHasVisibleLedgerCredit } from "@/lib/turnkey/inbound-hash-visible-ledger"
import { turnkeyInboundLedgerRowExists } from "@/lib/turnkey/ledger-inbound-exists"
import type { NormalizedTurnkeyBalanceDeposit } from "@/lib/turnkey/turnkey-balance-webhook-payload"
import { turnkeyBalanceDepositProviderTransactionId } from "@/lib/turnkey/turnkey-balance-webhook-payload"
import { resolveTurnkeyWalletScopeFromEvent } from "@/lib/turnkey/resolve-turnkey-wallet-scope"
import { isDepositOmnibusAddress } from "@/lib/deposit-omnibus/config"
import { handleDepositOmnibusInbound } from "@/lib/deposit-omnibus/handle-omnibus-inbound"
import { createSolanaRpcConnection, isSolanaRpcRateLimitedError } from "@/lib/solana/rpc-connection"
import { mintForStablecoinAsset } from "@/lib/solana/spl-mints"
import { resolveSolanaInboundSenderFromTxHash } from "@/lib/turnkey/solana-inbound-sender"
import { resolveWalletSendFeeSolanaAddress } from "@/lib/wallet-send/fee-address"
import { findYcCrossBorderFeeWalletRefundSuppression } from "@/lib/yellowcard/yc-ledger"

function mapAssetToCurrency(asset: string): string {
  const a = asset.trim().toUpperCase()
  if (a === "EURC") return "EUR"
  return "USD"
}

/**
 * Ingest Turnkey balance deposit webhooks (`balances:confirmed` / `balances:finalized`)
 * as organic Stablecoin Deposit rows. Confirmed and finalized for the same tx dedupe
 * via tx-hash `provider_transaction_id` and `turnkeyInboundLedgerRowExists`.
 */
export async function applyTurnkeyBalanceWebhookSideEffects(
  admin: SupabaseClient,
  deposit: NormalizedTurnkeyBalanceDeposit,
  eventId: string,
): Promise<boolean> {
  if (!isTurnkeyBalanceWebhooksIngestEnabled()) {
    throw new Error("turnkey_balance_webhooks_disabled")
  }

  if (isDepositOmnibusAddress(deposit.address)) {
    return handleDepositOmnibusInbound(admin, deposit, eventId)
  }

  // Cross-border leg2 fail refunds land on fee wallet – suppress + mark transfer.
  const feeUsd = resolveWalletSendFeeSolanaAddress({ ledgerCurrency: "USD" })
  const feeEur = resolveWalletSendFeeSolanaAddress({ ledgerCurrency: "EUR" })
  const addr = String(deposit.address || "").trim()
  if (addr && (addr === feeUsd || addr === feeEur)) {
    const match = await findYcCrossBorderFeeWalletRefundSuppression(admin, {
      amount: deposit.amount,
      currency: mapAssetToCurrency(deposit.asset),
    })
    if (match) {
      const { data: t } = await admin
        .from("yc_transfers")
        .select("metadata")
        .eq("id", match.transferId)
        .maybeSingle()
      const prior = (t?.metadata && typeof t.metadata === "object" ? t.metadata : {}) as Record<
        string,
        unknown
      >
      await admin
        .from("yc_transfers")
        .update({
          metadata: {
            ...prior,
            yc_fee_wallet_refund_suppressed: true,
            yc_fee_wallet_refund_tx_hash: deposit.txHash,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", match.transferId)
      return true
    }
    // Unmatched fee-wallet inbound – do not create user ledger rows.
    return true
  }

  const scope = await resolveTurnkeyWalletScopeFromEvent(admin, {
    ...deposit.raw,
    address: deposit.address,
    txHash: deposit.txHash,
    asset: deposit.asset,
    msg: {
      address: deposit.address,
      txHash: deposit.txHash,
      operation: "deposit",
      asset: { symbol: deposit.asset, amount: deposit.amountMinor ?? deposit.amount, decimals: deposit.decimals },
    },
  })
  if (!scope) {
    throw new Error(`turnkey_balance_webhook_scope_unresolved:${deposit.address}`)
  }

  const asset = String(scope.walletAccount.asset || deposit.asset).toUpperCase()
  const chain = String(scope.walletAccount.chain || "solana").toLowerCase()
  const currency = mapAssetToCurrency(asset)

  const addressForId = scope.tokenAccountAddress || scope.walletAddress
  if (
    deposit.txHash &&
    (await turnkeyInboundLedgerRowExists(admin, {
      signature: deposit.txHash,
      userId: scope.userId,
      businessId: scope.businessId,
    }))
  ) {
    return true
  }

  const providerTransactionId = turnkeyBalanceDepositProviderTransactionId(deposit, addressForId)

  let counterpartyAddress = deposit.counterpartyAddress
  if (!counterpartyAddress && deposit.txHash && chain === "solana") {
    const mint = mintForStablecoinAsset(asset)
    if (mint) {
      counterpartyAddress = await resolveSolanaInboundSenderFromTxHash(createSolanaRpcConnection(), {
        txHash: deposit.txHash,
        mint,
        ownerAddress: scope.walletAddress,
        tokenAccountAddress: scope.tokenAccountAddress,
      }).catch(() => null)
    }
  }

  let result = await applyTurnkeyInboundLedgerEvent(admin, {
    userId: scope.userId,
    businessId: scope.businessId,
    walletAccount: {
      id: String(scope.walletAccount.id),
      address: scope.walletAddress,
      asset,
      chain,
      associated_token_account_address: scope.tokenAccountAddress || null,
    },
    providerTransactionId,
    providerEventId: eventId,
    status: "settled",
    amount: deposit.amount,
    currency,
    direction: "in",
    payload: deposit.raw,
    metadata: {
      source: "turnkey_balance_webhook",
      operation: "deposit",
      source_payment_rail: chain,
      source_currency: asset,
      ...(counterpartyAddress ? { from_address: counterpartyAddress } : {}),
    },
    txHash: deposit.txHash,
    walletAddress: scope.walletAddress,
    counterpartyAddress,
    occurredAt: deposit.occurredAt,
    settledAt: deposit.settledAt,
    asset,
    chain,
    amountMinor: deposit.amountMinor,
  })

  if (
    (result.kind === "suppressed_noah" || result.kind === "suppressed_easetag") &&
    deposit.txHash
  ) {
    const visible = await inboundHashHasVisibleLedgerCredit(admin, {
      txHash: deposit.txHash,
      userId: scope.userId,
      businessId: scope.businessId,
    })
    if (!visible) {
      console.warn("turnkey_balance_webhook_suppressed_without_ledger_retry_organic", {
        kind: result.kind,
        txHash: deposit.txHash,
        amount: deposit.amount,
        address: deposit.address,
      })
      result = await applyTurnkeyInboundLedgerEvent(
        admin,
        {
          userId: scope.userId,
          businessId: scope.businessId,
          walletAccount: {
            id: String(scope.walletAccount.id),
            address: scope.walletAddress,
            asset,
            chain,
            associated_token_account_address: scope.tokenAccountAddress || null,
          },
          providerTransactionId,
          providerEventId: eventId,
          status: "settled",
          amount: deposit.amount,
          currency,
          direction: "in",
          payload: deposit.raw,
          metadata: {
            source: "turnkey_balance_webhook",
            operation: "deposit",
            source_payment_rail: chain,
            source_currency: asset,
            organic_deposit_fallback: true,
            ...(counterpartyAddress ? { from_address: counterpartyAddress } : {}),
          },
          txHash: deposit.txHash,
          walletAddress: scope.walletAddress,
          counterpartyAddress,
          occurredAt: deposit.occurredAt,
          settledAt: deposit.settledAt,
          asset,
          chain,
          amountMinor: deposit.amountMinor,
        },
        { forceOrganicStablecoinDeposit: true },
      )
    } else {
      console.info("turnkey_balance_webhook_suppressed", {
        kind: result.kind,
        txHash: deposit.txHash,
        amount: deposit.amount,
        address: deposit.address,
      })
      return true
    }
  }

  if (result.kind !== "applied" && result.kind !== "skipped") {
    throw new Error(`turnkey_balance_webhook_no_ledger:${result.kind}:${deposit.txHash}`)
  }

  return result.kind === "applied" || result.kind === "skipped"
}
