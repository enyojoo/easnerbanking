import type { SupabaseClient } from "@supabase/supabase-js"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { ledgerAmountToUsd, maybeApplyVelocityControl } from "@/lib/wallet-send-compliance"
import { findEasetagSettlementForChainSuppression, updateEasetagSettlementSettled, patchEasetagP2pChainSettlement } from "@/lib/ledger/easetag-settlement"
import { suppressTurnkeyEasetagChainMirrorRow } from "@/lib/ledger/easetag-turnkey-mirror"
import {
  findGlobalPayoutRefundForInboundSuppression,
  findGlobalPayoutSettlementForChainSuppression,
  persistGlobalPayoutRefundTxHashOnOutRow,
} from "@/lib/noah/global-payout-ledger"
import { reconcileNoahBankOnrampCreditForSolanaTx } from "@/lib/noah/credit-bank-onramp-wallet"
import { findYcFundBalanceChainSettlementForSuppression } from "@/lib/yellowcard/yc-ledger"
import { findStripeOnrampChainSettlementForSuppression } from "@/lib/stripe/onramp-ledger"
import {
  findPendingStripeOnrampSessionForInbound,
  markStripeOnrampSessionChainTxHash,
  suppressTurnkeyStripeOnrampChainMirrorRow,
} from "@/lib/stripe/stripe-onramp-turnkey-mirror"
import { findNoahBankOnrampChainSettlementForSuppression } from "@/lib/noah/noah-bank-onramp-chain-suppression"
import { findRelayDepositChainSettlementForSuppression } from "@/lib/relay-deposit/relay-deposit-suppression"
import { reconcileRelayDepositCreditForSolanaTx } from "@/lib/relay-deposit/settle-relay-deposit"
import {
  findGridVaBankDepositChainSettlementForSuppression,
  findPendingGridVaBankDepositForInboundAmount,
} from "@/lib/grid/grid-bank-deposit-chain-suppression"
import { isGridVaSweepTreasurySender } from "@/lib/grid/grid-va-sweep-treasury"
import { isGridVaTurnkeyDustAmount } from "@/lib/grid/grid-va-turnkey-dust"
import { reconcileGridVaBankDepositCreditForSolanaTx } from "@/lib/grid/grid-bank-deposit-credit"
import { suppressTurnkeyGridVaChainMirrorRow } from "@/lib/grid/grid-va-turnkey-mirror"
import { findBridgeVaBankDepositChainSettlementForSuppression, findPendingBridgeVaBankDepositForInboundAmount } from "@/lib/bridge/va-chain-suppression"
import {
  findGridVaTurnkeySweepForSolanaTx,
  settleGridVaTurnkeySweepForSolanaTx,
} from "@/lib/grid/va-turnkey-sweep"
import { tryCompleteDepositSplitFromUserVaultInbound } from "@/lib/deposit-omnibus/execute-deposit-split"
import { tryCompleteYcFundBalanceFromUserVaultInbound } from "@/lib/yellowcard/execute-yc-fund-balance-split"
import { isDepositSplitEnabled } from "@/lib/deposit-omnibus/config"
import { withOrganicStablecoinDepositMetadata } from "@/lib/turnkey/organic-stablecoin-deposit-metadata"
import { turnkeyVisibleInboundLedgerRowExists } from "@/lib/turnkey/ledger-inbound-exists"
import { applyWalletBalanceDelta } from "@/lib/wallet/wallet-balances-db"
import { enqueueLiquiditySweepJob } from "@/lib/liquidity/sweep-jobs"
import { resolvePooledSolanaSourceAddress, ledgerCurrencyForStablecoinAsset } from "@/lib/liquidity/platform-pool"
import {
  creditPlatformAccountFromInbound,
  findIssuedPlatformAccountForWalletOwner,
} from "@/lib/platform/ledger"

export type TurnkeyInboundLedgerInput = {
  userId: string
  businessId: string | null
  walletAccount: {
    id: string
    address: string
    asset: string
    chain: string
    associated_token_account_address: string | null
  }
  providerTransactionId: string
  providerEventId: string
  status: "settled" | "pending" | "failed"
  amount: number
  currency: string
  direction: "in" | "out"
  payload: Record<string, unknown>
  metadata: Record<string, unknown>
  txHash: string | null
  walletAddress: string
  counterpartyAddress: string | null
  occurredAt: string
  settledAt: string | null
  asset: string
  chain: string
  amountMinor: string | null
  platformCustomerId?: string | null
}

export type TurnkeyInboundLedgerResult =
  | { kind: "suppressed_noah"; allowOrganicFallback?: boolean }
  | { kind: "suppressed_easetag"; allowOrganicFallback?: boolean; easetagTransferGroupId?: string }
  | { kind: "applied"; transactionId: string | null }
  | { kind: "skipped" }

function suppressedNoah(allowOrganicFallback = false): TurnkeyInboundLedgerResult {
  return { kind: "suppressed_noah", allowOrganicFallback }
}

function suppressedEasetag(
  allowOrganicFallback = false,
  easetagTransferGroupId?: string,
): TurnkeyInboundLedgerResult {
  return { kind: "suppressed_easetag", allowOrganicFallback, easetagTransferGroupId }
}

async function settleMatchingGridVaTurnkeySweep(
  admin: SupabaseClient,
  input: {
    userId: string
    businessId: string | null
    amount: number
    currency: string
    txHash: string
  },
): Promise<void> {
  if (!input.businessId) return
  const matched = await findGridVaTurnkeySweepForSolanaTx(admin, {
    txHash: input.txHash,
    businessId: input.businessId,
    userId: input.userId,
    amount: input.amount,
  })
  if (!matched) return
  await settleGridVaTurnkeySweepForSolanaTx(admin, {
    transferId: matched.transferId,
    solanaTxHash: input.txHash,
    inboundAmount: input.amount,
  }).catch(() => {})
}

/**
 * Shared Turnkey inbound ledger path: Noah/Easetag suppression, upsert, balance delta, sweep.
 */
export async function applyTurnkeyInboundLedgerEvent(
  admin: SupabaseClient,
  input: TurnkeyInboundLedgerInput,
  opts?: { skipBalanceDelta?: boolean; forceOrganicStablecoinDeposit?: boolean },
): Promise<TurnkeyInboundLedgerResult> {
  const { userId, businessId } = input
  const txHash = input.txHash ? String(input.txHash).trim() : null
  const status = input.status
  const direction = input.direction
  const skipProductSuppressors = opts?.forceOrganicStablecoinDeposit === true

  if (direction === "in" && status === "settled" && input.amount > 0) {
    const { data: walletRow } = await admin
      .from("wallet_accounts")
      .select("wallet_owner_id")
      .eq("id", input.walletAccount.id)
      .maybeSingle()
    const ownerId = String(walletRow?.wallet_owner_id ?? "").trim()
    if (ownerId) {
      const issued = await findIssuedPlatformAccountForWalletOwner(admin, ownerId, input.currency)
      if (issued?.id) {
        const inboundKey = txHash || input.providerTransactionId
        const cents = Math.round(input.amount * 100)
        const credited = await creditPlatformAccountFromInbound(admin, {
          accountId: issued.id,
          amountCents: cents,
          type: "chain",
          description: "Chain deposit",
          inboundKey,
          metadata: {
            source: "chain",
            ...(txHash ? { tx_hash: txHash } : {}),
          },
        })
        return { kind: "applied", transactionId: "transactionId" in credited ? credited.transactionId : null }
      }
    }
  }

  if (direction === "in" && (isGridVaTurnkeyDustAmount(input.amount) || input.amount <= 0)) {
    if (txHash && status === "settled" && businessId) {
      const sweepByTx = await findGridVaTurnkeySweepForSolanaTx(admin, {
        txHash,
        businessId,
        userId,
        amount: input.amount,
      })
      if (sweepByTx) {
        await settleGridVaTurnkeySweepForSolanaTx(admin, {
          transferId: sweepByTx.transferId,
          solanaTxHash: txHash,
          inboundAmount: input.amount,
        }).catch(() => {})
      }
    }
    return { kind: "skipped" }
  }

  if (direction === "in" && !skipProductSuppressors) {
    if (txHash && status === "settled") {
      if (isDepositSplitEnabled()) {
        const completed = await tryCompleteDepositSplitFromUserVaultInbound(admin, {
          txHash,
          userId,
          businessId,
          amount: input.amount,
        }).catch(() => false)
        if (completed) {
          return suppressedNoah(false)
        }
      }

      const ycCompleted = await tryCompleteYcFundBalanceFromUserVaultInbound(admin, {
        txHash,
        userId,
        businessId,
        amount: input.amount,
      }).catch(() => false)
      if (ycCompleted) {
        return suppressedNoah(false)
      }
    }

    if (txHash) {
      const noahSuppressed = await findNoahBankOnrampChainSettlementForSuppression(admin, {
        txHash,
        userId,
        businessId,
      })
      if (noahSuppressed) {
        await reconcileNoahBankOnrampCreditForSolanaTx(admin, {
          solanaTxHash: txHash,
          userId,
          businessId,
        }).catch(() => {})
        return suppressedNoah(false)
      }

      if (businessId) {
        const sweepByTx = await findGridVaTurnkeySweepForSolanaTx(admin, {
          txHash,
          businessId,
          userId,
          amount: input.amount,
        })
        if (sweepByTx) {
          await settleGridVaTurnkeySweepForSolanaTx(admin, {
            transferId: sweepByTx.transferId,
            solanaTxHash: txHash,
            inboundAmount: input.amount,
          }).catch(() => {})
          return suppressedNoah(false)
        }
      }

      const gridSuppressed = await findGridVaBankDepositChainSettlementForSuppression(admin, {
        txHash,
        userId,
        businessId,
      })
      const bridgeSuppressed = gridSuppressed
        ? null
        : await findBridgeVaBankDepositChainSettlementForSuppression(admin, {
            txHash,
            userId,
            businessId,
          })
      const bridgePending =
        !gridSuppressed && !bridgeSuppressed
          ? await findPendingBridgeVaBankDepositForInboundAmount(admin, {
              userId,
              businessId,
              amount: input.amount,
              currency: input.currency,
              txHash,
            })
          : null
      const gridTreasuryPending =
        !gridSuppressed && isGridVaSweepTreasurySender(input.counterpartyAddress)
          ? await findPendingGridVaBankDepositForInboundAmount(admin, {
              userId,
              businessId,
              amount: input.amount,
              currency: input.currency,
              txHash,
            })
          : null
      if (gridSuppressed || gridTreasuryPending || bridgeSuppressed || bridgePending) {
        await reconcileGridVaBankDepositCreditForSolanaTx(admin, {
          solanaTxHash: txHash,
          userId,
          businessId,
          inboundAmount: input.amount,
          ledgerCurrency: String(input.currency ?? "USD").toUpperCase() === "EUR" ? "EUR" : "USD",
        }).catch(() => {})
        await settleMatchingGridVaTurnkeySweep(admin, {
          userId,
          businessId,
          amount: input.amount,
          currency: input.currency,
          txHash,
        })
        await suppressTurnkeyGridVaChainMirrorRow(admin, {
          txHash,
          userId,
          businessId,
        }).catch(() => {})
        return suppressedNoah(false)
      }

      if (isGridVaSweepTreasurySender(input.counterpartyAddress)) {
        await suppressTurnkeyGridVaChainMirrorRow(admin, {
          txHash,
          userId,
          businessId,
        }).catch(() => {})
        return suppressedNoah(false)
      }

      const relaySuppressed = await findRelayDepositChainSettlementForSuppression(admin, {
        txHash,
        userId,
        businessId,
        inboundAmount: input.amount,
        recipientVaultAta: input.walletAccount.associated_token_account_address,
        asset: input.asset,
        chain: input.chain,
      })
      if (relaySuppressed) {
        await reconcileRelayDepositCreditForSolanaTx(admin, {
          solanaTxHash: txHash,
          userId,
          businessId,
          inboundAmount: input.amount,
          recipientVaultAta: input.walletAccount.associated_token_account_address,
        }).catch(() => {})
        return suppressedNoah(relaySuppressed.reason === "pending_deposit")
      }

      const ycSuppressed = await findYcFundBalanceChainSettlementForSuppression(admin, {
        txHash,
        userId,
        businessId,
      })
      if (ycSuppressed) {
        return suppressedNoah(false)
      }

      const stripeOnrampMatch = await findStripeOnrampChainSettlementForSuppression(admin, {
        txHash,
        userId,
        businessId,
        walletAddress: input.walletAddress,
        amount: input.amount,
      })
      if (stripeOnrampMatch) {
        if (txHash) {
          const pending = await findPendingStripeOnrampSessionForInbound(admin, {
            userId,
            businessId,
            walletAddress: input.walletAddress,
            amount: input.amount,
            txHash,
          })
          if (pending?.stripeSessionId) {
            await markStripeOnrampSessionChainTxHash(admin, {
              stripeSessionId: pending.stripeSessionId,
              txHash,
            })
          }
          await suppressTurnkeyStripeOnrampChainMirrorRow(admin, {
            txHash,
            userId,
            businessId,
            stripeSessionId: pending?.stripeSessionId ?? null,
          }).catch(() => {})
        }
        return suppressedNoah(stripeOnrampMatch.kind === "amount")
      }
    }

    const refundSuppressed = await findGlobalPayoutRefundForInboundSuppression(admin, {
      txHash,
      userId,
      businessId,
      amount: input.amount,
      currency: input.currency,
    })
    if (refundSuppressed) {
      if (txHash) {
        await persistGlobalPayoutRefundTxHashOnOutRow(admin, {
          outRowId: refundSuppressed.outRowId,
          txHash,
        }).catch(() => {})
      }
      return suppressedNoah(false)
    }
  }

  if (!skipProductSuppressors) {
    const easetagSuppressed = await findEasetagSettlementForChainSuppression(admin, {
      turnkeySendStatusId: input.providerTransactionId,
      txHash,
      ...(direction === "in"
        ? {
            payeeUserId: userId,
            payeeBusinessId: businessId,
            amount: input.amount,
            currency: input.currency,
          }
        : {}),
    })
    if (easetagSuppressed) {
      const transferGroupId = easetagSuppressed.transfer_group_id
      if (status === "settled" && txHash) {
        await updateEasetagSettlementSettled(admin, transferGroupId, txHash).catch(() => {})
        await patchEasetagP2pChainSettlement(admin, {
          transferGroupId,
          turnkeySendId: input.providerTransactionId,
          txHash,
        }).catch(() => {})
        await suppressTurnkeyEasetagChainMirrorRow(admin, {
          txHash,
          userId,
          businessId,
          transferGroupId,
        }).catch(() => {})
      }
      return suppressedEasetag(false, transferGroupId)
    }

    const globalPayoutSuppressed = await findGlobalPayoutSettlementForChainSuppression(admin, {
      turnkeySendStatusId: input.providerTransactionId,
      txHash,
    })
    if (globalPayoutSuppressed && direction === "out") {
      return suppressedEasetag(false)
    }

    // Stripe invoice settlement payout to Turnkey address – settle Stripe ledger, suppress duplicate inbound row.
    if (direction === "in" && status === "settled" && businessId) {
      const { tryMatchTurnkeyStripeSettlement } = await import("./stripe-settlement-match")
      const stripeMatch = await tryMatchTurnkeyStripeSettlement(admin, {
        businessId,
        userId,
        amount: input.amount,
        currency: input.currency,
        walletAddress: input.walletAddress,
      }).catch(() => ({ matched: false as const }))
      if (stripeMatch.matched) {
        return suppressedNoah(true)
      }
    }
  }

  if (direction === "in" && status === "settled" && txHash && !skipProductSuppressors) {
    const visibleInLedger = await turnkeyVisibleInboundLedgerRowExists(admin, {
      signature: txHash,
      userId,
      businessId,
    })
    if (visibleInLedger) {
      return { kind: "skipped" }
    }
  }

  const upsert = await upsertLedgerTransaction(admin, {
    userId,
    businessId,
    provider: "turnkey",
    providerTransactionId: input.providerTransactionId,
    providerEventId: input.providerEventId,
    status,
    amount: input.amount,
    currency: input.currency,
    direction,
    payload: input.payload,
    metadata: skipProductSuppressors
      ? withOrganicStablecoinDepositMetadata(input.metadata)
      : input.metadata,
    txHash,
    walletAddress: input.walletAddress,
    counterpartyAddress: input.counterpartyAddress,
    occurredAt: input.occurredAt,
    settledAt: input.settledAt,
    asset: input.asset,
    chain: input.chain,
    baseCurrency: input.currency,
  })

  if (
    !opts?.skipBalanceDelta &&
    status === "settled" &&
    (upsert.inserted || upsert.becameSettled)
  ) {
    const businessScopeId = businessId ? businessId : null
    const userScopeId = businessId ? null : userId
    const signed = direction === "in" ? input.amount : -input.amount
    await applyWalletBalanceDelta(admin, {
      businessId: businessScopeId,
      userId: userScopeId,
      currency: input.currency,
      delta: signed,
    })
    if (direction === "in" && input.amount > 0) {
      await maybeApplyVelocityControl(admin, {
        businessId,
        amountUsd: ledgerAmountToUsd(input.amount, input.currency),
        source: "on_chain",
        transactionId: upsert.transactionId,
        creditKey: input.providerTransactionId || txHash
          ? `on_chain:${String(input.providerTransactionId || txHash)}`
          : null,
        metadata: { asset: input.asset, chain: input.chain },
      })
    }
    const priorMeta =
      upsert.transactionId != null
        ? (
            await admin
              .from("transactions")
              .select("metadata")
              .eq("id", upsert.transactionId)
              .maybeSingle()
          ).data?.metadata
        : null
    const metaBase =
      priorMeta && typeof priorMeta === "object" ? (priorMeta as Record<string, unknown>) : {}
    if (upsert.transactionId) {
      await admin
        .from("transactions")
        .update({
          metadata: { ...metaBase, ...input.metadata, balance_delta_applied: true },
          updated_at: new Date().toISOString(),
        })
        .eq("id", upsert.transactionId)
    }

    if (direction === "in" && input.amount > 0 && input.walletAccount.id) {
      const lc = ledgerCurrencyForStablecoinAsset(input.asset)
      const poolAddr = lc ? await resolvePooledSolanaSourceAddress(admin, { ledgerCurrency: lc }) : null
      const userAddr = String(input.walletAddress || "").trim()
      if (poolAddr && userAddr && poolAddr.trim() !== userAddr.trim()) {
        const idem = `sweep:${input.providerTransactionId}:${String(input.walletAccount.id)}`
        await enqueueLiquiditySweepJob(admin, {
          walletAccountId: String(input.walletAccount.id),
          asset: input.asset,
          amount: input.amount,
          idempotencyKey: idem,
        }).catch((e) => console.warn("enqueueLiquiditySweepJob (non-fatal):", e))
      }
    }
  }

  return { kind: "applied", transactionId: upsert.transactionId ?? null }
}
