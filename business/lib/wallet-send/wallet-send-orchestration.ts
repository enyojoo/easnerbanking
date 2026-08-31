import type { SupabaseClient } from "@supabase/supabase-js"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { createTurnkeySend } from "@/lib/turnkey/send"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { applyWalletBalanceDelta } from "@/lib/wallet/wallet-balances-db"
import { generateTransactionId } from "@/lib/transaction-id"
import { isRelayWalletSendEnabled, isWalletSendEnabled, requireRelayApiKey } from "@/lib/relay/config"
import { getTurnkeyDisplayBalancesUsdEur } from "@/lib/wallet/turnkey-chain-balances"
import { resolveWalletSendExecutionModel, isBridgeExecutionModel } from "./routing"
import { isPayoutLockOnReviewEnabled } from "@/lib/payout/payout-lock-flags"
import { getWalletSendSession, markWalletSendSessionExecuted } from "./wallet-send-session"
import { executeRelayWalletSend } from "./relay-execute"
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
import { destinationMetadata } from "@/lib/destination-reference"

export type ExecuteWalletSendInput = {
  admin: SupabaseClient
  ctx: NoahAccountContext
  userId: string
  businessId: string | null
  recipient: WalletRecipientRow
  formSessionId: string
  reservedDebitEtid?: string
  reviewSnapshot?: Record<string, unknown>
  destinationRef?: string
}

export type ExecuteWalletSendResult =
  | {
      ok: true
      easnerTransactionId: string
      status: "pending" | "settled" | "failed"
      provider: "turnkey" | "relay"
      providerTransactionId: string
      txHash?: string | null
    }
  | { ok: false; error: string }

const MARGIN_DUST = 0.000_001

function walletSendRecipientMetadata(recipient: WalletRecipientRow, destinationRef: string) {
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
    destination_ref: destinationRef,
    ...destinationMetadata(destinationRef),
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
    allowExecuted: true,
  })
  if (!session) {
    return { ok: false, error: "quote_expired" }
  }
  const expectedDestinationRef = input.destinationRef || `recipient:${input.recipient.id}`
  if (session.destination_ref !== expectedDestinationRef) {
    return { ok: false, error: "recipient_mismatch" }
  }
  if (session.status === "executed") {
    let query = input.admin
      .from("ledger_transactions")
      .select("provider,provider_transaction_id,status,tx_hash,metadata")
      .contains("metadata", { form_session_id: session.form_session_id })
      .limit(1)
    query = input.businessId ? query.eq("business_id", input.businessId) : query.eq("user_id", input.userId)
    const { data: existing } = await query.maybeSingle()
    const metadata = (existing?.metadata as Record<string, unknown> | null) ?? {}
    const easnerTransactionId = String(metadata.easner_transaction_id || "")
    if (!existing || !easnerTransactionId) return { ok: false, error: "executed_result_unavailable" }
    return {
      ok: true,
      easnerTransactionId,
      status: String(existing.status) === "failed" ? "failed" : String(existing.status) === "pending" ? "pending" : "settled",
      provider: String(existing.provider) === "relay" ? "relay" : "turnkey",
      providerTransactionId: String(existing.provider_transaction_id || ""),
      txHash: existing.tx_hash == null ? null : String(existing.tx_hash),
    }
  }

  const executionModel = resolveWalletSendExecutionModel(session.receive_asset, session.receive_network)
  const balanceCurrency = session.source_balance_currency as "USD" | "EUR"
  const easnerTransactionId = input.reservedDebitEtid?.trim() || generateTransactionId()

  const bridgeFloor = session.relay_floor
  const bridgeMid = session.relay_mid

  const channelCost =
    isBridgeExecutionModel(executionModel) && bridgeMid > 0
      ? Math.max(0, bridgeFloor - session.receive_amount / bridgeMid)
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
        /**
         * DELIBERATELY BLOCKING (reviewed and reverted from an attempted 0):
         * with 0 this returns "pending" unconditionally, which (a) makes the
         * chain-failure guard below dead code so a failed on-chain send would
         * still debit the balance with no reversal path, (b) skips inline fee
         * capture, and (c) writes a ledger row WITHOUT `turnkey_sub_org_id`
         * (only the skipped non-wallet-send branch persists it), which every
         * reconcile path keys on — the row would stay pending forever and the
         * margin would never be swept. Making this async requires: persisting
         * subOrgId in this row's metadata, reconcile-driven fee capture, and
         * an automatic failed-send balance reversal. Until then, correctness
         * beats the 2-minute worst-case wait.
         */
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
          ...walletSendRecipientMetadata(input.recipient, expectedDestinationRef),
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
  const processingFee = Math.max(
    0,
    Math.round((session.total_debited - bridgeFloor - marginAmount) * 1_000_000) / 1_000_000,
  )
  const ready = await assertWalletSendExecuteReady(input.admin, {
    ctx: input.ctx,
    userId: input.userId,
    businessId: input.businessId,
    balanceCurrency,
    totalDebited: session.total_debited,
    onChainOutTotal: bridgeFloor,
  })
  if (!ready.ok) return ready

  const feeAddress = resolveWalletSendFeeSolanaAddress({ ledgerCurrency: balanceCurrency })
  if (!feeAddress) {
    return { ok: false, error: "wallet_send_fee_address_not_configured" }
  }

  const { isRelayWalletSendEnabled, requireRelayApiKey } = await import("@/lib/relay/config")
  if (!isRelayWalletSendEnabled()) {
    return { ok: false, error: "relay_wallet_send_not_configured" }
  }
  requireRelayApiKey()
  const bridgeResult = await executeRelayWalletSend({
    admin: input.admin,
    ctx: input.ctx,
    session,
    feeAddress,
    easnerTransactionId,
  })
  if (!bridgeResult.ok) return bridgeResult

  await debitWalletBalance(input.admin, {
    userId: input.userId,
    businessId: input.businessId,
    currency: balanceCurrency,
    amount: session.total_debited,
  })

  const feeLegAmount = Math.round((marginAmount + processingFee) * 1_000_000) / 1_000_000
  const bridgeProvider = "relay"

  const occurredAt = new Date().toISOString()
  const upsert = await upsertLedgerTransaction(input.admin, {
    userId: input.userId,
    businessId: input.businessId,
    provider: bridgeProvider,
    providerTransactionId: bridgeResult.providerTransactionId,
    status: bridgeResult.status,
    amount: session.total_debited,
    currency: balanceCurrency,
    direction: "out",
    occurredAt,
    ...(bridgeResult.status === "settled" ? { settledAt: occurredAt } : {}),
    txHash: bridgeResult.txHash,
    counterpartyAddress: session.destination_address,
    asset: session.receive_asset,
    chain: session.receive_network,
    metadata: {
      activity_type: "wallet_send",
      execution_model: "relay_bridge",
      margin_capture_mode: "fee_wallet_deferred",
      receive_asset: session.receive_asset,
      receive_network: session.receive_network,
      receive_amount: session.receive_amount,
      receive_currency: session.receive_asset,
      relay_floor: bridgeFloor,
      margin_amount: marginAmount,
      processing_fee: processingFee,
      fee_destination_address: feeAddress,
      relay_request_id:
        "relayRequestId" in bridgeResult ? bridgeResult.relayRequestId : undefined,
      relay_quote_id: session.relay_quote_id,
      form_session_id: session.form_session_id,
      easner_transaction_id: easnerTransactionId,
      payout_review: payoutReview,
      ...walletSendRecipientMetadata(input.recipient, expectedDestinationRef),
      ...(feeLegAmount > MARGIN_DUST ? { processing_fee_pending: true } : {}),
      ...(input.reviewSnapshot ?? {}),
    },
  })

  if (bridgeResult.status === "settled" && upsert.transactionId) {
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
    status: bridgeResult.status,
    provider: bridgeProvider,
    providerTransactionId: bridgeResult.providerTransactionId,
    txHash: bridgeResult.txHash,
  }
}

export async function resolveWalletSendAccountContext(request: Request, userId: string) {
  return resolveNoahAccountContext(request, userId, undefined, "write")
}
