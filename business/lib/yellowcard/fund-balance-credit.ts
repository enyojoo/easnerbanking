import type { SupabaseClient } from "@supabase/supabase-js"
import { computeEasnerRevenueFeeWalletSweepAmount } from "@easner/shared"
import { applyWalletBalanceDelta } from "@/lib/wallet/wallet-balances-db"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import {
  readPriorSweepFromMetadata,
  sweepEasnerRevenueFromDepositOmnibus,
} from "@/lib/processing-fee/fee-wallet-sweep"
import {
  buildYcFundBalanceReceiveMetadata,
  mergeYcFundBalanceLifecycle,
} from "@/lib/yellowcard/yc-ledger"
import { resolveLedgerOccurredAt } from "@/lib/ledger/ledger-occurred-at"

function asMeta(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
}

/**
 * Credit USD balance when YC fund_balance receive settles to omnibus.
 * Idempotent via wallet_balance_credit_key on the transaction row.
 */
export async function creditFundBalanceFromYcReceive(
  admin: SupabaseClient,
  input: {
    transferId: string
    transactionId: string | null
    payload: Record<string, unknown>
    omnibusTxHash?: string | null
  },
): Promise<{ credited: boolean; creditAmt: number }> {
  const { data: transfer } = await admin
    .from("yc_transfers")
    .select("*")
    .eq("id", input.transferId)
    .maybeSingle()
  if (!transfer || transfer.mode !== "fund_balance") {
    return { credited: false, creditAmt: 0 }
  }
  if (String(transfer.status) === "completed") {
    return { credited: false, creditAmt: 0 }
  }

  const transferMeta = asMeta(transfer.metadata)
  const settlement = (input.payload.settlementInfo ??
    input.payload.settlement_info ??
    transfer.settlement_info) as Record<string, unknown> | null
  const cryptoAmount = Number(
    settlement?.cryptoAmount ?? transfer.omnibus_in_actual ?? transferMeta.usd_credit ?? 0,
  )
  const processingFee = Number(transferMeta.processing_fee ?? 0)
  const quotedCredit = Number(transferMeta.usd_credit ?? transfer.quoted_receive ?? 0)
  const creditAmt =
    quotedCredit > 0 ? quotedCredit : Math.max(0, cryptoAmount - processingFee)
  if (!Number.isFinite(creditAmt) || creditAmt <= 0) {
    throw new Error("fund_balance_credit_amount_invalid")
  }

  const creditKey = `yc_fund_balance:${input.transferId}`
  const now = new Date().toISOString()
  let transactionId = input.transactionId

  if (transactionId) {
    const { data: txRow } = await admin
      .from("transactions")
      .select("id, metadata, status")
      .eq("id", transactionId)
      .maybeSingle()
    const prior = asMeta(txRow?.metadata)
    if (prior.wallet_balance_credit_key === creditKey || prior.balance_delta_applied === true) {
      return { credited: false, creditAmt }
    }
  }

  await applyWalletBalanceDelta(admin, {
    userId: transfer.business_id ? null : String(transfer.user_id),
    businessId: transfer.business_id ? String(transfer.business_id) : null,
    currency: "USD",
    delta: creditAmt,
  })

  const marginAmount = Number(transferMeta.margin_amount ?? Math.max(0, cryptoAmount - creditAmt - processingFee))
  const feeSweep = computeEasnerRevenueFeeWalletSweepAmount({
    marginAmount,
    processingFee,
    ledgerSurplus: cryptoAmount - creditAmt,
  })

  let feeWalletSweepTxHash: string | null = null
  if (!readPriorSweepFromMetadata(transferMeta).captured && feeSweep > 0) {
    const sweep = await sweepEasnerRevenueFromDepositOmnibus({
      ledgerCurrency: "USD",
      amount: feeSweep,
      logTag: "yc-fund-balance",
    })
    feeWalletSweepTxHash = sweep.feeWalletSweepTxHash
  }

  await admin
    .from("yc_transfers")
    .update({
      status: "completed",
      leg1_status: "complete",
      omnibus_in_actual: cryptoAmount,
      fee_wallet_sweep: feeSweep > 0 ? feeSweep : null,
      metadata: {
        ...transferMeta,
        margin_amount: marginAmount,
        processing_fee: processingFee,
        margin_capture_mode: "fee_wallet_omnibus",
        ...(input.omnibusTxHash ? { leg1_omnibus_tx_hash: input.omnibusTxHash } : {}),
        ...(feeWalletSweepTxHash ? { fee_wallet_sweep_tx_hash: feeWalletSweepTxHash } : {}),
        usd_credit_applied: creditAmt,
      },
      updated_at: now,
    })
    .eq("id", input.transferId)

  const sequenceId = String(transfer.leg1_sequence_id ?? "")
  const baseMeta = buildYcFundBalanceReceiveMetadata({
    sequenceId,
    transferId: input.transferId,
    payload: input.payload,
    localPayIn: transfer.quoted_pay_in != null ? Number(transfer.quoted_pay_in) : null,
    localCurrency: transfer.pay_in_currency ? String(transfer.pay_in_currency) : null,
    usdCredit: creditAmt,
    processingFee,
  })
  const lifecycleMeta = mergeYcFundBalanceLifecycle(baseMeta, {
    completed_at: now,
    processing_at: now,
  })
  // Bank deposit lifecycle treats on_chain_settled_at as funds-available for non-verification.
  lifecycleMeta.on_chain_settled_at = now

  if (transactionId) {
    const { data: txRow } = await admin
      .from("transactions")
      .select("metadata")
      .eq("id", transactionId)
      .maybeSingle()
    const prior = asMeta(txRow?.metadata)
    await admin
      .from("transactions")
      .update({
        status: "settled",
        amount: creditAmt,
        settled_at: now,
        occurred_at: now,
        metadata: {
          ...prior,
          ...lifecycleMeta,
          wallet_balance_credit_key: creditKey,
          balance_delta_applied: true,
          ...(input.omnibusTxHash ? { yc_omnibus_tx_hash: input.omnibusTxHash } : {}),
        },
        updated_at: now,
      })
      .eq("id", transactionId)
  } else {
    const upsert = await upsertLedgerTransaction(admin, {
      userId: String(transfer.user_id),
      businessId: transfer.business_id ? String(transfer.business_id) : null,
      provider: "yellowcard",
      providerTransactionId: String(transfer.leg1_yc_id ?? sequenceId),
      status: "settled",
      amount: creditAmt,
      currency: "USD",
      direction: "in",
      payload: input.payload,
      metadata: {
        ...lifecycleMeta,
        wallet_balance_credit_key: creditKey,
        balance_delta_applied: true,
      },
      occurredAt: now,
      settledAt: now,
      baseCurrency: "USD",
    })
    transactionId = upsert.transactionId
    if (transactionId) {
      await admin
        .from("yc_transfers")
        .update({ transaction_id: transactionId, updated_at: now })
        .eq("id", input.transferId)
    }
  }

  return { credited: true, creditAmt }
}

/**
 * Patch fund_balance ledger for intermediate RECEIVE statuses (no credit yet).
 */
export async function patchYcFundBalanceReceiveStatus(
  admin: SupabaseClient,
  input: {
    transferId: string
    transactionId: string | null
    sequenceId: string
    status: "pending" | "processing" | "failed"
    payload: Record<string, unknown>
    occurredAt?: string
  },
): Promise<void> {
  const now = input.occurredAt ?? new Date().toISOString()
  const { data: transfer } = await admin
    .from("yc_transfers")
    .select("metadata, status, quoted_pay_in, pay_in_currency, quoted_receive")
    .eq("id", input.transferId)
    .maybeSingle()
  if (!transfer) return
  if (String(transfer.status) === "completed") return

  const transferStatus =
    input.status === "failed"
      ? "failed"
      : input.status === "processing"
        ? "processing"
        : "awaiting_pay_in"

  await admin
    .from("yc_transfers")
    .update({
      status: transferStatus,
      leg1_status: input.status,
      updated_at: now,
    })
    .eq("id", input.transferId)

  if (!input.transactionId) return

  const { data: txRow } = await admin
    .from("transactions")
    .select("metadata, occurred_at, created_at")
    .eq("id", input.transactionId)
    .maybeSingle()
  const prior = asMeta(txRow?.metadata)
  const occurredAt = resolveLedgerOccurredAt({
    occurredAt: txRow?.occurred_at != null ? String(txRow.occurred_at) : null,
    createdAt: txRow?.created_at != null ? String(txRow.created_at) : null,
    fallback: now,
  })
  let meta = buildYcFundBalanceReceiveMetadata({
    prior,
    sequenceId: input.sequenceId,
    transferId: input.transferId,
    payload: input.payload,
    localPayIn: transfer.quoted_pay_in != null ? Number(transfer.quoted_pay_in) : null,
    localCurrency: transfer.pay_in_currency ? String(transfer.pay_in_currency) : null,
    usdCredit: transfer.quoted_receive != null ? Number(transfer.quoted_receive) : null,
  })
  if (input.status === "processing" || input.status === "pending") {
    meta = mergeYcFundBalanceLifecycle(meta, { processing_at: now })
  }
  if (input.status === "failed") {
    meta = mergeYcFundBalanceLifecycle(meta, { failed_at: now })
  }

  await admin
    .from("transactions")
    .update({
      status: input.status === "failed" ? "failed" : input.status === "processing" ? "processing" : "pending",
      metadata: meta,
      occurred_at: occurredAt,
      updated_at: now,
    })
    .eq("id", input.transactionId)
}
