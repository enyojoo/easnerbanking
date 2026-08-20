/**
 * Execute Grid balance_payout: debit wallet → Turnkey USDC → Grid funding address.
 * REALTIME_FUNDING quotes auto-execute once the funding address is fully funded.
 */
import { randomUUID } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { generateTransactionId } from "@/lib/transaction-id"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import {
  applyGlobalPayoutWalletDebitForEasnerPayoutId,
  findGlobalPayoutNoahRowByEasnerPayoutId,
  pendingGlobalPayoutProviderTransactionId,
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
  getPayoutLockSession,
  markPayoutLockSessionExecuted,
} from "@/lib/payout/payout-lock-session"
import { hashRecipientSnapshot } from "@/lib/payout/recipient-snapshot-hash"
import { isPayoutLockOnReviewEnabled } from "@/lib/payout/payout-lock-flags"
import { executeGridBalancePayoutTurnkeyLeg } from "@/lib/grid/payout-execute"
import { buildGridBalancePayoutOutMetadata, mergeGridPayoutLifecycle } from "@/lib/grid/grid-ledger"
import { ensureFreshGridBalancePayoutQuote, lockGridBalancePayoutQuote } from "@/lib/grid/payout-quote"

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

export type ExecuteGridBalancePayoutInput = {
  admin: SupabaseClient
  userId: string
  businessId: string | null
  recipientRow: RecipientSellPrepareRow
  recipientId: string
  destinationRef?: string
  fiatAmount: number
  fiatCurrency: string
  countryCode: string
  idempotencyKey?: string
  reviewSnapshot?: GlobalPayoutReviewSnapshot | null
  sendNote?: string
  lockId?: string
  grid: {
    quoteId: string
    sequenceId?: string
    customerId?: string
    externalAccountId?: string
    cryptoAmount?: number
    fundingAddress?: string
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

export type ExecuteGridBalancePayoutResult =
  | {
      ok: true
      easnerPayoutId: string
      easnerTransactionId: string
      status: "pending" | "failed"
      gridCryptoDepositTxHash?: string | null
      turnkeySendId?: string | null
    }
  | { ok: false; error: string }

async function findExistingGridPayoutByIdempotency(
  admin: SupabaseClient,
  opts: { userId: string; businessId: string | null; idempotencyKey: string },
): Promise<ExecuteGridBalancePayoutResult | null> {
  let q = admin
    .from("transactions")
    .select("id, status, metadata, easner_transaction_id")
    .eq("provider", "grid")
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

export async function executeGridBalancePayout(
  input: ExecuteGridBalancePayoutInput,
): Promise<ExecuteGridBalancePayoutResult> {
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
    const existing = await findExistingGridPayoutByIdempotency(admin, {
      userId,
      businessId,
      idempotencyKey,
    })
    if (existing) return existing
  }

  let quoteId = String(input.grid.quoteId || "").trim()
  let fundingAddress = String(input.grid.fundingAddress || "").trim()
  let cryptoAmount = Number(input.grid.cryptoAmount ?? input.pricing.customerPrincipal)
  let sequenceId = String(input.grid.sequenceId || quoteId).trim()
  let totalDebited = Number(input.pricing.totalDebited)
  let channelCost = Number(input.pricing.channelCost)
  let customerId = String(input.grid.customerId || "").trim()
  let externalAccountId = String(input.grid.externalAccountId || "").trim()
  const lockId = String(input.lockId || "").trim()
  if (lockId) {
    const lockRow = await getPayoutLockSession(admin, { lockId, userId })
    const payload = lockRow?.provider_payload_json ?? {}
    if (!quoteId) quoteId = String(payload.quoteId ?? "").trim()
    if (!fundingAddress) fundingAddress = String(payload.fundingAddress ?? "").trim()
    if (!customerId) customerId = String(payload.customerId ?? "").trim()
    if (!externalAccountId) externalAccountId = String(payload.externalAccountId ?? "").trim()
    if (!(cryptoAmount > 0)) cryptoAmount = Number(payload.cryptoAmount ?? 0)
    if (!sequenceId) sequenceId = String(payload.sequenceId ?? quoteId).trim()
  }
  if (!Number.isFinite(totalDebited) || totalDebited <= 0) {
    return { ok: false, error: "Invalid total debited for Grid payout." }
  }

  const customerRate =
    Number(input.pricing.customerRate) > 0
      ? Number(input.pricing.customerRate)
      : fiatAmount > 0 && Number(input.pricing.customerPrincipal) > 0
        ? fiatAmount / Number(input.pricing.customerPrincipal)
        : 0
  const principal = Number(input.pricing.customerPrincipal)
  const processingFee = Number(input.pricing.processingFee)
  const processingFeeBps =
    principal > 0 ? (processingFee > 0 ? Math.round((processingFee / principal) * 10_000) : 0) : 100

  if (!quoteId) {
    const { data: userRow } = await admin
      .from("users")
      .select(
        "residence_country,kyc_id_type,kyc_id_number,ng_local_id_type,ng_local_id_number,full_name,phone,email,date_of_birth,kyc_address_street,kyc_address_city,kyc_address_country",
      )
      .eq("id", userId)
      .maybeSingle()
    try {
      const locked = await lockGridBalancePayoutQuote({
        admin,
        userId,
        businessId,
        recipient: recipientRow,
        receiveFiatAmount: fiatAmount,
        sourceBalanceCurrency: "USD",
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
      quoteId = locked.quoteId
      sequenceId = locked.sequenceId || sequenceId
      fundingAddress = String(locked.fundingAddress || "")
      cryptoAmount = locked.cryptoAmount
      customerId = locked.customerId
      externalAccountId = locked.externalAccountId
      totalDebited = Math.max(totalDebited, locked.pricing.totalDebited)
      channelCost = locked.pricing.channelCost
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Could not lock Grid quote for send.",
      }
    }
  } else {
    const liveQuote = await ensureFreshGridBalancePayoutQuote({
      quoteId,
      customerId,
      externalAccountId,
      receiveCurrency: fiatCurrency,
      receiveAmount: fiatAmount,
      customerRate,
      processingFeeBps,
      originalTotalDebited: totalDebited,
      originalCryptoAmount: cryptoAmount,
      originalFundingAddress: fundingAddress,
      originalMarginAmount: Number(input.pricing.marginAmount),
      originalProcessingFee: processingFee,
    })
    if (!liveQuote.ok) {
      return { ok: false, error: liveQuote.error }
    }
    quoteId = liveQuote.quoteId
    sequenceId = liveQuote.sequenceId || sequenceId
    fundingAddress = liveQuote.fundingAddress
    cryptoAmount = liveQuote.cryptoAmount
    totalDebited = liveQuote.totalDebited
    channelCost = liveQuote.channelCost
  }

  if (!quoteId || !fundingAddress || !(cryptoAmount > 0)) {
    return { ok: false, error: "Grid payout quote is incomplete. Review again." }
  }

  const { available } = await readAvailableBalance(admin, {
    businessId,
    userId: businessId ? null : userId,
    currency: "USD",
  })
  if (available < totalDebited) {
    return { ok: false, error: "insufficient_balance" }
  }

  const useLockOnReview = isPayoutLockOnReviewEnabled("grid")
  if (useLockOnReview) {
    if (!lockId) {
      return { ok: false, error: "Payout lock expired or invalid. Go back and review again." }
    }
    const lockRow = await getPayoutLockSession(admin, { lockId, userId })
    if (!lockRow || lockRow.provider !== "grid") {
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
      return { ok: false, error: "Recipient details changed. Go back and review again." }
    }
  }

  const ctx = await resolveNoahAccountContextFromLedgerScope(admin, { userId, businessId })
  if (!ctx) {
    return { ok: false, error: "Could not resolve wallet context for Grid payout." }
  }

  let senderName: string | undefined
  if (businessId) {
    const { data: biz } = await admin
      .from("businesses")
      .select("display_name,legal_name,name")
      .eq("id", businessId)
      .maybeSingle()
    senderName =
      String(biz?.display_name ?? biz?.legal_name ?? biz?.name ?? "").trim() || undefined
  }

  const easnerPayoutId = randomUUID()
  const easnerTransactionId = generateTransactionId()
  const now = new Date().toISOString()
  const reviewSnapshot = normalizePayoutReviewSnapshot(reviewSnapshotRaw)
  const recipientSnapshot = buildRecipientSnapshotFromRow(recipientRow)

  const metadata = buildGridBalancePayoutOutMetadata({
    easnerPayoutId,
    easnerTransactionId,
    quoteId,
    sequenceId,
    customerId,
    externalAccountId,
    fiatAmount,
    fiatCurrency,
    countryCode,
    destinationRef: input.destinationRef || `recipient:${recipientId}`,
    recipientSnapshot,
    reviewSnapshot,
    sendNote,
    senderName,
    idempotencyKey,
    fundingAddress,
    cryptoAuthorizedAmount: cryptoAmount,
    pricing: {
      ...input.pricing,
      totalDebited,
      channelCost,
    },
  })

  const pendingPtid = pendingGlobalPayoutProviderTransactionId(easnerPayoutId)
  const upsert = await upsertLedgerTransaction(admin, {
    userId,
    businessId,
    provider: "grid",
    providerTransactionId: pendingPtid,
    status: "pending",
    amount: totalDebited,
    currency: "USD",
    direction: "out",
    payload: {
      phase: "awaiting_chain_deposit",
      grid_quote_id: quoteId,
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

  try {
    await admin
      .from("transactions")
      .update({ easner_transaction_id: easnerTransactionId, updated_at: now })
      .eq("id", transactionId)
  } catch {
    // column may not exist on all envs
  }

  await admin.from("grid_transfers").insert({
    transaction_id: transactionId,
    user_id: userId,
    business_id: businessId,
    mode: "balance_payout",
    status: "pending",
    receive_currency: fiatCurrency,
    quoted_receive: fiatAmount,
    customer_rate: input.pricing.customerRate ?? null,
    grid_quote_id: quoteId,
    external_account_id: externalAccountId || null,
    grid_customer_id: customerId || null,
    settlement_info: { fundingAddress, cryptoAmount },
    metadata: { easner_payout_id: easnerPayoutId },
  })

  try {
    await applyGlobalPayoutWalletDebitForEasnerPayoutId(admin, { easnerPayoutId })
    const debited = await findGlobalPayoutNoahRowByEasnerPayoutId(admin, easnerPayoutId)
    if (debited?.metadata.balance_delta_applied !== true) {
      throw new Error("wallet_debit_failed")
    }
  } catch (e) {
    const debitError = e instanceof Error ? e.message : "wallet_debit_failed"
    await upsertLedgerTransaction(admin, {
      userId,
      businessId,
      provider: "grid",
      providerTransactionId: pendingPtid,
      status: "failed",
      amount: totalDebited,
      currency: "USD",
      direction: "out",
      metadata: mergeGridPayoutLifecycle({ ...metadata, failure_reason: debitError }, { failed_at: now }),
      occurredAt: now,
      baseCurrency: "USD",
      asset: "USDC",
    })
    return { ok: false, error: debitError }
  }

  const chainSend = await executeGridBalancePayoutTurnkeyLeg({
    admin,
    ctx,
    transactionId,
    easnerPayoutId,
    fundingAddress,
    cryptoAmountUsd: cryptoAmount,
    totalDebited,
    formSessionId: sequenceId,
  })

  if (!chainSend.ok) {
    await reverseGlobalPayoutWalletDebitForEasnerPayoutId(admin, { easnerPayoutId }).catch(() => {})
    await upsertLedgerTransaction(admin, {
      userId,
      businessId,
      provider: "grid",
      providerTransactionId: pendingPtid,
      status: "failed",
      amount: totalDebited,
      currency: "USD",
      direction: "out",
      metadata: mergeGridPayoutLifecycle(
        { ...metadata, failure_reason: chainSend.error },
        { failed_at: now },
      ),
      occurredAt: now,
      baseCurrency: "USD",
      asset: "USDC",
    })
    return { ok: false, error: chainSend.error || "Grid funding transfer failed." }
  }

  // REALTIME_FUNDING quotes auto-execute once the funding address is fully funded.
  // Posting /execute before confirmation races Grid and is not required.
  // Mark processing as soon as USDC is broadcast – same as YC after the Turnkey leg.
  const { data: txAfter } = await admin
    .from("transactions")
    .select("metadata")
    .eq("id", transactionId)
    .maybeSingle()
  const priorMeta =
    txAfter?.metadata && typeof txAfter.metadata === "object"
      ? (txAfter.metadata as Record<string, unknown>)
      : metadata
  await upsertLedgerTransaction(admin, {
    userId,
    businessId,
    provider: "grid",
    providerTransactionId: pendingPtid,
    status: "processing",
    amount: totalDebited,
    currency: "USD",
    direction: "out",
    metadata: mergeGridPayoutLifecycle(
      {
        ...priorMeta,
        turnkey_send_id: chainSend.turnkeySendId ?? priorMeta.turnkey_send_id,
        grid_funding_tx_hash: chainSend.txHash,
      },
      { processing_at: now },
    ),
    occurredAt: now,
    txHash: chainSend.txHash ?? undefined,
    baseCurrency: "USD",
    asset: "USDC",
  })
  await admin
    .from("grid_transfers")
    .update({ status: "processing", updated_at: now })
    .eq("transaction_id", transactionId)
    .eq("mode", "balance_payout")

  if (lockId) {
    await markPayoutLockSessionExecuted(admin, lockId).catch(() => {})
  }

  return {
    ok: true,
    easnerPayoutId,
    easnerTransactionId,
    status: "pending",
    gridCryptoDepositTxHash: chainSend.txHash,
    turnkeySendId: chainSend.turnkeySendId ?? null,
  }
}

export function isGridBalancePayoutQuote(input: {
  payoutProvider?: string | null
  formSessionId?: string | null
  gridQuoteId?: string | null
  gridFundingAddress?: string | null
}): boolean {
  if (String(input.payoutProvider || "").toLowerCase() === "grid") return true
  const q = String(input.gridQuoteId || "").trim()
  if (q.startsWith("Quote:")) return true
  const fs = String(input.formSessionId || "").trim()
  if (fs.startsWith("grid_quote_")) return true
  if (String(input.gridFundingAddress || "").trim()) return true
  return false
}
