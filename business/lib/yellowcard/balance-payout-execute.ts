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
  buildYcParentPayoutCryptoDepositTracking,
  buildYcRefundExpectedPatch,
  ycPendingPayoutProviderTransactionId,
} from "@/lib/yellowcard/yc-ledger"
import { executeYcBalancePayoutCryptoLeg } from "@/lib/yellowcard/payout-execute"
import { lockYcBalancePayoutSend } from "@/lib/yellowcard/payout-quote"

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
  /** Locked YC send from quote preview — POST /send runs at execute. */
  yc: {
    sequenceId?: string
    sendId?: string | null
    cryptoAmount?: number
    walletAddress?: string
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

  const idempotencyKey = String(input.idempotencyKey || "").trim()
  if (idempotencyKey) {
    const existing = await findExistingYcPayoutByIdempotency(admin, {
      userId,
      businessId,
      idempotencyKey,
    })
    if (existing) return existing
  }

  let totalDebited = Number(input.pricing.totalDebited)
  if (!Number.isFinite(totalDebited) || totalDebited <= 0) {
    return { ok: false, error: "Invalid total debited for Yellowcard payout." }
  }

  const { available, err: balErr } = await readAvailableBalance(admin, {
    businessId,
    userId: businessId ? null : userId,
    currency: "USD",
  })
  if (balErr) return { ok: false, error: "insufficient_balance" }

  const { data: userRow } = await admin
    .from("users")
    .select(
      "residence_country,kyc_id_type,kyc_id_number,ng_local_id_type,ng_local_id_number,full_name,phone,email,date_of_birth,kyc_address_street,kyc_address_city,kyc_address_country",
    )
    .eq("id", userId)
    .maybeSingle()
  const { getWalletOwnerId } = await import("@/lib/wallet/resolve-wallet-owner")
  const walletOwnerId = await getWalletOwnerId(
    admin,
    businessId ? "business" : "individual",
    businessId ?? userId,
  )
  const { data: walletRow } = walletOwnerId
    ? await admin
        .from("wallet_accounts")
        .select("address")
        .eq("wallet_owner_id", walletOwnerId)
        .eq("ledger_currency", "USD")
        .eq("asset", "USDC")
        .eq("status", "active")
        .maybeSingle()
    : { data: null }
  const turnkeyAddr = String(walletRow?.address ?? "").trim()
  if (!turnkeyAddr) {
    return { ok: false, error: "User Solana wallet is required for Yellowcard payout refund routing." }
  }

  let locked
  try {
    locked = await lockYcBalancePayoutSend({
      userId,
      customerUID: userId,
      recipient: recipientRow,
      receiveFiatAmount: fiatAmount,
      sourceBalanceCurrency: "USD",
      userTurnkeyAddress: turnkeyAddr,
      channelId: String(input.yc.channelId || input.channelId || "").trim(),
      senderProfile: {
        residenceCountry: userRow?.residence_country,
        kycIdType: userRow?.kyc_id_type,
        kycIdNumber: userRow?.kyc_id_number,
        ngLocalIdType: userRow?.ng_local_id_type,
        ngLocalIdNumber: userRow?.ng_local_id_number,
        fullName: userRow?.full_name,
        phone: userRow?.phone,
        email: userRow?.email,
        dateOfBirth: userRow?.date_of_birth,
        addressStreet: userRow?.kyc_address_street,
        addressCity: userRow?.kyc_address_city,
        addressCountry: userRow?.kyc_address_country,
      },
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "yc_send_lock_failed" }
  }

  const walletAddress = locked.walletAddress
  const cryptoAmount = locked.cryptoAmount
  const sequenceId = locked.sequenceId
  totalDebited = locked.pricing.totalDebited
  if (available < totalDebited) return { ok: false, error: "insufficient_balance" }

  const easnerPayoutId = randomUUID()
  const easnerTransactionId = generateTransactionId()
  const now = new Date().toISOString()
  const payoutReview = normalizePayoutReviewSnapshot(reviewSnapshotRaw)
  const recipientSnapshot = buildRecipientSnapshotFromRow(recipientRow)
  const channelId = String(locked.channelId || input.yc.channelId || input.channelId || "").trim()

  const metadata = buildYcBalancePayoutOutMetadata({
    easnerPayoutId,
    easnerTransactionId,
    sequenceId,
    ycSendId: input.yc.sendId ?? null,
    channelId: channelId || null,
    totalDebited,
    cryptoAuthorizedAmount: cryptoAmount,
    marginAmount: locked.pricing.marginAmount,
    processingFee: locked.pricing.processingFee,
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
    leg2_yc_id: locked.sendId ?? input.yc.sendId ?? null,
    leg2_channel_id: channelId || null,
    settlement_info: {
      send: { walletAddress, cryptoAmount },
    },
    metadata: {
      easner_payout_id: easnerPayoutId,
      processing_fee: input.pricing.processingFee,
      margin_amount: locked.pricing.marginAmount,
      channel_cost: locked.pricing.channelCost,
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
  const providerTransactionId = String(
    locked.sendId ?? priorMeta.yc_send_id ?? priorMeta.form_session_id ?? sequenceId,
  )

  if (!deposit.ok) {
    const failedMeta = buildYcRefundExpectedPatch(
      buildYcParentPayoutCryptoDepositTracking({
        prior: priorMeta,
        txHash: deposit.txHash,
        status: "failed",
        error: deposit.error,
      }),
      { refundAmount: cryptoAmount },
    )
    await upsertLedgerTransaction(admin, {
      userId,
      businessId,
      provider: "yellowcard",
      providerTransactionId,
      status: "failed",
      amount: totalDebited,
      currency: "USD",
      direction: "out",
      metadata: failedMeta,
      occurredAt: now,
      baseCurrency: "USD",
      asset: "USDC",
    })
    await reverseGlobalPayoutWalletDebitForEasnerPayoutId(admin, { easnerPayoutId }).catch(() => {})
    return { ok: false, error: deposit.error || "yc_crypto_deposit_failed" }
  }

  const processingMeta = buildYcParentPayoutCryptoDepositTracking({
    prior: priorMeta,
    txHash: deposit.txHash,
    status: "settled",
  })
  await upsertLedgerTransaction(admin, {
    userId,
    businessId,
    provider: "yellowcard",
    providerTransactionId,
    status: "processing",
    amount: totalDebited,
    currency: "USD",
    direction: "out",
    metadata: processingMeta,
    occurredAt: now,
    txHash: deposit.txHash,
    baseCurrency: "USD",
    asset: "USDC",
  })

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
