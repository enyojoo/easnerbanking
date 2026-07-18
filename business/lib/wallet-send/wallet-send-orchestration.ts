import type { SupabaseClient } from "@supabase/supabase-js"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { createTurnkeySend } from "@/lib/turnkey/send"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { applyWalletBalanceDelta } from "@/lib/wallet/wallet-balances-db"
import { generateTransactionId } from "@/lib/transaction-id"
import { isWalletSendEnabled } from "@/lib/lifi/client"
import { getTurnkeyDisplayBalancesUsdEur } from "@/lib/wallet/turnkey-chain-balances"
import { resolveWalletSendExecutionModel } from "./routing"
import { isPayoutLockOnReviewEnabled } from "@/lib/payout/payout-lock-flags"
import { getWalletSendSession, markWalletSendSessionExecuted } from "./wallet-send-session"
import { executeLifiWalletSend } from "./lifi-execute"
import type { WalletRecipientRow } from "./validate-recipient"
import {
  assertWalletSendFeeSolanaAddressConfigured,
  resolveWalletSendFeeSolanaAddress,
} from "./fee-address"
import { formatDisplayPersonName } from "@easner/shared"
import { buildRecipientSnapshotFromRow } from "@/lib/noah/build-payout-execute-snapshot"
import { buildWalletSendPayoutReviewSnapshot } from "./build-wallet-send-payout-review"
import {
  captureWalletSendFeeLegIfPending,
} from "@/lib/processing-fee/capture-pending-processing-fee"

export type ExecuteWalletSendInput = {
  admin: SupabaseClient
  ctx: NoahAccountContext
  userId: string
  businessId: string | null
  recipient: WalletRecipientRow
  formSessionId: string
  reservedDebitEtid?: string
  reviewSnapshot?: Record<string, unknown>
}

export type ExecuteWalletSendResult =
  | {
      ok: true
      easnerTransactionId: string
      status: "pending" | "settled" | "failed"
      provider: "turnkey" | "lifi"
      providerTransactionId: string
      txHash?: string | null
    }
  | { ok: false; error: string }

const MARGIN_DUST = 0.000_001

function walletSendRecipientMetadata(recipient: WalletRecipientRow) {
  const recipientSnapshot = buildRecipientSnapshotFromRow({
    full_name: String(recipient.full_name || "").trim() || "Wallet transfer",
    account_number: String(recipient.account_number || "").trim(),
    bank_name: String(recipient.bank_name || "Wallet").trim(),
    currency: String(recipient.currency || "").trim(),
  })
  const counterpartyName =
    formatDisplayPersonName(recipientSnapshot.full_name) || recipientSnapshot.full_name
  return {
    counterparty_name: counterpartyName,
    recipient_name: counterpartyName,
    recipient_id: recipient.id,
    recipient_snapshot: recipientSnapshot,
  }
}

async function readAvailableBalance(
  admin: SupabaseClient,
  opts: { businessId: string | null; userId: string | null; currency: "USD" | "EUR" },
): Promise<{ available: number; err?: string }> {
  let q = admin.from("wallet_balances").select("available_balance").eq("currency", opts.currency).limit(1)
  if (opts.businessId) q = q.eq("business_id", opts.businessId)
  else if (opts.userId) q = q.eq("user_id", opts.userId)
  else return { available: 0, err: "invalid_scope" }
  const { data, error } = await q.maybeSingle()
  if (error) return { available: 0, err: error.message }
  return { available: Number(data?.available_balance ?? 0) }
}

async function debitWalletBalance(
  admin: SupabaseClient,
  input: { userId: string; businessId: string | null; currency: "USD" | "EUR"; amount: number },
): Promise<void> {
  await applyWalletBalanceDelta(admin, {
    userId: input.businessId ? null : input.userId,
    businessId: input.businessId,
    currency: input.currency,
    delta: -Math.abs(input.amount),
  })
}

async function assertWalletSendExecuteReady(
  admin: SupabaseClient,
  input: {
    ctx: NoahAccountContext
    userId: string
    businessId: string | null
    balanceCurrency: "USD" | "EUR"
    totalDebited: number
    onChainOutTotal: number
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  assertWalletSendFeeSolanaAddressConfigured(input.balanceCurrency)

  const { available, err: balErr } = await readAvailableBalance(admin, {
    businessId: input.businessId,
    userId: input.businessId ? null : input.userId,
    currency: input.balanceCurrency,
  })
  if (balErr) return { ok: false, error: "insufficient_balance" }
  if (available < input.totalDebited) return { ok: false, error: "insufficient_balance" }

  const onChain = await getTurnkeyDisplayBalancesUsdEur(admin, input.ctx)
  const onChainRaw = input.balanceCurrency === "EUR" ? onChain.EUR : onChain.USD
  const onChainAvailable = Number.parseFloat(String(onChainRaw || "0"))
  if (!Number.isFinite(onChainAvailable) || onChainAvailable < input.onChainOutTotal - 1e-6) {
    return { ok: false, error: "insufficient_onchain_balance" }
  }

  return { ok: true }
}

export async function executeWalletSend(input: ExecuteWalletSendInput): Promise<ExecuteWalletSendResult> {
  if (!isWalletSendEnabled()) {
    return { ok: false, error: "wallet_send_disabled" }
  }

  const session = await getWalletSendSession(input.admin, input.formSessionId, input.userId, {
    allowQuoted: !isPayoutLockOnReviewEnabled("wallet"),
  })
  if (!session) {
    return { ok: false, error: "quote_expired" }
  }
  if (session.recipient_id !== input.recipient.id) {
    return { ok: false, error: "recipient_mismatch" }
  }

  const executionModel = resolveWalletSendExecutionModel(session.receive_asset, session.receive_network)
  const balanceCurrency = session.source_balance_currency as "USD" | "EUR"
  const easnerTransactionId = input.reservedDebitEtid?.trim() || generateTransactionId()

  const channelCost =
    executionModel === "lifi_bridge"
      ? Math.max(0, session.lifi_floor - session.receive_amount / session.lifi_mid)
      : 0
  const payoutReview = buildWalletSendPayoutReviewSnapshot({
    session,
    channelCost: Math.round(channelCost * 1_000_000) / 1_000_000,
    reviewSnapshot: input.reviewSnapshot,
  })

  if (executionModel === "direct_turnkey") {
    const asset = session.receive_asset === "EURC" ? "EURC" : "USDC"
    const marginAmount = session.margin_amount
    const walletSendCtx = { formSessionId: session.form_session_id }

    const ready = await assertWalletSendExecuteReady(input.admin, {
      ctx: input.ctx,
      userId: input.userId,
      businessId: input.businessId,
      balanceCurrency,
      totalDebited: session.total_debited,
      onChainOutTotal: session.receive_amount,
    })
    if (!ready.ok) return ready

    const feeAddress = resolveWalletSendFeeSolanaAddress({ ledgerCurrency: balanceCurrency })
    if (!feeAddress) {
      return { ok: false, error: "wallet_send_fee_address_not_configured" }
    }

    try {
      const send = await createTurnkeySend(input.admin, {
        ctx: input.ctx,
        asset,
        chain: "solana",
        destinationAddress: session.destination_address,
        amount: session.receive_amount,
        settlementPollTimeoutMs: 120_000,
        walletSend: walletSendCtx,
      })

      if (send.status === "failed") {
        const detail =
          send.chainFailureDetail?.trim() ||
          "Turnkey Solana broadcast failed. Check wallet balance and try again."
        return { ok: false, error: detail }
      }

      await debitWalletBalance(input.admin, {
        userId: input.userId,
        businessId: input.businessId,
        currency: balanceCurrency,
        amount: session.total_debited,
      })

      const occurredAt = new Date().toISOString()
      const upsert = await upsertLedgerTransaction(input.admin, {
        userId: input.userId,
        businessId: input.businessId,
        provider: "turnkey",
        providerTransactionId: send.providerTransactionId,
        status: send.status,
        amount: session.total_debited,
        currency: balanceCurrency,
        direction: "out",
        occurredAt,
        ...(send.status === "settled" ? { settledAt: occurredAt } : {}),
        txHash: send.txHash,
        counterpartyAddress: session.destination_address,
        asset: session.receive_asset,
        chain: session.receive_network,
        metadata: {
          activity_type: "wallet_send",
          execution_model: "direct_turnkey",
          margin_capture_mode: "fee_wallet_deferred",
          receive_asset: session.receive_asset,
          receive_network: session.receive_network,
          receive_amount: session.receive_amount,
          receive_currency: session.receive_asset,
          processing_fee: marginAmount,
          margin_amount: marginAmount,
          form_session_id: session.form_session_id,
          easner_transaction_id: easnerTransactionId,
          fee_destination_address: feeAddress,
          payout_review: payoutReview,
          ...walletSendRecipientMetadata(input.recipient),
          ...(marginAmount > MARGIN_DUST ? { processing_fee_pending: true } : {}),
          ...(input.reviewSnapshot ?? {}),
        },
      })

      if (send.status === "settled" && upsert.transactionId) {
        await captureWalletSendFeeLegIfPending(input.admin, {
          transactionId: upsert.transactionId,
          userId: input.userId,
          businessId: input.businessId,
        }).catch((e) => console.warn("wallet_send_fee_capture:", e))
      }

      await markWalletSendSessionExecuted(input.admin, session.form_session_id)
      return {
        ok: true,
        easnerTransactionId,
        status: send.status,
        provider: "turnkey",
        providerTransactionId: send.providerTransactionId,
        txHash: send.txHash,
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg === "wallet_send_fee_address_not_configured") {
        return { ok: false, error: msg }
      }
      return { ok: false, error: msg || "turnkey_send_failed" }
    }
  }

  const marginAmount = session.margin_amount
  const lifiFloor = session.lifi_floor
  // Explicit Easner 1% leg = total − lifiFloor − FX margin (also SPL-sent to the fee wallet).
  const processingFee = Math.max(
    0,
    Math.round((session.total_debited - lifiFloor - marginAmount) * 1_000_000) / 1_000_000,
  )
  const ready = await assertWalletSendExecuteReady(input.admin, {
    ctx: input.ctx,
    userId: input.userId,
    businessId: input.businessId,
    balanceCurrency,
    totalDebited: session.total_debited,
    onChainOutTotal: lifiFloor,
  })
  if (!ready.ok) return ready

  const feeAddress = resolveWalletSendFeeSolanaAddress({ ledgerCurrency: balanceCurrency })
  if (!feeAddress) {
    return { ok: false, error: "wallet_send_fee_address_not_configured" }
  }

  const lifi = await executeLifiWalletSend({
    admin: input.admin,
    ctx: input.ctx,
    session,
    feeAddress,
    easnerTransactionId,
  })
  if (!lifi.ok) return lifi

  await debitWalletBalance(input.admin, {
    userId: input.userId,
    businessId: input.businessId,
    currency: balanceCurrency,
    amount: session.total_debited,
  })

  const feeLegAmount =
    Math.round((marginAmount + processingFee) * 1_000_000) / 1_000_000

  const occurredAt = new Date().toISOString()
  const upsert = await upsertLedgerTransaction(input.admin, {
    userId: input.userId,
    businessId: input.businessId,
    provider: "lifi",
    providerTransactionId: lifi.providerTransactionId,
    status: lifi.status,
    amount: session.total_debited,
    currency: balanceCurrency,
    direction: "out",
    occurredAt,
    ...(lifi.status === "settled" ? { settledAt: occurredAt } : {}),
    txHash: lifi.txHash,
    counterpartyAddress: session.destination_address,
    asset: session.receive_asset,
    chain: session.receive_network,
    metadata: {
      activity_type: "wallet_send",
      execution_model: "lifi_bridge",
      margin_capture_mode: "fee_wallet_deferred",
      receive_asset: session.receive_asset,
      receive_network: session.receive_network,
      receive_amount: session.receive_amount,
      receive_currency: session.receive_asset,
      lifi_floor: lifiFloor,
      margin_amount: marginAmount,
      processing_fee: processingFee,
      fee_destination_address: feeAddress,
      lifi_tool: lifi.lifiTool,
      lifi_quote_id: lifi.lifiQuoteId,
      form_session_id: session.form_session_id,
      easner_transaction_id: easnerTransactionId,
      payout_review: payoutReview,
      ...walletSendRecipientMetadata(input.recipient),
      ...(feeLegAmount > MARGIN_DUST ? { processing_fee_pending: true } : {}),
      ...(input.reviewSnapshot ?? {}),
    },
  })

  if (lifi.status === "settled" && upsert.transactionId) {
    await captureWalletSendFeeLegIfPending(input.admin, {
      transactionId: upsert.transactionId,
      userId: input.userId,
      businessId: input.businessId,
    }).catch((e) => console.warn("wallet_send_fee_capture:", e))
  }

  await markWalletSendSessionExecuted(input.admin, session.form_session_id)
  return {
    ok: true,
    easnerTransactionId,
    status: lifi.status,
    provider: "lifi",
    providerTransactionId: lifi.providerTransactionId,
    txHash: lifi.txHash,
  }
}

export async function resolveWalletSendAccountContext(request: Request, userId: string) {
  return resolveNoahAccountContext(request, userId)
}
