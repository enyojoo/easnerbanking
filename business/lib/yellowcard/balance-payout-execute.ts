/**
 * Execute Yellowcard balance_payout: debit wallet → locked POST /send already done at quote →
 * omnibus USDC → YC wallet. Mirrors executeTurnkeyOfframpPayout shape.
 */
import { randomUUID } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { generateTransactionId } from "@/lib/transaction-id"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import {
  applyGlobalPayoutWalletDebitForEasnerPayoutId,
  reverseGlobalPayoutWalletDebitForEasnerPayoutId,
} from "@/lib/noah/global-payout-ledger"
import {
  buildRecipientSnapshotFromRow,
  normalizePayoutReviewSnapshot,
  type GlobalPayoutReviewSnapshot,
} from "@/lib/noah/build-payout-execute-snapshot"
import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"
import {
  buildYcBalancePayoutOutMetadata,
  buildYcOmnibusCryptoDepositMetadata,
  ycPendingPayoutProviderTransactionId,
} from "@/lib/yellowcard/yc-ledger"
import { executeYcBalancePayoutCryptoLeg } from "@/lib/yellowcard/payout-execute"

async function readAvailableBalance(
  admin: SupabaseClient,
  opts: { businessId: string | null; userId: string | null; currency: string },
): Promise<{ available: number; err?: string }> {
  let q = admin.from("wallet_balances").select("available_balance").eq("currency", opts.currency).limit(1)
  if (opts.businessId) q = q.eq("business_id", opts.businessId)
  else q = q.eq("user_id", opts.userId)
  const { data, error } = await q.maybeSingle()
  if (error) return { available: 0, err: error.message }
  return { available: Number(data?.available_balance ?? 0) }
}

export type ExecuteYcBalancePayoutInput = {
  admin: SupabaseClient
  userId: string
  businessId: string | null
  recipientRow: RecipientSellPrepareRow
  recipientId: string
  fiatAmount: number
  fiatCurrency: string
  countryCode: string
  channelId?: string
  idempotencyKey?: string
  reviewSnapshot?: GlobalPayoutReviewSnapshot | null
  sendNote?: string
  /** Locked YC send from quote. */
  yc: {
    sequenceId: string
    sendId?: string | null
    cryptoAmount: number
    walletAddress: string
    channelId: string
  }
  pricing: {
    totalDebited: number
    customerPrincipal: number
    marginAmount: number
    processingFee: number
    channelCost: number
    customerRate?: number
  }
}

export type ExecuteYcBalancePayoutResult =
  | {
      ok: true
      easnerPayoutId: string
      easnerTransactionId: string
      status: "pending" | "failed"
      ycCryptoDepositTxHash?: string | null
    }
  | { ok: false; error: string }

async function findExistingYcPayoutByIdempotency(
  admin: SupabaseClient,
  opts: { userId: string; businessId: string | null; idempotencyKey: string },
): Promise<ExecuteYcBalancePayoutResult | null> {
  let q = admin
    .from("transactions")
    .select("id, status, metadata, easner_transaction_id")
    .eq("provider", "yellowcard")
    .contains("metadata", { idempotency_key: opts.idempotencyKey })
    .in("status", ["pending", "processing", "settled"])
    .limit(1)
  if (opts.businessId) q = q.eq("business_id", opts.businessId)
  else q = q.eq("user_id", opts.userId)
  const { data } = await q.maybeSingle()
  if (!data) return null
  const meta = (data.metadata || {}) as Record<string, unknown>
  const easnerPayoutId = String(meta.easner_payout_id || "").trim()
  const easnerTransactionId = String(
    data.easner_transaction_id || meta.easner_transaction_id || easnerPayoutId || "",
  ).trim()
  if (!easnerPayoutId) return null
  return {
    ok: true,
    easnerPayoutId,
    easnerTransactionId: easnerTransactionId || generateTransactionId(),
    status: String(data.status || "pending").toLowerCase() === "failed" ? "failed" : "pending",
  }
}

export async function executeYcBalancePayout(
  input: ExecuteYcBalancePayoutInput,
): Promise<ExecuteYcBalancePayoutResult> {
  const {
    admin,
    userId,
    businessId,
    recipientRow,
    recipientId,
    fiatAmount,
    fiatCurrency,
    countryCode,
    reviewSnapshot: reviewSnapshotRaw,
    sendNote,
  } = input

  const walletAddress = String(input.yc.walletAddress || "").trim()
  const cryptoAmount = Number(input.yc.cryptoAmount)
  const sequenceId = String(input.yc.sequenceId || "").trim()
  if (!walletAddress) return { ok: false, error: "Yellowcard send wallet address missing from quote." }
  if (!Number.isFinite(cryptoAmount) || cryptoAmount <= 0) {
    return { ok: false, error: "Yellowcard crypto amount missing from quote." }
  }
  if (!sequenceId) return { ok: false, error: "Yellowcard sequence id missing from quote." }

  const idempotencyKey = String(input.idempotencyKey || "").trim()
  if (idempotencyKey) {
    const existing = await findExistingYcPayoutByIdempotency(admin, {
      userId,
      businessId,
      idempotencyKey,
    })
    if (existing) return existing
  }

  const totalDebited = Number(input.pricing.totalDebited)
  if (!Number.isFinite(totalDebited) || totalDebited <= 0) {
    return { ok: false, error: "Invalid total debited for Yellowcard payout." }
  }

  const { available, err: balErr } = await readAvailableBalance(admin, {
    businessId,
    userId: businessId ? null : userId,
    currency: "USD",
  })
  if (balErr) return { ok: false, error: "insufficient_balance" }
  if (available < totalDebited) return { ok: false, error: "insufficient_balance" }

  const easnerPayoutId = randomUUID()
  const easnerTransactionId = generateTransactionId()
  const now = new Date().toISOString()
  const payoutReview = normalizePayoutReviewSnapshot(reviewSnapshotRaw)
  const recipientSnapshot = buildRecipientSnapshotFromRow(recipientRow)
  const channelId = String(input.yc.channelId || input.channelId || "").trim()

  const metadata = buildYcBalancePayoutOutMetadata({
    easnerPayoutId,
    easnerTransactionId,
    sequenceId,
    ycSendId: input.yc.sendId ?? null,
    channelId: channelId || null,
    totalDebited,
    cryptoAuthorizedAmount: cryptoAmount,
    marginAmount: input.pricing.marginAmount,
    processingFee: input.pricing.processingFee,
    receiveAmount: fiatAmount,
    receiveCurrency: fiatCurrency,
    customerRate: input.pricing.customerRate,
    recipientId,
    recipientSnapshot,
    walletAddress,
    transactionStartedAt: now,
  })
  if (idempotencyKey) metadata.idempotency_key = idempotencyKey
  if (sendNote?.trim()) {
    metadata.send_note = sendNote.trim()
    metadata.note = sendNote.trim()
  }
  if (payoutReview) metadata.payout_review = payoutReview
  metadata.country_code = countryCode

  const pendingPtid = ycPendingPayoutProviderTransactionId(easnerPayoutId)
  const upsert = await upsertLedgerTransaction(admin, {
    userId,
    businessId,
    provider: "yellowcard",
    providerTransactionId: pendingPtid,
    status: "pending",
    amount: totalDebited,
    currency: "USD",
    direction: "out",
    payload: {
      phase: "awaiting_yc_crypto_deposit",
      yc_send_id: input.yc.sendId ?? null,
      sequence_id: sequenceId,
    },
    metadata,
    occurredAt: now,
    baseCurrency: "USD",
    asset: "USDC",
  })

  const transactionId = upsert.transactionId
  if (!transactionId) {
    return { ok: false, error: "failed_to_create_payout_ledger_row" }
  }

  // Link easner_transaction_id column when present
  try {
    await admin
      .from("transactions")
      .update({
        easner_transaction_id: easnerTransactionId,
        updated_at: now,
      })
      .eq("id", transactionId)
  } catch {
    // column may not exist on all envs
  }

  await admin.from("yc_transfers").insert({
    transaction_id: transactionId,
    user_id: userId,
    business_id: businessId,
    mode: "balance_payout",
    status: "pending",
    pay_in_currency: "USD",
    receive_currency: fiatCurrency,
    quoted_pay_in: totalDebited,
    quoted_receive: fiatAmount,
    customer_rate: input.pricing.customerRate ?? null,
    leg2_sequence_id: sequenceId,
    leg2_yc_id: input.yc.sendId ?? null,
    leg2_channel_id: channelId || null,
    settlement_info: {
      send: { walletAddress, cryptoAmount },
    },
    metadata: {
      easner_payout_id: easnerPayoutId,
      processing_fee: input.pricing.processingFee,
      margin_amount: input.pricing.marginAmount,
      channel_cost: input.pricing.channelCost,
    },
  })

  try {
    await applyGlobalPayoutWalletDebitForEasnerPayoutId(admin, { easnerPayoutId })
  } catch (e) {
    await admin
      .from("transactions")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", transactionId)
    return {
      ok: false,
      error: e instanceof Error ? e.message : "wallet_debit_failed",
    }
  }

  const deposit = await executeYcBalancePayoutCryptoLeg({
    transactionId,
    ycWalletAddress: walletAddress,
    cryptoAmountUsd: cryptoAmount,
  })

  const { data: txAfter } = await admin
    .from("transactions")
    .select("metadata")
    .eq("id", transactionId)
    .maybeSingle()
  const priorMeta = (txAfter?.metadata || {}) as Record<string, unknown>
  const cryptoMeta = buildYcOmnibusCryptoDepositMetadata({
    prior: priorMeta,
    easnerPayoutId,
    ycMode: "balance_payout",
    txHash: deposit.txHash,
    providerTransactionId: null,
  })

  if (!deposit.ok) {
    await admin
      .from("transactions")
      .update({
        status: "failed",
        metadata: {
          ...cryptoMeta,
          yc_crypto_deposit_error: deposit.error,
          yc_refund_expected: true,
          noah_refund_expected: true,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", transactionId)
    await reverseGlobalPayoutWalletDebitForEasnerPayoutId(admin, { easnerPayoutId }).catch(() => {})
    return { ok: false, error: deposit.error || "yc_crypto_deposit_failed" }
  }

  await admin
    .from("transactions")
    .update({
      status: "processing",
      metadata: {
        ...cryptoMeta,
        yc_crypto_deposit_status: "settled",
      },
      ...(deposit.txHash ? { tx_hash: deposit.txHash } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", transactionId)

  await admin
    .from("yc_transfers")
    .update({
      status: "leg2_in_progress",
      leg2_status: "pending_yc",
      metadata: {
        easner_payout_id: easnerPayoutId,
        leg2_deposit_tx_hash: deposit.txHash,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("transaction_id", transactionId)

  return {
    ok: true,
    easnerPayoutId,
    easnerTransactionId,
    status: "pending",
    ycCryptoDepositTxHash: deposit.txHash,
  }
}

/** Detect Yellowcard payout from quote formSessionId / explicit provider flag. */
export function isYcBalancePayoutQuote(input: {
  payoutProvider?: string | null
  formSessionId?: string | null
  ycSequenceId?: string | null
  ycWalletAddress?: string | null
}): boolean {
  if (String(input.payoutProvider || "").toLowerCase() === "yellowcard") return true
  const seq = String(input.ycSequenceId || "").trim()
  if (seq.startsWith("yc_quote_")) return true
  const fs = String(input.formSessionId || "").trim()
  if (fs.startsWith("yc_quote_")) return true
  if (String(input.ycWalletAddress || "").trim()) return true
  return false
}
