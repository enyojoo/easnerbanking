import type { SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import {
  findGlobalPayoutNoahRowByEasnerPayoutId,
  reverseGlobalPayoutWalletDebitForEasnerPayoutId,
  linkPendingGlobalPayoutProviderTransactionId,
  pendingGlobalPayoutProviderTransactionId,
} from "@/lib/noah/global-payout-ledger"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import {
  captureYcBalancePayoutProcessingFeeIfPending,
} from "@/lib/processing-fee/capture-pending-processing-fee"
import { isEasnerRevenueAlreadySwept } from "@/lib/processing-fee/fee-wallet-sweep"
import { createTurnkeySend } from "@/lib/turnkey/send"
import { sendStablecoinFromDepositOmnibus } from "@/lib/turnkey/send-from-omnibus"
import { resolveActiveUsdcSolanaAddress } from "@/lib/wallet/resolve-active-usdc-solana-address"
import {
  buildYcParentPayoutCryptoDepositTracking,
  buildYcRefundExpectedPatch,
  mergeYcPayoutLifecycle,
} from "@/lib/yellowcard/yc-ledger"

function asMeta(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
}

function pickExactLocalOnChainRefundAmount(meta: Record<string, unknown>, rowAmount: number): number | null {
  for (const key of ["crypto_authorized_amount", "noah_send_amount", "yc_refund_amount"] as const) {
    const n = Number(meta[key] ?? 0)
    if (Number.isFinite(n) && n > 0) return n
  }
  if (Number.isFinite(rowAmount) && rowAmount > 0) return rowAmount
  return null
}

export type RecreditYcExactLocalResult = {
  ok: boolean
  skipped?: boolean
  txHash: string | null
  amount: number | null
  error?: string
}

/**
 * Exact-local (`balance_exact`) failures leave USDC in the YC float — YC has no refundAddress.
 * Recredit the user's Turnkey ATA from deposit omnibus so ledger and chain stay aligned, then
 * stamp `yc_refund_*` so the inbound Turnkey credit is suppressed (same as direct-settlement).
 */
export async function recreditYcExactLocalPayoutOnChain(
  admin: SupabaseClient,
  input: { easnerPayoutId: string },
): Promise<RecreditYcExactLocalResult> {
  const easnerPayoutId = String(input.easnerPayoutId ?? "").trim()
  if (!easnerPayoutId) {
    return { ok: false, txHash: null, amount: null, error: "missing_easner_payout_id" }
  }

  const row = await findGlobalPayoutNoahRowByEasnerPayoutId(admin, easnerPayoutId)
  if (!row?.id) {
    return { ok: false, txHash: null, amount: null, error: "payout_row_not_found" }
  }

  const meta = asMeta(row.metadata)
  if (String(meta.yc_settlement_mode ?? "") !== "balance_exact") {
    return { ok: true, skipped: true, txHash: null, amount: null }
  }

  const existingHash = String(meta.yc_refund_tx_hash ?? meta.noah_refund_tx_hash ?? "").trim()
  if (existingHash || meta.yc_omnibus_refund_completed === true) {
    return {
      ok: true,
      skipped: true,
      txHash: existingHash || null,
      amount: Number(meta.yc_refund_amount ?? 0) || null,
    }
  }

  const amount = pickExactLocalOnChainRefundAmount(meta, row.amount)
  if (amount == null) {
    return { ok: false, txHash: null, amount: null, error: "missing_refund_amount" }
  }

  const destinationAddress = await resolveActiveUsdcSolanaAddress(admin, {
    userId: row.user_id,
    businessId: row.business_id,
  })
  if (!destinationAddress) {
    return { ok: false, txHash: null, amount, error: "user_turnkey_address_missing" }
  }

  const send = await sendStablecoinFromDepositOmnibus({
    ledgerCurrency: "USD",
    asset: "USDC",
    destinationAddress,
    amount,
    pollForSettlement: true,
    settlementPollTimeoutMs: 60_000,
  })

  if (send.status === "failed" || (send.status !== "settled" && send.status !== "skipped" && !send.txHash)) {
    const error = send.errorMessage || "omnibus_refund_failed"
    await admin
      .from("transactions")
      .update({
        metadata: {
          ...meta,
          yc_omnibus_refund_failed: true,
          yc_omnibus_refund_error: error,
          ops_alert: "yc_exact_local_omnibus_refund_failed",
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
    return { ok: false, txHash: send.txHash, amount, error }
  }

  const txHash = String(send.txHash ?? "").trim() || null
  const patched = buildYcRefundExpectedPatch(meta, {
    refundAmount: amount,
    refundTxHash: txHash,
  })
  await admin
    .from("transactions")
    .update({
      metadata: {
        ...patched,
        yc_omnibus_refund_completed: true,
        yc_omnibus_refund_provider_id: send.providerTransactionId,
        ...(send.dryRun ? { yc_omnibus_refund_dry_run: true } : {}),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)

  return { ok: true, txHash, amount }
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

/** YC SEND terminal success — settle payout, then capture fee wallet leg (Noah parity). */
export async function handleYcBalancePayoutSendComplete(input: {
  transactionId: string
  userId: string
  businessId: string | null
}): Promise<void> {
  const admin = createSupabaseAdmin()
  const now = new Date().toISOString()

  const { data: row } = await admin
    .from("transactions")
    .select("id, user_id, business_id, metadata, amount, provider, provider_transaction_id, status")
    .eq("id", input.transactionId)
    .maybeSingle()
  if (!row?.id) return

  const prior = asMeta(row.metadata)
  if (!String(prior.turnkey_send_id ?? "").trim()) return

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

  const alreadySettled = String(row.status ?? "").toLowerCase() === "settled"
  if (!alreadySettled) {
    const txPatch = mergeYcPayoutLifecycle(
      {
        ...prior,
        margin_capture_mode: "fee_wallet_deferred",
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
  }

  if (!isEasnerRevenueAlreadySwept(prior) && prior.processing_fee_pending === true) {
    await captureYcBalancePayoutProcessingFeeIfPending(admin, input).catch((e) => {
      console.warn("yc_balance_payout_processing_fee_capture:", e)
    })
  }

  const { data: after } = await admin
    .from("transactions")
    .select("metadata")
    .eq("id", row.id)
    .maybeSingle()
  const afterMeta = asMeta(after?.metadata)
  const sweepAmt = Number(afterMeta.fee_wallet_sweep ?? afterMeta.easner_revenue_sweep_amount ?? 0)
  const feeWalletSweepTxHash = String(afterMeta.fee_wallet_sweep_tx_hash ?? "").trim() || null

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
 * On SEND.FAILED for balance_payout:
 * - direct_crypto: YC refunds USDC on-chain to the user Turnkey address; we reverse the ledger.
 * - balance_exact: YC has no refundAddress — omnibus recredits the user Turnkey ATA first, then
 *   we reverse the ledger so available_balance matches on-chain again.
 */
export async function handleYcBalancePayoutSendFailed(input: {
  easnerPayoutId: string
}): Promise<void> {
  const admin = createSupabaseAdmin()
  const recredit = await recreditYcExactLocalPayoutOnChain(admin, {
    easnerPayoutId: input.easnerPayoutId,
  })
  if (!recredit.ok && !recredit.skipped) {
    console.error("[yc-balance-payout] exact-local on-chain recredit failed", {
      easnerPayoutId: input.easnerPayoutId,
      error: recredit.error,
    })
    // Do not reverse the ledger without on-chain funds — that would invent spendable balance.
    return
  }
  await reverseGlobalPayoutWalletDebitForEasnerPayoutId(admin, {
    easnerPayoutId: input.easnerPayoutId,
  })
}
