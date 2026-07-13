import type { SupabaseClient } from "@supabase/supabase-js"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { findEasetagSettlementForChainSuppression, updateEasetagSettlementSettled } from "@/lib/ledger/easetag-settlement"
import {
  findGlobalPayoutRefundForInboundSuppression,
  findGlobalPayoutSettlementForChainSuppression,
  persistGlobalPayoutRefundTxHashOnOutRow,
} from "@/lib/noah/global-payout-ledger"
import { reconcileNoahBankOnrampCreditForSolanaTx, linkBankOnrampPayInToSolanaTxHash } from "@/lib/noah/credit-bank-onramp-wallet"
import {
  findNoahBankOnrampChainSettlementForSuppression,
  findPendingNoahBankOnrampForInboundAmount,
} from "@/lib/noah/noah-bank-onramp-chain-suppression"
import { tryCompleteDepositSplitFromUserVaultInbound } from "@/lib/deposit-omnibus/execute-deposit-split"
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
    if (isDepositSplitEnabled() && txHash && status === "settled") {
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
      }
      return { kind: "suppressed_noah" }
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
