/**
 * Execute Yellowcard balance_payout: debit wallet → locked POST /send already done at confirm →
 * user Turnkey USDC → YC wallet. Mirrors executeTurnkeyOfframpPayout shape.
 */
import { randomUUID } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { generateTransactionId } from "@/lib/transaction-id"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import {
  applyGlobalPayoutWalletDebitForEasnerPayoutId,
  reverseGlobalPayoutWalletDebitForEasnerPayoutId,
} from "@/lib/noah/global-payout-ledger"
import { resolveNoahAccountContextFromLedgerScope } from "@/lib/processing-fee/capture-pending-processing-fee"
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
  mergeYcPayoutLifecycle,
  ycPendingPayoutProviderTransactionId,
} from "@/lib/yellowcard/yc-ledger"
import { executeYcBalancePayoutTurnkeyLeg } from "@/lib/yellowcard/payout-execute"
import {
  claimPayoutLockSession,
  getPayoutLockSession,
} from "@/lib/payout/payout-lock-session"
import { hashRecipientSnapshot } from "@/lib/payout/recipient-snapshot-hash"
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
  destinationRef?: string
  fiatAmount: number
  fiatCurrency: string
  countryCode: string
  channelId?: string
  idempotencyKey?: string
  reviewSnapshot?: GlobalPayoutReviewSnapshot | null
  sendNote?: string
  lockId?: string
  /** Locked YC send from confirm — POST /send runs at confirm when lock-on-review enabled. */
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
      turnkeySendId?: string | null
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
  const { resolveActiveUsdcSolanaAddress } = await import(
    "@/lib/wallet/resolve-active-usdc-solana-address"
  )
  const turnkeyAddr = (await resolveActiveUsdcSolanaAddress(admin, { userId, businessId })) ?? ""
  if (!turnkeyAddr) {
    return { ok: false, error: "User Solana wallet is required for Yellowcard payout refund routing." }
  }

  let locked:
    | Awaited<ReturnType<typeof lockYcBalancePayoutSend>>
    | {
        sequenceId: string
        sendId?: string | null
        channelId: string
        cryptoAmount: number
        walletAddress: string
        pricing: ExecuteYcBalancePayoutInput["pricing"] & { customerRate?: number }
        ycLegFeesUsd: number
        lockedLocalAmount?: number
        requestedLocalAmount?: number
        recipientSurplusLocal?: number
        payoutQuantumLocal?: number
        settlementQuantumUsd?: number
        precisionMode?: "micro" | "cent"
        sendLegFeeLocal?: number
      }

  // YC execution is always based on the server-side review lock. Lock-at-PIN can silently
  // change recipient and debit amounts and is therefore intentionally unsupported.
  const useLockOnReview = true
  const lockId = String(input.lockId || "").trim()

  if (useLockOnReview) {
    if (!lockId) {
      return { ok: false, error: "Payout lock expired or invalid. Go back and review again." }
    }
    const lockRow = await getPayoutLockSession(admin, { lockId, userId })
    if (!lockRow || lockRow.provider !== "yellowcard") {
      return { ok: false, error: "Payout lock expired or invalid. Go back and review again." }
    }
    if (
      lockRow.destination_ref !==
      (input.destinationRef || `recipient:${recipientId}`)
    ) {
      return { ok: false, error: "Payout lock does not match this recipient." }
    }
    const snapshotHash = hashRecipientSnapshot(recipientRow)
    if (lockRow.recipient_snapshot_hash !== snapshotHash) {
      return { ok: false, error: "Recipient changed since review. Go back and confirm again." }
    }
    const payload = lockRow.provider_payload_json
    const pricing = lockRow.pricing_json
    locked = {
      sequenceId: String(payload.sequenceId || input.yc.sequenceId || ""),
      sendId: (payload.sendId as string | null | undefined) ?? input.yc.sendId ?? null,
      channelId: String(payload.channelId || input.yc.channelId || input.channelId || ""),
      cryptoAmount: Number(payload.cryptoAmount ?? input.yc.cryptoAmount ?? 0),
      walletAddress: String(payload.walletAddress || input.yc.walletAddress || ""),
      pricing: {
        totalDebited: pricing.totalDebited,
        customerPrincipal: pricing.customerPrincipal,
        marginAmount: pricing.marginAmount,
        processingFee: pricing.processingFee,
        channelCost: pricing.channelCost,
        customerRate: pricing.settlement?.customerRate,
      },
        ycLegFeesUsd: pricing.ycLegFeesUsd ?? 0,
        lockedLocalAmount: Number(payload.lockedLocalAmount ?? 0),
        requestedLocalAmount: Number(payload.requestedLocalAmount ?? fiatAmount),
        recipientSurplusLocal: Number(payload.recipientSurplusLocal ?? 0),
        payoutQuantumLocal: Number(payload.payoutQuantumLocal ?? 0),
        settlementQuantumUsd: Number(payload.settlementQuantumUsd ?? 0),
        precisionMode:
          payload.precisionMode === "micro" ? "micro" : payload.precisionMode === "cent" ? "cent" : undefined,
        sendLegFeeLocal: Number(payload.sendLegFeeLocal ?? 0),
      }
    if (!(locked.cryptoAmount > 0) || !locked.walletAddress) {
      return { ok: false, error: "Locked Yellowcard payout is incomplete." }
    }
    const lockedRecipient = Number(locked.lockedLocalAmount ?? 0)
    const lockedRequested = Number(locked.requestedLocalAmount ?? fiatAmount)
    const lockedQuantum = Number(locked.payoutQuantumLocal ?? 0)
    const lockedSurplus = lockedRecipient - lockedRequested
    if (
      !(lockedRecipient >= lockedRequested) ||
      lockedSurplus < -0.000001 ||
      (lockedQuantum > 0 && lockedSurplus > lockedQuantum + 0.000001)
    ) {
      return { ok: false, error: "YC_SEND_NO_COMPLIANT_QUANTUM" }
    }
    totalDebited = locked.pricing.totalDebited
  } else {
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
    totalDebited = locked.pricing.totalDebited
  }

  if (available < totalDebited) return { ok: false, error: "insufficient_balance" }

  if (!lockId || !(await claimPayoutLockSession(admin, { lockId, userId }))) {
    return { ok: false, error: "YC_QUOTE_EXPIRED" }
  }

  const ctx = await resolveNoahAccountContextFromLedgerScope(admin, { userId, businessId })
  if (!ctx) {
    return { ok: false, error: "Could not resolve wallet context for Yellowcard payout." }
  }

  const walletAddress = locked.walletAddress
  const cryptoAmount = locked.cryptoAmount
  const sequenceId = locked.sequenceId
  const actualReceiveAmount =
    "lockedLocalAmount" in locked && Number(locked.lockedLocalAmount ?? 0) > 0
      ? Number(locked.lockedLocalAmount)
      : fiatAmount
  const requestedReceiveAmount =
    "requestedLocalAmount" in locked && Number(locked.requestedLocalAmount ?? 0) > 0
      ? Number(locked.requestedLocalAmount)
      : fiatAmount

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
    ycSendId: locked.sendId ?? null,
    channelId: channelId || null,
    totalDebited,
    cryptoAuthorizedAmount: cryptoAmount,
    marginAmount: locked.pricing.marginAmount,
    processingFee: locked.pricing.processingFee,
    receiveAmount: actualReceiveAmount,
    requestedReceiveAmount,
    receiveCurrency: fiatCurrency,
    customerRate: locked.pricing.customerRate,
    destinationRef: input.destinationRef || `recipient:${recipientId}`,
    recipientSnapshot,
    walletAddress,
    transactionStartedAt: now,
    ycLockedLocalAmount: (() => {
      const amount =
        "lockedLocalAmount" in locked ? Number(locked.lockedLocalAmount ?? 0) : 0
      return amount > 0 ? amount : null
    })(),
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
      phase: "awaiting_chain_deposit",
      yc_send_id: locked.sendId ?? null,
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
    quoted_receive: actualReceiveAmount,
    customer_rate: locked.pricing.customerRate ?? null,
    leg2_sequence_id: sequenceId,
    leg2_yc_id: locked.sendId ?? input.yc.sendId ?? null,
    leg2_channel_id: channelId || null,
    settlement_info: {
      send: { walletAddress, cryptoAmount },
    },
    metadata: {
      easner_payout_id: easnerPayoutId,
      total_debited: totalDebited,
      crypto_authorized_amount: cryptoAmount,
      processing_fee: locked.pricing.processingFee,
      margin_amount: locked.pricing.marginAmount,
      channel_cost: locked.pricing.channelCost,
      margin_capture_mode: "fee_wallet_deferred",
      requested_receive_amount: requestedReceiveAmount,
      recipient_receive_amount: actualReceiveAmount,
      recipient_surplus_local:
        "recipientSurplusLocal" in locked ? Number(locked.recipientSurplusLocal ?? 0) : 0,
      payout_quantum_local:
        "payoutQuantumLocal" in locked ? Number(locked.payoutQuantumLocal ?? 0) : 0,
      settlement_quantum_usd:
        "settlementQuantumUsd" in locked ? Number(locked.settlementQuantumUsd ?? 0) : 0,
      precision_mode: "precisionMode" in locked ? locked.precisionMode ?? null : null,
    },
  })

  try {
    await applyGlobalPayoutWalletDebitForEasnerPayoutId(admin, { easnerPayoutId })
  } catch (e) {
    const debitError = e instanceof Error ? e.message : "wallet_debit_failed"
    await upsertLedgerTransaction(admin, {
      userId,
      businessId,
      provider: "yellowcard",
      providerTransactionId: pendingPtid,
      status: "failed",
      amount: totalDebited,
      currency: "USD",
      direction: "out",
      metadata: mergeYcPayoutLifecycle(
        { ...metadata, failure_reason: debitError },
        { failed_at: now },
      ),
      occurredAt: now,
      baseCurrency: "USD",
      asset: "USDC",
    })
    return {
      ok: false,
      error: debitError,
    }
  }

  const chainSend = await executeYcBalancePayoutTurnkeyLeg({
    admin,
    ctx,
    transactionId,
    easnerPayoutId,
    ycWalletAddress: walletAddress,
    cryptoAmountUsd: cryptoAmount,
    totalDebited,
    formSessionId: String(locked.sendId ?? sequenceId),
  })

  const { data: txAfter } = await admin
    .from("transactions")
    .select("metadata")
    .eq("id", transactionId)
    .maybeSingle()
  const priorMeta = (txAfter?.metadata || {}) as Record<string, unknown>

  if (!chainSend.ok) {
    const failedMeta = buildYcRefundExpectedPatch(
      buildYcParentPayoutCryptoDepositTracking({
        prior: priorMeta,
        txHash: chainSend.txHash,
        status: "failed",
        error: chainSend.error,
      }),
      { refundAmount: cryptoAmount },
    )
    await upsertLedgerTransaction(admin, {
      userId,
      businessId,
      provider: "yellowcard",
      providerTransactionId: pendingPtid,
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
    return { ok: false, error: chainSend.error || "yc_turnkey_send_failed" }
  }

  const processingMeta = buildYcParentPayoutCryptoDepositTracking({
    prior: {
      ...priorMeta,
      turnkey_send_id: chainSend.turnkeySendId ?? priorMeta.turnkey_send_id,
    },
    txHash: chainSend.txHash,
    status: "pending",
  })
  await upsertLedgerTransaction(admin, {
    userId,
    businessId,
    provider: "yellowcard",
    providerTransactionId: pendingPtid,
    status: "processing",
    amount: totalDebited,
    currency: "USD",
    direction: "out",
    metadata: processingMeta,
    occurredAt: now,
    txHash: chainSend.txHash ?? undefined,
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
        leg2_deposit_tx_hash: chainSend.txHash,
        total_debited: totalDebited,
        crypto_authorized_amount: cryptoAmount,
        processing_fee: locked.pricing.processingFee,
        margin_amount: locked.pricing.marginAmount,
        channel_cost: locked.pricing.channelCost,
        margin_capture_mode: "fee_wallet_deferred",
      },
      updated_at: new Date().toISOString(),
    })
    .eq("transaction_id", transactionId)

  return {
    ok: true,
    easnerPayoutId,
    easnerTransactionId,
    status: "pending",
    ycCryptoDepositTxHash: chainSend.txHash,
    turnkeySendId: chainSend.turnkeySendId ?? null,
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
