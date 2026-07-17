import type { SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { executeYcCryptoDeposit } from "@/lib/yellowcard/execute-yc-crypto-deposit"
import { reverseGlobalPayoutWalletDebitForEasnerPayoutId } from "@/lib/noah/global-payout-ledger"
import {
  buildEasnerRevenueSweepMetadataPatch,
  computeSweepAmountFromMetadata,
  FEE_SWEEP_MIN,
  readPriorSweepFromMetadata,
  sweepEasnerRevenueFromDepositOmnibus,
} from "@/lib/processing-fee/fee-wallet-sweep"

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
    .select("metadata")
    .eq("id", input.transactionId)
    .maybeSingle()
  const prior =
    existing?.metadata && typeof existing.metadata === "object"
      ? (existing.metadata as Record<string, unknown>)
      : {}
  await admin
    .from("transactions")
    .update({
      metadata: {
        ...prior,
        yc_crypto_deposit_status: deposit.status,
        yc_crypto_deposit_tx_hash: deposit.txHash,
        yc_crypto_deposit_provider_id: deposit.providerTransactionId,
        yc_crypto_deposit_error: deposit.errorMessage,
        suppress_in_feed: true,
        yc_crypto_deposit_leg: true,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.transactionId)

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

  const sweepAmt = computeSweepAmountFromMetadata(meta, { rowAmount: Number(row.amount ?? 0) })
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
    .select("id, metadata, amount")
    .eq("id", input.transactionId)
    .maybeSingle()
  if (!row?.id) return

  const prior = asMeta(row.metadata)
  const { sweepAmt, feeWalletSweepTxHash, captured } = await sweepYcBalancePayoutRevenueToFeeWallet(
    admin,
    { transactionId: row.id },
  )

  const txPatch = {
    ...prior,
    ...buildEasnerRevenueSweepMetadataPatch({
      sweepAmt,
      feeWalletSweepTxHash,
      captured,
    }),
    margin_capture_mode: "fee_wallet_omnibus",
  }

  await admin
    .from("transactions")
    .update({
      status: "settled",
      settled_at: now,
      metadata: txPatch,
      updated_at: now,
    })
    .eq("id", row.id)

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
