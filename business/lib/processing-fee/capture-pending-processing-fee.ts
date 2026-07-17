import type { SupabaseClient } from "@supabase/supabase-js"
import {
  computeEasnerRevenueFeeWalletSweepAmount,
} from "@easner/shared"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import {
  noahCustomerIdFromBusinessId,
  noahCustomerIdFromUserId,
} from "@/lib/noah/customer-id"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import { resolveWalletSendFeeSolanaAddress } from "@/lib/wallet-send/fee-address"
import {
  buildEasnerRevenueSweepMetadataPatch,
  isEasnerRevenueAlreadySwept,
  sweepEasnerRevenueFromUserTurnkeyWallet,
} from "@/lib/processing-fee/fee-wallet-sweep"

const FEE_DUST = 0.000_001

export async function resolveNoahAccountContextFromLedgerScope(
  admin: SupabaseClient,
  input: { userId: string; businessId: string | null },
): Promise<NoahAccountContext | null> {
  const userId = String(input.userId || "").trim()
  if (!userId) return null

  if (input.businessId) {
    const businessId = String(input.businessId).trim()
    const ownerUserId = (await resolveBusinessOrgOwnerUserId(admin, businessId, userId)) || userId
    const { data } = await admin
      .from("businesses")
      .select("noah_customer_id")
      .eq("id", businessId)
      .maybeSingle()
    const stored = String(data?.noah_customer_id ?? "").trim()
    return {
      scope: "business",
      customerType: "Business",
      subjectBusinessId: businessId,
      subjectUserId: ownerUserId,
      noahCustomerId: stored || noahCustomerIdFromBusinessId(businessId),
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
): Promise<void> {
  const { data: row } = await admin
    .from("transactions")
    .select("metadata")
    .eq("id", transactionId)
    .maybeSingle()
  if (!row?.metadata || typeof row.metadata !== "object") return
  const prior = row.metadata as Record<string, unknown>
  await admin
    .from("transactions")
    .update({
      metadata: { ...prior, ...patch },
      updated_at: new Date().toISOString(),
    })
    .eq("id", transactionId)
}

/** Capture Easner FX margin + 1% for Noah global fiat offramp after sell Settled. */
export async function captureGlobalPayoutProcessingFeeIfPending(
  admin: SupabaseClient,
  input: { transactionId: string; userId: string; businessId: string | null },
): Promise<{ captured: boolean }> {
  const { data: row } = await admin
    .from("transactions")
    .select("id, status, currency, metadata, amount")
    .eq("id", input.transactionId)
    .maybeSingle()
  if (!row?.id || String(row.status ?? "").toLowerCase() !== "settled") {
    return { captured: false }
  }

  const meta = (row.metadata || {}) as Record<string, unknown>
  if (isEasnerRevenueAlreadySwept(meta)) {
    return { captured: false }
  }
  if (String(meta.processing_fee_turnkey_send_id ?? "").trim()) {
    return { captured: false }
  }
  if (meta.processing_fee_pending !== true) return { captured: false }

  const feeLegAmount = computeEasnerRevenueFeeWalletSweepAmount({
    marginAmount: Number(meta.margin_amount ?? 0),
    processingFee: Number(meta.processing_fee ?? 0),
    totalDebited: Number(meta.total_debited ?? row.amount ?? 0),
    cryptoAuthorizedAmount: Number(meta.noah_send_amount ?? meta.crypto_authorized_amount ?? 0),
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
  })

  await patchTransactionMetadata(admin, input.transactionId, patch)
  return { captured: sweep.captured }
}

/** Capture deferred fee-wallet leg for wallet_send after principal / bridge settles. */
export async function captureWalletSendFeeLegIfPending(
  admin: SupabaseClient,
  input: { transactionId: string; userId: string; businessId: string | null },
): Promise<{ captured: boolean }> {
  const { data: row } = await admin
    .from("transactions")
    .select("id, status, currency, metadata")
    .eq("id", input.transactionId)
    .maybeSingle()
  if (!row?.id || String(row.status ?? "").toLowerCase() !== "settled") {
    return { captured: false }
  }

  const meta = (row.metadata || {}) as Record<string, unknown>
  if (String(meta.activity_type ?? "") !== "wallet_send") return { captured: false }
  if (isEasnerRevenueAlreadySwept(meta)) return { captured: false }
  if (String(meta.margin_turnkey_send_id ?? "").trim()) return { captured: false }
  if (meta.processing_fee_pending !== true) return { captured: false }

  const feeLegAmount = computeEasnerRevenueFeeWalletSweepAmount({
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
  })

  await patchTransactionMetadata(admin, input.transactionId, patch)
  return { captured: sweep.captured }
}
