import type { SupabaseClient } from "@supabase/supabase-js"
import { computeYcBalancePayoutCappedFeeWalletSweep } from "@easner/shared"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { reverseGlobalPayoutWalletDebitForEasnerPayoutId, linkPendingGlobalPayoutProviderTransactionId, pendingGlobalPayoutProviderTransactionId } from "@/lib/noah/global-payout-ledger"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import { resolveNoahAccountContextFromLedgerScope } from "@/lib/processing-fee/capture-pending-processing-fee"
import {
  buildEasnerRevenueSweepMetadataPatch,
  FEE_SWEEP_MIN,
  readPriorSweepFromMetadata,
  sweepEasnerRevenueFromUserTurnkeyWallet,
} from "@/lib/processing-fee/fee-wallet-sweep"
import { createTurnkeySend } from "@/lib/turnkey/send"
import {
  buildYcParentPayoutCryptoDepositTracking,
  mergeYcPayoutLifecycle,
} from "@/lib/yellowcard/yc-ledger"

function asMeta(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
}

/**
 * After ledger debit + YC POST /send: user Turnkey USDC → YC settlement wallet.
 * Mirrors Noah global payout execute (createTurnkeySend + globalPayout metadata).
 */
export async function executeYcBalancePayoutTurnkeyLeg(input: {
  admin: SupabaseClient
  ctx: NoahAccountContext
  transactionId: string
  easnerPayoutId: string
  ycWalletAddress: string
  cryptoAmountUsd: number
  totalDebited: number
  formSessionId: string
}): Promise<{ ok: boolean; txHash: string | null; turnkeySendId?: string | null; error?: string }> {
  const destinationAddress = String(input.ycWalletAddress || "").trim()
  const amount = Number(input.cryptoAmountUsd)
  if (!destinationAddress || !Number.isFinite(amount) || amount <= 0) {
    return { ok: false, txHash: null, error: "invalid_yc_turnkey_send_input" }
  }

  let send: Awaited<ReturnType<typeof createTurnkeySend>>
  try {
    send = await createTurnkeySend(input.admin, {
      ctx: input.ctx,
      asset: "USDC",
      chain: "solana",
      destinationAddress,
      amount,
      settlementPollTimeoutMs: 0,
      globalPayout: {
        easnerPayoutId: input.easnerPayoutId,
        formSessionId: input.formSessionId,
        walletDebitAmount: input.totalDebited,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "turnkey_send_failed"
    return { ok: false, txHash: null, error: msg }
  }

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
    prior: {
      ...prior,
      turnkey_send_id: send.providerTransactionId,
      turnkey_send_status: send.status,
    },
    txHash: send.txHash,
    providerTransactionId: send.providerTransactionId,
    status: send.status,
    error: send.status === "failed" ? send.chainFailureDetail ?? "turnkey_send_failed" : null,
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

  if (send.status === "failed") {
    return {
      ok: false,
      txHash: send.txHash,
      turnkeySendId: send.providerTransactionId,
      error: send.chainFailureDetail?.trim() || "turnkey_send_failed",
    }
  }

  return {
    ok: true,
    txHash: send.txHash,
    turnkeySendId: send.providerTransactionId,
  }
}

async function sweepYcBalancePayoutRevenueToFeeWallet(
  admin: SupabaseClient,
  input: { transactionId: string; userId: string; businessId: string | null },
): Promise<{ sweepAmt: number; feeWalletSweepTxHash: string | null; captured: boolean; turnkeySendId?: string | null }> {
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

  const ctx = await resolveNoahAccountContextFromLedgerScope(admin, {
    userId: input.userId,
    businessId: input.businessId,
  })
  if (!ctx) {
    return { sweepAmt, feeWalletSweepTxHash: null, captured: false }
  }

  const easnerPayoutId = String(meta.easner_payout_id ?? "").trim()
  const sweep = await sweepEasnerRevenueFromUserTurnkeyWallet(admin, {
    ctx,
    ledgerCurrency: "USD",
    amount: sweepAmt,
    globalPayout: easnerPayoutId
      ? {
          easnerPayoutId,
          formSessionId: String(meta.form_session_id ?? meta.yc_sequence_id ?? ""),
        }
      : undefined,
    logTag: "yc-balance-payout",
  })

  return {
    sweepAmt,
    feeWalletSweepTxHash: sweep.feeWalletSweepTxHash,
    captured: sweep.captured,
    turnkeySendId: sweep.turnkeySendId,
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
  const { sweepAmt, feeWalletSweepTxHash, captured, turnkeySendId } =
    await sweepYcBalancePayoutRevenueToFeeWallet(admin, {
      transactionId: row.id,
      userId: input.userId,
      businessId: input.businessId,
    })

  const easnerPayoutId = String(prior.easner_payout_id ?? "").trim()
  const ycSendId = String(prior.yc_send_id ?? prior.form_session_id ?? "").trim()
  const currentPtid = String(row.provider_transaction_id ?? "").trim()
  let providerTransactionId = currentPtid || ycSendId || String(row.id)
  if (
    easnerPayoutId &&
    ycSendId &&
    currentPtid === pendingGlobalPayoutProviderTransactionId(easnerPayoutId)
  ) {
    await linkPendingGlobalPayoutProviderTransactionId(admin, {
      pendingRowId: row.id,
      providerTransactionId: ycSendId,
    })
    providerTransactionId = ycSendId
  }

  const txPatch = mergeYcPayoutLifecycle(
    {
      ...prior,
      ...buildEasnerRevenueSweepMetadataPatch({
        sweepAmt,
        feeWalletSweepTxHash,
        captured,
        turnkeySendId,
      }),
      margin_capture_mode: "fee_wallet_deferred",
      processing_fee_pending: false,
    },
    { completed_at: now, processing_at: now },
  )

  await upsertLedgerTransaction(admin, {
    userId: String(row.user_id),
    businessId: row.business_id ? String(row.business_id) : null,
    provider: String(row.provider ?? "yellowcard"),
    providerTransactionId,
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
          margin_capture_mode: "fee_wallet_deferred",
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
