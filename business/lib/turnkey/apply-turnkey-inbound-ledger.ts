import type { SupabaseClient } from "@supabase/supabase-js"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { findEasetagSettlementForChainSuppression, updateEasetagSettlementSettled } from "@/lib/ledger/easetag-settlement"
import {
  findGlobalPayoutRefundForInboundSuppression,
  findGlobalPayoutSettlementForChainSuppression,
  persistGlobalPayoutRefundTxHashOnOutRow,
} from "@/lib/noah/global-payout-ledger"
import { reconcileNoahBankOnrampCreditForSolanaTx, linkBankOnrampPayInToSolanaTxHash } from "@/lib/noah/credit-bank-onramp-wallet"
import { findYcFundBalanceChainSettlementForSuppression } from "@/lib/yellowcard/yc-ledger"
import { findStripeOnrampChainSettlementForSuppression } from "@/lib/stripe/onramp-ledger"
import {
  findNoahBankOnrampChainSettlementForSuppression,
  findPendingNoahBankOnrampForInboundAmount,
} from "@/lib/noah/noah-bank-onramp-chain-suppression"
import { findRelayDepositChainSettlementForSuppression } from "@/lib/relay-deposit/relay-deposit-suppression"
import { reconcileRelayDepositCreditForSolanaTx } from "@/lib/relay-deposit/settle-relay-deposit"
import {
  findGridVaBankDepositChainSettlementForSuppression,
  findPendingGridVaBankDepositForInboundAmount,
} from "@/lib/grid/grid-bank-deposit-chain-suppression"
import { isGridVaTurnkeyDustAmount } from "@/lib/grid/grid-va-turnkey-dust"
import { reconcileGridVaBankDepositCreditForSolanaTx } from "@/lib/grid/grid-bank-deposit-credit"
import {
  findPendingGridVaTurnkeySweepForInboundAmount,
  findGridVaTurnkeySweepForSolanaTx,
  settleGridVaTurnkeySweepForSolanaTx,
} from "@/lib/grid/va-turnkey-sweep"
import {
  findPendingGridPayoutRefundSweepForInboundAmount,
  settleGridPayoutRefundSweepForSolanaTx,
} from "@/lib/grid/payout-refund-sweep"
import { tryCompleteDepositSplitFromUserVaultInbound } from "@/lib/deposit-omnibus/execute-deposit-split"
import { tryCompleteYcFundBalanceFromUserVaultInbound } from "@/lib/yellowcard/execute-yc-fund-balance-split"
import { isDepositSplitEnabled } from "@/lib/deposit-omnibus/config"
import { turnkeyInboundLedgerRowExists } from "@/lib/turnkey/ledger-inbound-exists"
import { applyWalletBalanceDelta } from "@/lib/wallet/wallet-balances-db"
import { enqueueLiquiditySweepJob } from "@/lib/liquidity/sweep-jobs"
import { resolvePooledSolanaSourceAddress, ledgerCurrencyForStablecoinAsset } from "@/lib/liquidity/platform-pool"

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
}

export type TurnkeyInboundLedgerResult =
  | { kind: "suppressed_noah" }
  | { kind: "suppressed_easetag" }
  | { kind: "applied"; transactionId: string | null }
  | { kind: "skipped" }

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
  const pendingSweep = await findPendingGridVaTurnkeySweepForInboundAmount(admin, {
    userId: input.userId,
    businessId: input.businessId,
    amount: input.amount,
    currency: input.currency,
  })
  if (!pendingSweep) return
  await settleGridVaTurnkeySweepForSolanaTx(admin, {
    transferId: pendingSweep.transferId,
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
  opts?: { skipBalanceDelta?: boolean },
): Promise<TurnkeyInboundLedgerResult> {
  const { userId, businessId } = input
  const txHash = input.txHash ? String(input.txHash).trim() : null
  const status = input.status
  const direction = input.direction

  if (direction === "in") {
    if (txHash && status === "settled") {
      if (isDepositSplitEnabled()) {
        const completed = await tryCompleteDepositSplitFromUserVaultInbound(admin, {
          txHash,
          userId,
          businessId,
          amount: input.amount,
        }).catch(() => false)
        if (completed) {
          return { kind: "suppressed_noah" }
        }
      }

      const ycCompleted = await tryCompleteYcFundBalanceFromUserVaultInbound(admin, {
        txHash,
        userId,
        businessId,
        amount: input.amount,
      }).catch(() => false)
      if (ycCompleted) {
        return { kind: "suppressed_noah" }
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
        return { kind: "suppressed_noah" }
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
          return { kind: "suppressed_noah" }
        }
      }

      const gridSuppressed = await findGridVaBankDepositChainSettlementForSuppression(admin, {
        txHash,
        userId,
        businessId,
      })
      if (gridSuppressed) {
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
        return { kind: "suppressed_noah" }
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
        return { kind: "suppressed_noah" }
      }

      const ycSuppressed = await findYcFundBalanceChainSettlementForSuppression(admin, {
        txHash,
        userId,
        businessId,
      })
      if (ycSuppressed) {
        return { kind: "suppressed_noah" }
      }

      const stripeOnrampSuppressed = await findStripeOnrampChainSettlementForSuppression(admin, {
        txHash,
        userId,
        businessId,
      })
      if (stripeOnrampSuppressed) {
        return { kind: "suppressed_noah" }
      }
    }

    const pendingPayIn = await findPendingNoahBankOnrampForInboundAmount(admin, {
      userId,
      businessId,
      amount: input.amount,
      currency: input.currency,
    })
    if (pendingPayIn) {
      if (txHash) {
        if (pendingPayIn.ruleExecutionId) {
          await linkBankOnrampPayInToSolanaTxHash(admin, {
            ruleExecutionId: pendingPayIn.ruleExecutionId,
            solanaTxHash: txHash,
            userId,
            businessId,
          }).catch(() => {})
        }
        await reconcileNoahBankOnrampCreditForSolanaTx(admin, {
          solanaTxHash: txHash,
          userId,
          businessId,
        }).catch(() => {})
      }
      return { kind: "suppressed_noah" }
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
        const pendingRefundSweep = await findPendingGridPayoutRefundSweepForInboundAmount(admin, {
          userId,
          businessId,
          amount: input.amount,
          currency: input.currency,
        }).catch(() => null)
        if (pendingRefundSweep) {
          await settleGridPayoutRefundSweepForSolanaTx(admin, {
            transferId: pendingRefundSweep.transferId,
            solanaTxHash: txHash,
          }).catch(() => {})
        }
      }
      return { kind: "suppressed_noah" }
    }

    const pendingRefundSweep = await findPendingGridPayoutRefundSweepForInboundAmount(admin, {
      userId,
      businessId,
      amount: input.amount,
      currency: input.currency,
    })
    if (pendingRefundSweep) {
      if (txHash) {
        await settleGridPayoutRefundSweepForSolanaTx(admin, {
          transferId: pendingRefundSweep.transferId,
          solanaTxHash: txHash,
        }).catch(() => {})
        if (pendingRefundSweep.payoutLedgerTransactionId) {
          await persistGlobalPayoutRefundTxHashOnOutRow(admin, {
            outRowId: pendingRefundSweep.payoutLedgerTransactionId,
            txHash,
          }).catch(() => {})
        }
      }
      return { kind: "suppressed_noah" }
    }

    const pendingGridVa = await findPendingGridVaBankDepositForInboundAmount(admin, {
      userId,
      businessId,
      amount: input.amount,
      currency: input.currency,
      txHash,
    })
    if (pendingGridVa) {
      if (txHash) {
        await admin
          .from("transactions")
          .update({
            tx_hash: txHash,
            updated_at: new Date().toISOString(),
          })
          .eq("id", pendingGridVa.transactionId)
          .catch(() => undefined)
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
      }
      return { kind: "suppressed_noah" }
    }

    const pendingSweep = await findPendingGridVaTurnkeySweepForInboundAmount(admin, {
      userId,
      businessId,
      amount: input.amount,
      currency: input.currency,
    })
    if (pendingSweep) {
      if (txHash) {
        await settleGridVaTurnkeySweepForSolanaTx(admin, {
          transferId: pendingSweep.transferId,
          solanaTxHash: txHash,
          inboundAmount: input.amount,
        }).catch(() => {})
      }
      return { kind: "suppressed_noah" }
    }

    if (isGridVaTurnkeyDustAmount(input.amount) || input.amount <= 0) {
      return { kind: "skipped" }
    }
  }

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
    if (status === "settled" && txHash) {
      await updateEasetagSettlementSettled(admin, easetagSuppressed.transfer_group_id, txHash).catch(
        () => {},
      )
    }
    return { kind: "suppressed_easetag" }
  }

  const globalPayoutSuppressed = await findGlobalPayoutSettlementForChainSuppression(admin, {
    turnkeySendStatusId: input.providerTransactionId,
    txHash,
  })
  if (globalPayoutSuppressed && direction === "out") {
    return { kind: "suppressed_easetag" }
  }

  if (direction === "in" && status === "settled" && txHash) {
    const alreadyInLedger = await turnkeyInboundLedgerRowExists(admin, {
      signature: txHash,
      userId,
      businessId,
    })
    if (alreadyInLedger) {
      return { kind: "skipped" }
    }
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
      return { kind: "suppressed_noah" }
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
    metadata: input.metadata,
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
