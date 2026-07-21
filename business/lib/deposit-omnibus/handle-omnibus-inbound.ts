import type { SupabaseClient } from "@supabase/supabase-js"
import type { NormalizedTurnkeyBalanceDeposit } from "@/lib/turnkey/turnkey-balance-webhook-payload"
import {
  isDepositOmnibusAddress,
  isDepositSplitEnabled,
} from "@/lib/deposit-omnibus/config"
import { findBankOnrampPayInTransaction } from "@/lib/noah/find-bank-onramp-pay-in-transaction"
import { triggerDepositSplit } from "@/lib/deposit-omnibus/execute-deposit-split"
import { findYcTransferForOmnibusInbound } from "@/lib/yellowcard/yc-ledger"
import { triggerYcFundBalanceOmnibusSplit } from "@/lib/yellowcard/execute-yc-fund-balance-split"
import { isCrossBorderLeg1OmnibusSufficient } from "@/lib/yellowcard/cross-border-orchestrator"

/**
 * Omnibus Turnkey balance webhook — Noah deposit split or YC fund_balance / cross-border routing.
 */
export async function handleDepositOmnibusInbound(
  admin: SupabaseClient,
  deposit: NormalizedTurnkeyBalanceDeposit,
  _eventId: string,
): Promise<boolean> {
  if (!isDepositOmnibusAddress(deposit.address)) return false

  const txHash = deposit.txHash ? String(deposit.txHash).trim() : null
  if (!txHash) return false

  // YC fund_balance / cross_border leg1 — match before Noah (YC USDC lands on same omnibus).
  const ycTransfer = await findYcTransferForOmnibusInbound(admin, {
    txHash,
    amount: deposit.amount,
  })
  if (ycTransfer) {
    if (ycTransfer.mode === "fund_balance") {
      await triggerYcFundBalanceOmnibusSplit(admin, {
        transferId: ycTransfer.id,
        transactionId: ycTransfer.transaction_id,
        payload: { settlementInfo: { cryptoAmount: deposit.amount } },
        omnibusTxHash: txHash,
        omnibusAmount: deposit.amount,
      })
      return true
    }
    if (ycTransfer.mode === "cross_border_send") {
      const occurredAt = new Date().toISOString()
      const transferMeta =
        ycTransfer.metadata && typeof ycTransfer.metadata === "object"
          ? (ycTransfer.metadata as Record<string, unknown>)
          : {}
      const omnibusSufficient = isCrossBorderLeg1OmnibusSufficient({
        omnibusAmount: deposit.amount,
        metadata: transferMeta,
      })
      await admin
        .from("yc_transfers")
        .update({
          omnibus_in_actual: deposit.amount,
          leg1_status: "complete",
          status: omnibusSufficient
            ? String(ycTransfer.status) === "completed"
              ? ycTransfer.status
              : "leg1_settled"
            : "leg1_settled",
          metadata: {
            ...transferMeta,
            leg1_omnibus_tx_hash: txHash,
            leg1_settled_at: occurredAt,
            ...(omnibusSufficient
              ? {}
              : {
                  ops_alert: "yc_omnibus_underfunded",
                  omnibus_in_actual: deposit.amount,
                }),
          },
          updated_at: occurredAt,
        })
        .eq("id", ycTransfer.id)
      if (ycTransfer.transaction_id) {
        const { data: txRow } = await admin
          .from("transactions")
          .select("metadata")
          .eq("id", ycTransfer.transaction_id)
          .maybeSingle()
        const prior =
          txRow?.metadata && typeof txRow.metadata === "object"
            ? (txRow.metadata as Record<string, unknown>)
            : {}
        await admin
          .from("transactions")
          .update({
            status: "processing",
            metadata: {
              ...prior,
              leg1_settled_at: occurredAt,
              leg1_status: "complete",
              processing_at: prior.processing_at ?? occurredAt,
              ...(omnibusSufficient ? {} : { ops_alert: "yc_omnibus_underfunded" }),
            },
            updated_at: occurredAt,
          })
          .eq("id", ycTransfer.transaction_id)
      }
      if (omnibusSufficient) {
        try {
          const { maybeExecuteCrossBorderLeg2 } = await import(
            "@/lib/yellowcard/cross-border-orchestrator"
          )
          await maybeExecuteCrossBorderLeg2(admin, ycTransfer.id)
        } catch (e) {
          console.error("[handleDepositOmnibusInbound] yc cross-border leg2 trigger failed", e)
        }
      }
      return true
    }
  }

  if (!isDepositSplitEnabled()) return false

  let q = admin
    .from("transactions")
    .select("id, user_id, business_id, metadata")
    .eq("provider", "noah")
    .eq("direction", "out")
    .eq("tx_hash", txHash)
  const { data: orchOut } = await q.maybeSingle()

  const ruleExecutionId =
    orchOut?.metadata && typeof orchOut.metadata === "object"
      ? String((orchOut.metadata as Record<string, unknown>).noah_rule_execution_id ?? "").trim()
      : ""

  if (!ruleExecutionId || !orchOut?.user_id) {
    console.warn("[handleDepositOmnibusInbound] no orchestration out match for omnibus deposit", {
      txHash,
    })
    return false
  }

  const userId = String(orchOut.user_id)
  const businessId = orchOut.business_id ? String(orchOut.business_id) : null

  await triggerDepositSplit(admin, {
    ruleExecutionId,
    userId,
    businessId,
    omnibusInboundTxHash: txHash,
    omnibusReceived: deposit.amount,
  })

  return true
}

export async function triggerDepositSplitFromOrchestrationOut(
  admin: SupabaseClient,
  opts: {
    ruleExecutionId: string
    userId: string
    businessId: string | null
    solanaTxHash: string
    amount?: number | null
  },
): Promise<void> {
  if (!isDepositSplitEnabled()) return

  const payIn = await findBankOnrampPayInTransaction(admin, {
    depositId: opts.ruleExecutionId,
    userId: opts.userId,
    businessId: opts.businessId,
  })
  if (!payIn?.id) return

  await admin
    .from("transactions")
    .update({
      metadata: {
        ...payIn.metadata,
        noah_on_chain_tx_hash: opts.solanaTxHash,
        deposit_split_status: "pending",
      },
      tx_hash: opts.solanaTxHash,
      updated_at: new Date().toISOString(),
    })
    .eq("id", payIn.id)

  await triggerDepositSplit(admin, {
    ruleExecutionId: opts.ruleExecutionId,
    userId: opts.userId,
    businessId: opts.businessId,
    omnibusInboundTxHash: opts.solanaTxHash,
    omnibusReceived: opts.amount ?? null,
  })
}
