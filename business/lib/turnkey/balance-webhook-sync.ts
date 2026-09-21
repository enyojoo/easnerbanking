import type { SupabaseClient } from "@supabase/supabase-js"
import { applyTurnkeyInboundLedgerEvent } from "@/lib/turnkey/apply-turnkey-inbound-ledger"
import { isTurnkeyBalanceWebhooksIngestEnabled } from "@/lib/turnkey/config"
import { inboundHashHasVisibleLedgerCredit } from "@/lib/turnkey/inbound-hash-visible-ledger"
import { easetagP2pCreditVisibleForTransferGroup } from "@/lib/ledger/easetag-settlement"
import {
  turnkeyInboundLedgerRowExists,
  turnkeyVisibleInboundLedgerRowExists,
} from "@/lib/turnkey/ledger-inbound-exists"
import type { NormalizedTurnkeyBalanceDeposit } from "@/lib/turnkey/turnkey-balance-webhook-payload"
import { turnkeyBalanceDepositProviderTransactionId } from "@/lib/turnkey/turnkey-balance-webhook-payload"
import { resolveTurnkeyWalletScopeFromEvent, isActiveSolanaWalletAddress } from "@/lib/turnkey/resolve-turnkey-wallet-scope"
import { isDepositOmnibusAddress } from "@/lib/deposit-omnibus/config"
import { handleDepositOmnibusInbound } from "@/lib/deposit-omnibus/handle-omnibus-inbound"
import { createSolanaRpcConnection, isSolanaRpcRateLimitedError } from "@/lib/solana/rpc-connection"
import { mintForStablecoinAsset } from "@/lib/solana/spl-mints"
import { resolveSolanaInboundSenderFromTxHash } from "@/lib/turnkey/solana-inbound-sender"
import { isFeeWalletDestinationAddress } from "@/lib/processing-fee/fee-wallet-inbound-deposit"
import { findYcCrossBorderFeeWalletRefundSuppression } from "@/lib/yellowcard/yc-ledger"
import { withOrganicStablecoinDepositMetadata } from "@/lib/turnkey/organic-stablecoin-deposit-metadata"
import { isGridVaSweepTreasurySender } from "@/lib/grid/grid-va-sweep-treasury"
import { isGridVaTurnkeyDustAmount } from "@/lib/grid/grid-va-turnkey-dust"
import { gridVaInboundCreditVisible } from "@/lib/grid/grid-bank-deposit-chain-suppression"

function mapAssetToCurrency(asset: string): string {
  const a = asset.trim().toUpperCase()
  if (a === "EURC") return "EUR"
  return "USD"
}

/**
 * Ingest Turnkey balance deposit webhooks (`balances:confirmed` / `balances:finalized`)
 * as organic Stablecoin Deposit rows. Confirmed and finalized for the same tx dedupe
 * via tx-hash dedupe and a final visible-ledger guarantee.
 */
async function ensureVisibleStablecoinDepositForBalanceWebhook(
  admin: SupabaseClient,
  input: {
    deposit: NormalizedTurnkeyBalanceDeposit
    scope: NonNullable<Awaited<ReturnType<typeof resolveTurnkeyWalletScopeFromEvent>>>
    eventId: string
    providerTransactionId: string
    asset: string
    chain: string
    currency: string
    counterpartyAddress: string | null
  },
): Promise<void> {
  const { deposit, scope, eventId, providerTransactionId, asset, chain, currency, counterpartyAddress } =
    input
  const txHash = String(deposit.txHash || "").trim()
  if (!txHash) return
  if (isGridVaTurnkeyDustAmount(deposit.amount) || deposit.amount <= 0) return
  if (isGridVaSweepTreasurySender(counterpartyAddress)) {
    const gridVisible = await gridVaInboundCreditVisible(admin, {
      userId: scope.userId,
      businessId: scope.businessId,
      amount: deposit.amount,
    })
    if (gridVisible) return
  }

  const visible = await inboundHashHasVisibleLedgerCredit(admin, {
    txHash,
    userId: scope.userId,
    businessId: scope.businessId,
  })
  if (visible) return

  const hiddenOnly =
    (await turnkeyInboundLedgerRowExists(admin, {
      signature: txHash,
      userId: scope.userId,
      businessId: scope.businessId,
    })) &&
    !(await turnkeyVisibleInboundLedgerRowExists(admin, {
      signature: txHash,
      userId: scope.userId,
      businessId: scope.businessId,
    }))

  console.warn("turnkey_balance_webhook_ensure_visible_deposit", {
    txHash,
    amount: deposit.amount,
    address: deposit.address,
    hiddenOnly,
  })

  const result = await applyTurnkeyInboundLedgerEvent(
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
      metadata: withOrganicStablecoinDepositMetadata({
        source: "turnkey_balance_webhook",
        operation: "deposit",
        source_payment_rail: chain,
        source_currency: asset,
        organic_deposit_fallback: true,
        ensure_visible_deposit: true,
        ...(counterpartyAddress ? { from_address: counterpartyAddress } : {}),
      }),
      txHash: deposit.txHash,
      walletAddress: scope.walletAddress,
      counterpartyAddress,
      occurredAt: deposit.occurredAt,
      settledAt: deposit.settledAt,
      asset,
      chain,
      amountMinor: deposit.amountMinor,
    },
    { forceOrganicStablecoinDeposit: true, skipBalanceDelta: hiddenOnly },
  )

  if (result.kind !== "applied" && result.kind !== "skipped") {
    throw new Error(`turnkey_balance_webhook_ensure_no_ledger:${result.kind}:${txHash}`)
  }

  const visibleAfter = await inboundHashHasVisibleLedgerCredit(admin, {
    txHash,
    userId: scope.userId,
    businessId: scope.businessId,
  })
  if (!visibleAfter) {
    throw new Error(`turnkey_balance_webhook_no_visible_deposit:${txHash}`)
  }
}

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

  // Dual-use fee treasury / org vault: always book a visible Stablecoin deposit.
  // Stamp YC cross-border refunds on the transfer, but never swallow the inbound row.
  const addr = String(deposit.address || "").trim()
  const feeWalletInbound = isFeeWalletDestinationAddress(addr)
  let feeWalletRevenueSweep = feeWalletInbound
  let resolvedSender = String(deposit.counterpartyAddress || "").trim() || null

  if (feeWalletInbound) {
    if (!resolvedSender && deposit.txHash) {
      const mint = mintForStablecoinAsset(String(deposit.asset || "USDC"))
      if (mint) {
        resolvedSender = await resolveSolanaInboundSenderFromTxHash(createSolanaRpcConnection(), {
          txHash: deposit.txHash,
          mint,
          ownerAddress: addr,
        }).catch(() => null)
      }
    }
    const fromManagedVault = resolvedSender
      ? await isActiveSolanaWalletAddress(admin, resolvedSender)
      : false
    const fromOmnibus = resolvedSender ? isDepositOmnibusAddress(resolvedSender) : false

    if (!fromManagedVault && !fromOmnibus) {
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
      }
    }
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
    (await inboundHashHasVisibleLedgerCredit(admin, {
      txHash: deposit.txHash,
      userId: scope.userId,
      businessId: scope.businessId,
    }))
  ) {
    return true
  }

  const providerTransactionId = turnkeyBalanceDepositProviderTransactionId(deposit, addressForId)

  let counterpartyAddress = resolvedSender || deposit.counterpartyAddress
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

  if (!feeWalletRevenueSweep && counterpartyAddress && isFeeWalletDestinationAddress(addr)) {
    feeWalletRevenueSweep = true
  }

  let result = await applyTurnkeyInboundLedgerEvent(
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
        ...(counterpartyAddress ? { from_address: counterpartyAddress } : {}),
        ...(feeWalletRevenueSweep ? { fee_wallet_revenue_sweep: true } : {}),
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
    feeWalletRevenueSweep ? { forceOrganicStablecoinDeposit: true, skipBalanceDelta: true } : undefined,
  )

  if (
    (result.kind === "suppressed_noah" || result.kind === "suppressed_easetag") &&
    deposit.txHash
  ) {
    let visible = await inboundHashHasVisibleLedgerCredit(admin, {
      txHash: deposit.txHash,
      userId: scope.userId,
      businessId: scope.businessId,
    })
    if (
      !visible &&
      result.kind === "suppressed_easetag" &&
      result.easetagTransferGroupId
    ) {
      visible = await easetagP2pCreditVisibleForTransferGroup(admin, result.easetagTransferGroupId)
    }
    if (!visible && isGridVaSweepTreasurySender(counterpartyAddress)) {
      visible = await gridVaInboundCreditVisible(admin, {
        userId: scope.userId,
        businessId: scope.businessId,
        amount: deposit.amount,
      })
    }
    if (!visible) {
      if (result.allowOrganicFallback === true) {
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
            metadata: withOrganicStablecoinDepositMetadata({
              source: "turnkey_balance_webhook",
              operation: "deposit",
              source_payment_rail: chain,
              source_currency: asset,
              organic_deposit_fallback: true,
              ...(counterpartyAddress ? { from_address: counterpartyAddress } : {}),
            }),
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
        throw new Error(
          `turnkey_balance_webhook_product_reconcile_pending:${result.kind}:${deposit.txHash}`,
        )
      }
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

  await ensureVisibleStablecoinDepositForBalanceWebhook(admin, {
    deposit,
    scope,
    eventId,
    providerTransactionId,
    asset,
    chain,
    currency,
    counterpartyAddress: counterpartyAddress ?? null,
  })

  return true
}
