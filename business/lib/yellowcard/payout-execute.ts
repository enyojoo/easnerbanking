import type { SupabaseClient } from "@supabase/supabase-js"
import { computeYcBalancePayoutCappedFeeWalletSweep } from "@easner/shared"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { executeYcCryptoDeposit } from "@/lib/yellowcard/execute-yc-crypto-deposit"
import { reverseGlobalPayoutWalletDebitForEasnerPayoutId } from "@/lib/noah/global-payout-ledger"
import {
  buildEasnerRevenueSweepMetadataPatch,
  FEE_SWEEP_MIN,
  readPriorSweepFromMetadata,
  sweepEasnerRevenueFromDepositOmnibus,
} from "@/lib/processing-fee/fee-wallet-sweep"
import {
  buildYcParentPayoutCryptoDepositTracking,
  mergeYcPayoutLifecycle,
} from "@/lib/yellowcard/yc-ledger"

function asMeta(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
}

/**
 * After ledger debit + YC POST /send: deposit USDC from omnibus to YC wallet.
 */
export async function executeYcBalancePayoutCryptoLeg(input: {
  transactionId: string
  ycWalletAddress: string
  cryptoAmountUsd: number
}): Promise<{ ok: boolean; txHash: string | null; error?: string }> {
  const deposit = await executeYcCryptoDeposit({
    ycWalletAddress: input.ycWalletAddress,
    cryptoAmountUsd: input.cryptoAmountUsd,
    pollForSettlement: true,
  })

  const admin = createSupabaseAdmin()
  const { data: existing } = await admin
    .from("transactions")
    .select("id,user_id,business_id,metadata,amount,provider,provider_transaction_id")
    .eq("id", input.transactionId)
    .maybeSingle()
  const prior =
    existing?.metadata && typeof existing.metadata === "object"
      ? (existing.metadata as Record<string, unknown>)
      : {}
  const trackingMeta = buildYcParentPayoutCryptoDepositTracking({
    prior,
    txHash: deposit.txHash,
    providerTransactionId: deposit.providerTransactionId,
    status: deposit.status,
    error: deposit.errorMessage,
  })
  if (existing?.id) {
    await upsertLedgerTransaction(admin, {
      userId: String(existing.user_id),
      businessId: existing.business_id ? String(existing.business_id) : null,
      provider: String(existing.provider ?? "yellowcard"),
      providerTransactionId: String(
        existing.provider_transaction_id ??
          prior.yc_send_id ??
          prior.form_session_id ??
          prior.yc_sequence_id ??
          existing.id,
      ),
      status: String(existing.status ?? "pending"),
      amount: Number(existing.amount ?? 0),
      currency: "USD",
      direction: "out",
      metadata: trackingMeta,
      baseCurrency: "USD",
      asset: "USDC",
    })
  }

  if (deposit.status === "failed") {
    return { ok: false, txHash: null, error: deposit.errorMessage ?? "yc_crypto_deposit_failed" }
  }
  return { ok: true, txHash: deposit.txHash }
}

async function sweepYcBalancePayoutRevenueToFeeWallet(
  admin: SupabaseClient,
  input: { transactionId: string },
): Promise<{ sweepAmt: number; feeWalletSweepTxHash: string | null; captured: boolean }> {
  const { data: row } = await admin
    .from("transactions")
    .select("id, metadata, amount")
    .eq("id", input.transactionId)
    .maybeSingle()
  if (!row?.id) return { sweepAmt: 0, feeWalletSweepTxHash: null, captured: false }

  const meta = asMeta(row.metadata)
  const prior = readPriorSweepFromMetadata(meta)
  if (prior.captured) {
    return prior
  }

  const totalDebited = Number(meta.total_debited ?? row.amount ?? 0)
  const cryptoAuthorized = Number(meta.crypto_authorized_amount ?? meta.noah_send_amount ?? 0)
  const sweepAmt = computeYcBalancePayoutCappedFeeWalletSweep({
    totalDebited,
    cryptoAuthorizedAmount: cryptoAuthorized,
    marginAmount: Number(meta.margin_amount ?? 0),
    processingFee: Number(meta.processing_fee ?? 0),
  })
  if (sweepAmt < FEE_SWEEP_MIN) {
    return { sweepAmt, feeWalletSweepTxHash: null, captured: true }
  }

  const sweep = await sweepEasnerRevenueFromDepositOmnibus({
    ledgerCurrency: "USD",
    amount: sweepAmt,
    logTag: "yc-balance-payout",
  })

  return {
    sweepAmt,
    feeWalletSweepTxHash: sweep.feeWalletSweepTxHash,
    captured: sweep.captured,
  }
}

export async function handleYcBalancePayoutSendComplete(input: {
  transactionId: string
  userId: string
  businessId: string | null
}): Promise<void> {
  const admin = createSupabaseAdmin()
  const now = new Date().toISOString()

  const { data: row } = await admin
    .from("transactions")
    .select("id, user_id, business_id, metadata, amount, provider, provider_transaction_id")
    .eq("id", input.transactionId)
    .maybeSingle()
  if (!row?.id) return

  const prior = asMeta(row.metadata)
  const { sweepAmt, feeWalletSweepTxHash, captured } = await sweepYcBalancePayoutRevenueToFeeWallet(
    admin,
    { transactionId: row.id },
  )

  const txPatch = mergeYcPayoutLifecycle(
    {
      ...prior,
      ...buildEasnerRevenueSweepMetadataPatch({
        sweepAmt,
        feeWalletSweepTxHash,
        captured,
      }),
      margin_capture_mode: "fee_wallet_omnibus",
      processing_fee_pending: false,
    },
    { completed_at: now, processing_at: now },
  )

  await upsertLedgerTransaction(admin, {
    userId: String(row.user_id),
    businessId: row.business_id ? String(row.business_id) : null,
    provider: String(row.provider ?? "yellowcard"),
    providerTransactionId: String(
      row.provider_transaction_id ??
        prior.yc_send_id ??
        prior.form_session_id ??
        prior.yc_sequence_id ??
        row.id,
    ),
    status: "settled",
    amount: Number(row.amount ?? 0),
    currency: "USD",
    direction: "out",
    metadata: txPatch,
    occurredAt: now,
    settledAt: now,
    baseCurrency: "USD",
    asset: "USDC",
  })

  const { data: transfer } = await admin
    .from("yc_transfers")
    .select("id, metadata")
    .eq("transaction_id", row.id)
    .eq("mode", "balance_payout")
    .maybeSingle()

  if (transfer?.id) {
    const transferMeta = asMeta(transfer.metadata)
    await admin
      .from("yc_transfers")
      .update({
        fee_wallet_sweep: sweepAmt > 0 ? sweepAmt : null,
        metadata: {
          ...transferMeta,
          ...(feeWalletSweepTxHash ? { fee_wallet_sweep_tx_hash: feeWalletSweepTxHash } : {}),
        },
        updated_at: now,
      })
      .eq("id", transfer.id)
  }
}

/**
 * On SEND.FAILED for balance_payout: USDC refunds to user wallet; reverse ledger debit.
 */
export async function handleYcBalancePayoutSendFailed(input: {
  easnerPayoutId: string
}): Promise<void> {
  const admin = createSupabaseAdmin()
  await reverseGlobalPayoutWalletDebitForEasnerPayoutId(admin, {
    easnerPayoutId: input.easnerPayoutId,
  })
}
