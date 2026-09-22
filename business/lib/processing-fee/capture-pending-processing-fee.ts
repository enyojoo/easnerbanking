import type { SupabaseClient } from "@supabase/supabase-js"
import {
  computeEasnerRevenueFeeWalletSweepAmount,
  computeWalletSendFeeWalletSweepAmount,
  computeYcBalancePayoutCappedFeeWalletSweep,
  payoutCryptoAuthorizedAmountFromMeta,
} from "@easner/shared"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import {
  noahCustomerIdFromBusinessId,
  noahCustomerIdFromUserId,
} from "@/lib/noah/customer-id"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import { resolveWalletSendFeeSolanaAddress } from "@/lib/wallet-send/fee-address"
import {
  pollTurnkeySendById,
  sweepEasnerRevenueFromUserTurnkeyWallet,
} from "@/lib/processing-fee/fee-wallet-sweep"
import { ensureFeeWalletRevenueDeposit } from "@/lib/processing-fee/fee-wallet-inbound-deposit"
import {
  buildEasnerRevenueSweepMetadataPatch,
  FEE_SWEEP_MIN,
  isEasnerRevenueAlreadySwept,
  isPayoutPrincipalOnChain,
  isSubmittedFeeSweepStale,
  readFeeTurnkeySendId,
} from "@/lib/processing-fee/fee-wallet-sweep-meta"

import {
  isGridBalancePayoutLedgerMeta,
  isNoahGlobalPayoutLedgerMeta,
  isYcBalancePayoutLedgerMeta,
} from "@/lib/processing-fee/payout-fee-ledger-routing"

const FEE_DUST = 0.000_001

function asLedgerMeta(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
}

export async function resolveNoahAccountContextFromLedgerScope(
  admin: SupabaseClient,
  input: { userId: string; businessId: string | null },
): Promise<NoahAccountContext | null> {
  const userId = String(input.userId || "").trim()
  if (!userId) return null

  if (input.businessId) {
    const businessId = String(input.businessId).trim()
    const ownerUserId = (await resolveBusinessOrgOwnerUserId(admin, businessId, userId)) || userId
    return {
      scope: "business",
      customerType: "Business",
      subjectBusinessId: businessId,
      subjectUserId: ownerUserId,
      noahCustomerId: noahCustomerIdFromBusinessId(businessId),
    }
  }

  const { data } = await admin
    .from("users")
    .select("noah_customer_id")
    .eq("id", userId)
    .maybeSingle()
  const stored = String(data?.noah_customer_id ?? "").trim()
  return {
    scope: "individual",
    customerType: "Individual",
    subjectBusinessId: null,
    subjectUserId: userId,
    noahCustomerId: stored || noahCustomerIdFromUserId(userId),
  }
}

async function patchTransactionMetadata(
  admin: SupabaseClient,
  transactionId: string,
  patch: Record<string, unknown>,
  omitKeys: string[] = [],
): Promise<void> {
  const { data: row } = await admin
    .from("transactions")
    .select("metadata")
    .eq("id", transactionId)
    .maybeSingle()
  if (!row?.metadata || typeof row.metadata !== "object") return
  const prior = row.metadata as Record<string, unknown>
  const next: Record<string, unknown> = { ...prior }
  for (const key of omitKeys) delete next[key]
  Object.assign(next, patch)
  await admin
    .from("transactions")
    .update({
      metadata: next,
      updated_at: new Date().toISOString(),
    })
    .eq("id", transactionId)
}

const FEE_SEND_OMIT_KEYS = [
  "processing_fee_turnkey_send_id",
  "margin_turnkey_send_id",
  "processing_fee_captured_at",
  "processing_fee_submitted_at",
  "processing_fee_turnkey_send_status",
]

async function bookFeeWalletRevenueDeposit(input: {
  admin: SupabaseClient
  userId: string
  businessId: string | null
  txHash: string | null | undefined
  amount: number
  asset?: "USDC" | "EURC"
  relatedEasnerTransactionId?: string | null
}): Promise<void> {
  const txHash = String(input.txHash || "").trim()
  if (!txHash || !Number.isFinite(input.amount) || input.amount <= FEE_DUST) return
  await ensureFeeWalletRevenueDeposit(input.admin, {
    txHash,
    amount: input.amount,
    asset: input.asset,
    senderUserId: input.userId,
    senderBusinessId: input.businessId,
    relatedEasnerTransactionId: input.relatedEasnerTransactionId,
    relatedDirection: "out",
    orgTreasuryKind: "payout_fee",
  }).catch((e) => {
    console.warn("[fee-wallet-inbound-deposit] book failed:", e)
  })
}

async function refreshPrincipalPayoutSend(
  admin: SupabaseClient,
  input: {
    transactionId: string
    ctx: NoahAccountContext
    meta: Record<string, unknown>
    asset?: "USDC" | "EURC"
  },
): Promise<Record<string, unknown>> {
  if (isPayoutPrincipalOnChain(input.meta)) return input.meta
  const sendId = String(input.meta.turnkey_send_id ?? "").trim()
  if (!sendId) return input.meta
  const rec = await pollTurnkeySendById(admin, {
    ctx: input.ctx,
    sendId,
    asset: input.asset,
  })
  if (rec.status === "pending" && !rec.txHash) return input.meta
  const patch: Record<string, unknown> = {
    turnkey_send_status: rec.status,
    yc_crypto_deposit_status: rec.status,
  }
  if (rec.txHash) {
    patch.turnkey_tx_hash = rec.txHash
    patch.yc_crypto_deposit_tx_hash = rec.txHash
  }
  await patchTransactionMetadata(admin, input.transactionId, patch)
  return { ...input.meta, ...patch }
}

/**
 * Poll an in-flight fee Turnkey send. Returns `retry` when it failed or went stale so a new
 * sweep can be submitted. Previously we treated submit-as-pending as captured and never retried.
 */
async function settleSubmittedFeeSweepIfAny(
  admin: SupabaseClient,
  input: {
    transactionId: string
    ctx: NoahAccountContext
    meta: Record<string, unknown>
    sweepAmt: number
    ledgerCurrency: "USD" | "EUR"
    asset?: "USDC" | "EURC"
    useMarginTurnkeySendId?: boolean
    userId: string
    businessId: string | null
    relatedEasnerTransactionId?: string | null
  },
): Promise<"settled" | "pending" | "retry" | "none"> {
  const sendId = readFeeTurnkeySendId(input.meta)
  if (!sendId) return "none"

  const rec = await pollTurnkeySendById(admin, {
    ctx: input.ctx,
    sendId,
    asset: input.asset,
  })
  const feeHash = String(rec.txHash || "").trim()
  if (feeHash) {
    await patchTransactionMetadata(
      admin,
      input.transactionId,
      buildEasnerRevenueSweepMetadataPatch({
        sweepAmt: input.sweepAmt,
        feeWalletSweepTxHash: feeHash,
        captured: true,
        turnkeySendId: sendId,
        useMarginTurnkeySendId: input.useMarginTurnkeySendId,
        ledgerCurrency: input.ledgerCurrency,
      }),
    )
    await bookFeeWalletRevenueDeposit({
      admin,
      userId: input.userId,
      businessId: input.businessId,
      txHash: feeHash,
      amount: input.sweepAmt,
      asset: input.asset ?? (input.ledgerCurrency === "EUR" ? "EURC" : "USDC"),
      relatedEasnerTransactionId: input.relatedEasnerTransactionId,
    })
    return "settled"
  }

  // Settled without a signature is not captured: keep the send id and wait.
  // Do not treat it as stale or we can submit a second fee.
  if (rec.status === "settled" || rec.status === "pending") {
    await patchTransactionMetadata(admin, input.transactionId, {
      processing_fee_pending: true,
      processing_fee_turnkey_send_status: rec.status,
    })
    return "pending"
  }

  const stale = rec.status === "failed" || isSubmittedFeeSweepStale(input.meta)
  if (!stale) {
    await patchTransactionMetadata(admin, input.transactionId, {
      processing_fee_pending: true,
      processing_fee_turnkey_send_status: rec.status,
    })
    return "pending"
  }

  await patchTransactionMetadata(
    admin,
    input.transactionId,
    {
      processing_fee_pending: true,
      processing_fee_turnkey_send_status: rec.status,
    },
    FEE_SEND_OMIT_KEYS,
  )
  return "retry"
}

/** Capture Easner FX margin + 1% for Noah global fiat offramp after sell Settled. */
export async function captureGlobalPayoutProcessingFeeIfPending(
  admin: SupabaseClient,
  input: { transactionId: string; userId: string; businessId: string | null },
): Promise<{ captured: boolean }> {
  const { data: row } = await admin
    .from("transactions")
    .select("id, status, currency, metadata, amount, easner_transaction_id")
    .eq("id", input.transactionId)
    .maybeSingle()
  if (!row?.id || String(row.status ?? "").toLowerCase() !== "settled") {
    return { captured: false }
  }

  const meta = asLedgerMeta(row.metadata)
  if (!isNoahGlobalPayoutLedgerMeta(meta)) {
    return { captured: false }
  }
  if (isEasnerRevenueAlreadySwept(meta)) {
    await bookFeeWalletRevenueDeposit({
      admin,
      userId: input.userId,
      businessId: input.businessId,
      txHash: String(meta.fee_wallet_sweep_tx_hash ?? ""),
      amount: Number(meta.fee_wallet_sweep ?? meta.easner_revenue_sweep_amount ?? 0),
      relatedEasnerTransactionId: String(row.easner_transaction_id ?? "").trim() || null,
    })
    return { captured: true }
  }
  if (meta.processing_fee_pending !== true && !readFeeTurnkeySendId(meta)) {
    return { captured: false }
  }

  const feeLegAmount = computeEasnerRevenueFeeWalletSweepAmount({
    marginAmount: Number(meta.margin_amount ?? 0),
    processingFee: Number(meta.processing_fee ?? 0),
    totalDebited: Number(meta.total_debited ?? row.amount ?? 0),
    cryptoAuthorizedAmount: Number(payoutCryptoAuthorizedAmountFromMeta(meta) ?? 0),
  })

  if (!Number.isFinite(feeLegAmount) || feeLegAmount <= FEE_DUST) {
    await patchTransactionMetadata(admin, input.transactionId, { processing_fee_pending: false })
    return { captured: false }
  }

  const ctx = await resolveNoahAccountContextFromLedgerScope(admin, input)
  if (!ctx) return { captured: false }

  const walletCurrency = String(row.currency ?? "USD").toUpperCase() as "USD" | "EUR"
  if (!resolveWalletSendFeeSolanaAddress({ ledgerCurrency: walletCurrency })) {
    return { captured: false }
  }

  let liveMeta = await refreshPrincipalPayoutSend(admin, {
    transactionId: input.transactionId,
    ctx,
    meta,
    asset: String(meta.crypto_asset ?? "USDC").toUpperCase().includes("EUR") ? "EURC" : "USDC",
  })

  const submitted = await settleSubmittedFeeSweepIfAny(admin, {
    transactionId: input.transactionId,
    ctx,
    meta: liveMeta,
    sweepAmt: feeLegAmount,
    ledgerCurrency: walletCurrency,
    userId: input.userId,
    businessId: input.businessId,
    relatedEasnerTransactionId: String(row.easner_transaction_id ?? "").trim() || null,
  })
  if (submitted === "settled") return { captured: true }
  if (submitted === "pending") return { captured: false }

  liveMeta = { ...liveMeta }
  if (!isPayoutPrincipalOnChain(liveMeta)) {
    await patchTransactionMetadata(admin, input.transactionId, { processing_fee_pending: true })
    return { captured: false }
  }

  const easnerPayoutId = String(meta.easner_payout_id ?? "").trim()
  const sweep = await sweepEasnerRevenueFromUserTurnkeyWallet(admin, {
    ctx,
    ledgerCurrency: walletCurrency,
    amount: feeLegAmount,
    cryptoAssetHint: String(meta.crypto_asset ?? "USDC"),
    globalPayout: {
      easnerPayoutId,
      noahWorkflowId: typeof meta.noah_workflow_id === "string" ? meta.noah_workflow_id : null,
      formSessionId: typeof meta.form_session_id === "string" ? meta.form_session_id : undefined,
    },
    logTag: "noah-global-payout",
  })

  const patch = buildEasnerRevenueSweepMetadataPatch({
    sweepAmt: feeLegAmount,
    feeWalletSweepTxHash: sweep.feeWalletSweepTxHash,
    captured: sweep.captured,
    turnkeySendId: sweep.turnkeySendId,
    useMarginTurnkeySendId: false,
    ledgerCurrency: walletCurrency,
  })

  await patchTransactionMetadata(admin, input.transactionId, patch)
  await bookFeeWalletRevenueDeposit({
    admin,
    userId: input.userId,
    businessId: input.businessId,
    txHash: sweep.feeWalletSweepTxHash,
    amount: feeLegAmount,
    asset: String(meta.crypto_asset ?? "USDC").toUpperCase().includes("EUR") ? "EURC" : "USDC",
    relatedEasnerTransactionId: String(row.easner_transaction_id ?? "").trim() || null,
  })
  return { captured: sweep.captured }
}
export async function captureWalletSendFeeLegIfPending(
  admin: SupabaseClient,
  input: { transactionId: string; userId: string; businessId: string | null },
): Promise<{ captured: boolean }> {
  const { data: row } = await admin
    .from("transactions")
    .select("id, status, currency, metadata, easner_transaction_id")
    .eq("id", input.transactionId)
    .maybeSingle()
  if (!row?.id || String(row.status ?? "").toLowerCase() !== "settled") {
    return { captured: false }
  }

  const meta = (row.metadata || {}) as Record<string, unknown>
  if (String(meta.activity_type ?? "") !== "wallet_send") return { captured: false }
  if (isEasnerRevenueAlreadySwept(meta)) {
    await bookFeeWalletRevenueDeposit({
      admin,
      userId: input.userId,
      businessId: input.businessId,
      txHash: String(meta.fee_wallet_sweep_tx_hash ?? ""),
      amount: Number(meta.fee_wallet_sweep ?? meta.easner_revenue_sweep_amount ?? 0),
      relatedEasnerTransactionId: String(row.easner_transaction_id ?? "").trim() || null,
    })
    return { captured: true }
  }
  if (meta.processing_fee_pending !== true && !readFeeTurnkeySendId(meta)) {
    return { captured: false }
  }

  const feeLegAmount = computeWalletSendFeeWalletSweepAmount({
    executionModel: String(meta.execution_model ?? ""),
    marginAmount: Number(meta.margin_amount ?? 0),
    processingFee: Number(meta.processing_fee ?? 0),
  })

  if (!Number.isFinite(feeLegAmount) || feeLegAmount <= FEE_DUST) {
    await patchTransactionMetadata(admin, input.transactionId, { processing_fee_pending: false })
    return { captured: false }
  }

  const walletCurrency = String(row.currency ?? "USD").toUpperCase() as "USD" | "EUR"
  const feeAddress =
    String(meta.fee_destination_address ?? "").trim() ||
    resolveWalletSendFeeSolanaAddress({ ledgerCurrency: walletCurrency })
  if (!feeAddress) return { captured: false }

  const ctx = await resolveNoahAccountContextFromLedgerScope(admin, input)
  if (!ctx) return { captured: false }

  const receiveAsset = String(meta.receive_asset ?? "USDC")
  const asset = receiveAsset === "EURC" ? "EURC" : "USDC"
  const formSessionId = String(meta.form_session_id ?? "").trim()

  const submitted = await settleSubmittedFeeSweepIfAny(admin, {
    transactionId: input.transactionId,
    ctx,
    meta,
    sweepAmt: feeLegAmount,
    ledgerCurrency: walletCurrency,
    asset,
    useMarginTurnkeySendId: true,
    userId: input.userId,
    businessId: input.businessId,
    relatedEasnerTransactionId: String(row.easner_transaction_id ?? "").trim() || null,
  })
  if (submitted === "settled") return { captured: true }
  if (submitted === "pending") return { captured: false }

  const sweep = await sweepEasnerRevenueFromUserTurnkeyWallet(admin, {
    ctx,
    ledgerCurrency: walletCurrency,
    amount: feeLegAmount,
    asset,
    walletSend: { formSessionId },
    logTag: "wallet-send",
  })

  const patch = buildEasnerRevenueSweepMetadataPatch({
    sweepAmt: feeLegAmount,
    feeWalletSweepTxHash: sweep.feeWalletSweepTxHash,
    captured: sweep.captured,
    turnkeySendId: sweep.turnkeySendId,
    useMarginTurnkeySendId: true,
    ledgerCurrency: walletCurrency,
  })

  await patchTransactionMetadata(admin, input.transactionId, patch)
  await bookFeeWalletRevenueDeposit({
    admin,
    userId: input.userId,
    businessId: input.businessId,
    txHash: sweep.feeWalletSweepTxHash,
    amount: feeLegAmount,
    asset,
    relatedEasnerTransactionId: String(row.easner_transaction_id ?? "").trim() || null,
  })
  return { captured: sweep.captured }
}
export async function captureYcBalancePayoutProcessingFeeIfPending(
  admin: SupabaseClient,
  input: { transactionId: string; userId: string; businessId: string | null },
): Promise<{ captured: boolean }> {
  const { data: row } = await admin
    .from("transactions")
    .select("id, status, currency, metadata, amount, easner_transaction_id")
    .eq("id", input.transactionId)
    .maybeSingle()
  if (!row?.id || String(row.status ?? "").toLowerCase() !== "settled") {
    return { captured: false }
  }

  const meta = asLedgerMeta(row.metadata)
  if (!isYcBalancePayoutLedgerMeta(meta)) return { captured: false }
  if (!String(meta.turnkey_send_id ?? "").trim()) return { captured: false }
  if (isEasnerRevenueAlreadySwept(meta)) {
    await bookFeeWalletRevenueDeposit({
      admin,
      userId: input.userId,
      businessId: input.businessId,
      txHash: String(meta.fee_wallet_sweep_tx_hash ?? ""),
      amount: Number(meta.fee_wallet_sweep ?? meta.easner_revenue_sweep_amount ?? 0),
      relatedEasnerTransactionId: String(row.easner_transaction_id ?? "").trim() || null,
    })
    return { captured: true }
  }
  if (meta.processing_fee_pending !== true && !readFeeTurnkeySendId(meta)) {
    return { captured: false }
  }

  const sweepAmt = computeYcBalancePayoutCappedFeeWalletSweep({
    totalDebited: Number(meta.total_debited ?? row.amount ?? 0),
    cryptoAuthorizedAmount: Number(payoutCryptoAuthorizedAmountFromMeta(meta) ?? 0),
    marginAmount: Number(meta.margin_amount ?? 0),
    processingFee: Number(meta.processing_fee ?? 0),
  })

  if (!Number.isFinite(sweepAmt) || sweepAmt < FEE_SWEEP_MIN) {
    await patchTransactionMetadata(admin, input.transactionId, { processing_fee_pending: false })
    return { captured: false }
  }

  const ctx = await resolveNoahAccountContextFromLedgerScope(admin, input)
  if (!ctx) return { captured: false }

  let liveMeta = await refreshPrincipalPayoutSend(admin, {
    transactionId: input.transactionId,
    ctx,
    meta,
  })

  const submitted = await settleSubmittedFeeSweepIfAny(admin, {
    transactionId: input.transactionId,
    ctx,
    meta: liveMeta,
    sweepAmt,
    ledgerCurrency: "USD",
    userId: input.userId,
    businessId: input.businessId,
    relatedEasnerTransactionId: String(row.easner_transaction_id ?? "").trim() || null,
  })
  if (submitted === "settled") return { captured: true }
  if (submitted === "pending") return { captured: false }

  liveMeta = { ...liveMeta }
  if (!isPayoutPrincipalOnChain(liveMeta)) {
    await patchTransactionMetadata(admin, input.transactionId, { processing_fee_pending: true })
    return { captured: false }
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

  const patch = buildEasnerRevenueSweepMetadataPatch({
    sweepAmt,
    feeWalletSweepTxHash: sweep.feeWalletSweepTxHash,
    captured: sweep.captured,
    turnkeySendId: sweep.turnkeySendId,
    ledgerCurrency: "USD",
  })

  await patchTransactionMetadata(admin, input.transactionId, patch)
  await bookFeeWalletRevenueDeposit({
    admin,
    userId: input.userId,
    businessId: input.businessId,
    txHash: sweep.feeWalletSweepTxHash,
    amount: sweepAmt,
    relatedEasnerTransactionId: String(row.easner_transaction_id ?? "").trim() || null,
  })
  return { captured: sweep.captured }
}

/** Capture deferred Easner revenue for Grid balance payout after OUTGOING_PAYMENT.COMPLETED (YC/Noah parity). */
export async function captureGridBalancePayoutProcessingFeeIfPending(
  admin: SupabaseClient,
  input: { transactionId: string; userId: string; businessId: string | null },
): Promise<{ captured: boolean }> {
  const { data: row } = await admin
    .from("transactions")
    .select("id, status, currency, metadata, amount, easner_transaction_id")
    .eq("id", input.transactionId)
    .maybeSingle()
  if (!row?.id || String(row.status ?? "").toLowerCase() !== "settled") {
    return { captured: false }
  }

  const meta = asLedgerMeta(row.metadata)
  if (!isGridBalancePayoutLedgerMeta(meta)) return { captured: false }
  if (!String(meta.turnkey_send_id ?? "").trim()) return { captured: false }
  if (isEasnerRevenueAlreadySwept(meta)) {
    await bookFeeWalletRevenueDeposit({
      admin,
      userId: input.userId,
      businessId: input.businessId,
      txHash: String(meta.fee_wallet_sweep_tx_hash ?? ""),
      amount: Number(meta.fee_wallet_sweep ?? meta.easner_revenue_sweep_amount ?? 0),
      relatedEasnerTransactionId: String(row.easner_transaction_id ?? "").trim() || null,
    })
    return { captured: true }
  }
  const inFlightFeeSend = Boolean(readFeeTurnkeySendId(meta))
  // Legacy Grid rows never set processing_fee_pending; still sweep outstanding revenue.
  if (meta.processing_fee_pending === false && !inFlightFeeSend) return { captured: false }

  const sweepAmt = computeYcBalancePayoutCappedFeeWalletSweep({
    totalDebited: Number(meta.total_debited ?? row.amount ?? 0),
    cryptoAuthorizedAmount: Number(payoutCryptoAuthorizedAmountFromMeta(meta) ?? 0),
    marginAmount: Number(meta.margin_amount ?? 0),
    processingFee: Number(meta.processing_fee ?? 0),
  })

  if (!Number.isFinite(sweepAmt) || sweepAmt < FEE_SWEEP_MIN) {
    await patchTransactionMetadata(admin, input.transactionId, { processing_fee_pending: false })
    return { captured: false }
  }

  const ctx = await resolveNoahAccountContextFromLedgerScope(admin, input)
  if (!ctx) return { captured: false }

  let liveMeta = await refreshPrincipalPayoutSend(admin, {
    transactionId: input.transactionId,
    ctx,
    meta,
  })

  const submitted = await settleSubmittedFeeSweepIfAny(admin, {
    transactionId: input.transactionId,
    ctx,
    meta: liveMeta,
    sweepAmt,
    ledgerCurrency: "USD",
    userId: input.userId,
    businessId: input.businessId,
    relatedEasnerTransactionId: String(row.easner_transaction_id ?? "").trim() || null,
  })
  if (submitted === "settled") return { captured: true }
  if (submitted === "pending") return { captured: false }

  liveMeta = { ...liveMeta }
  if (!isPayoutPrincipalOnChain(liveMeta)) {
    await patchTransactionMetadata(admin, input.transactionId, { processing_fee_pending: true })
    return { captured: false }
  }

  const easnerPayoutId = String(meta.easner_payout_id ?? "").trim()
  const sweep = await sweepEasnerRevenueFromUserTurnkeyWallet(admin, {
    ctx,
    ledgerCurrency: "USD",
    amount: sweepAmt,
    globalPayout: easnerPayoutId
      ? {
          easnerPayoutId,
          formSessionId: String(meta.form_session_id ?? meta.grid_sequence_id ?? ""),
        }
      : undefined,
    logTag: "grid-balance-payout",
  })

  const patch = buildEasnerRevenueSweepMetadataPatch({
    sweepAmt,
    feeWalletSweepTxHash: sweep.feeWalletSweepTxHash,
    captured: sweep.captured,
    turnkeySendId: sweep.turnkeySendId,
    ledgerCurrency: "USD",
  })

  await patchTransactionMetadata(admin, input.transactionId, patch)
  await bookFeeWalletRevenueDeposit({
    admin,
    userId: input.userId,
    businessId: input.businessId,
    txHash: sweep.feeWalletSweepTxHash,
    amount: sweepAmt,
    relatedEasnerTransactionId: String(row.easner_transaction_id ?? "").trim() || null,
  })
  return { captured: sweep.captured }
}
