import type { SupabaseClient } from "@supabase/supabase-js"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { reverseGlobalPayoutWalletDebitForEasnerPayoutId } from "@/lib/noah/global-payout-ledger"
import { captureGridBalancePayoutProcessingFeeIfPending } from "@/lib/processing-fee/capture-pending-processing-fee"
import { isEasnerRevenueAlreadySwept } from "@/lib/processing-fee/fee-wallet-sweep"
import { buildGridRefundExpectedPatch, mergeGridPayoutLifecycle } from "./grid-ledger"
import { gridMoneyToMajor } from "./webhook-amount"
import type { GridWebhookEvent } from "./types"
import { maybeApplyGridComplianceRestriction } from "@/lib/account-restriction"
import {
  gridWebhookQuoteId,
  gridWebhookTransactionId,
} from "./webhook-event-id"
import { classifyGridOutgoingPayoutWebhook } from "./webhook-status"

export { classifyGridOutgoingPayoutWebhook } from "./webhook-status"

function eventType(payload: GridWebhookEvent): string {
  return String(payload.eventType ?? payload.type ?? "").trim().toUpperCase()
}

function webhookData(event: GridWebhookEvent): Record<string, unknown> | undefined {
  return event.data && typeof event.data === "object"
    ? (event.data as Record<string, unknown>)
    : undefined
}

export async function handleGridBalancePayoutWebhook(
  admin: SupabaseClient,
  input: {
    event: GridWebhookEvent
    quoteId?: string
    transactionId?: string
    status?: string
  },
): Promise<{ handled: boolean }> {
  const quoteId = String(
    input.quoteId ?? gridWebhookQuoteId(webhookData(input.event)) ?? "",
  ).trim()
  if (!quoteId) return { handled: false }

  const { data: transfer } = await admin
    .from("grid_transfers")
    .select("id,transaction_id,status,metadata")
    .eq("grid_quote_id", quoteId)
    .eq("mode", "balance_payout")
    .maybeSingle()

  if (!transfer?.transaction_id) return { handled: false }

  const status = String(input.status ?? input.event.data?.status ?? "").toUpperCase()
  const type = eventType(input.event)
  const txStatus = classifyGridOutgoingPayoutWebhook({ eventType: type, status })
  const terminalSuccess = txStatus === "settled"
  const terminalFailed = txStatus === "failed"
  const now = new Date().toISOString()

  await admin
    .from("grid_transfers")
    .update({
      status: terminalSuccess ? "settled" : terminalFailed ? "failed" : "processing",
      grid_transaction_id: String(
        input.transactionId ?? gridWebhookTransactionId(webhookData(input.event)) ?? "",
      ),
      updated_at: now,
    })
    .eq("id", transfer.id)

  const { data: tx } = await admin
    .from("transactions")
    .select("id,user_id,business_id,metadata,amount,provider,provider_transaction_id,status")
    .eq("id", transfer.transaction_id)
    .maybeSingle()

  if (!tx?.id) return { handled: true }

  const priorStatus = String(tx.status ?? "").toLowerCase()
  const nextStatus = terminalSuccess
    ? "settled"
    : terminalFailed
      ? "failed"
      : priorStatus === "settled"
        ? "settled"
        : priorStatus === "failed"
          ? "failed"
          : "processing"

  const prior =
    tx.metadata && typeof tx.metadata === "object" ? (tx.metadata as Record<string, unknown>) : {}
  const sent = gridMoneyToMajor(webhookData(input.event)?.sentAmount)
  let metadata = mergeGridPayoutLifecycle(prior, {
    grid_webhook_status: status || type,
    ...(input.transactionId ? { grid_transaction_id: input.transactionId } : {}),
    ...(terminalSuccess || terminalFailed ? {} : { processing_at: now }),
    ...(terminalSuccess ? { completed_at: now, settled_at: now } : {}),
    ...(terminalFailed
      ? {
          failed_at: now,
          failure_reason: String(input.event.data?.failureReason ?? status),
        }
      : {}),
  })
  if (terminalFailed) {
    metadata = buildGridRefundExpectedPatch(metadata, {
      refundAmount: sent && sent.amount > 0 ? sent.amount : null,
    })
  }

  await upsertLedgerTransaction(admin, {
    userId: String(tx.user_id),
    businessId: tx.business_id ? String(tx.business_id) : null,
    provider: "grid",
    providerTransactionId: String(tx.provider_transaction_id ?? quoteId),
    status: nextStatus,
    amount: Number(tx.amount ?? 0),
    currency: "USD",
    direction: "out",
    metadata,
    baseCurrency: "USD",
    asset: "USDC",
  })

  if (terminalSuccess && !isEasnerRevenueAlreadySwept(metadata)) {
    await captureGridBalancePayoutProcessingFeeIfPending(admin, {
      transactionId: String(tx.id),
      userId: String(tx.user_id),
      businessId: tx.business_id ? String(tx.business_id) : null,
    }).catch((e) => {
      console.warn("grid_balance_payout_processing_fee_capture:", e)
    })
  }

  if (terminalFailed) {
    const easnerPayoutId = String(metadata.easner_payout_id ?? prior.easner_payout_id ?? "").trim()
    if (easnerPayoutId) {
      await reverseGlobalPayoutWalletDebitForEasnerPayoutId(admin, { easnerPayoutId }).catch(() => {})
    }
    const customerId = String(prior.grid_customer_id ?? metadata.grid_customer_id ?? "").trim()
    if (easnerPayoutId && customerId) {
      const { startGridPayoutRefundTurnkeySweep } = await import("./payout-refund-sweep")
      await startGridPayoutRefundTurnkeySweep(admin, {
        userId: String(tx.user_id),
        businessId: tx.business_id ? String(tx.business_id) : null,
        customerId,
        easnerPayoutId,
        payoutLedgerTransactionId: String(tx.id),
        failedGridTransactionId: String(
          input.transactionId ?? gridWebhookTransactionId(webhookData(input.event)) ?? "",
        ).trim(),
        requestedAmountUsdc: sent && sent.amount > 0 ? sent.amount : Number(prior.crypto_authorized_amount ?? 0),
      }).catch((e) => {
        console.warn(
          "[grid] payout refund sweep enqueue failed:",
          e instanceof Error ? e.message : e,
        )
      })
    }
  }

  return { handled: true }
}

export async function handleGridCrossBorderSendWebhook(
  admin: SupabaseClient,
  input: {
    event: GridWebhookEvent
    quoteId?: string
    transactionId?: string
    status?: string
  },
): Promise<{ handled: boolean }> {
  const quoteId = String(
    input.quoteId ?? gridWebhookQuoteId(webhookData(input.event)) ?? "",
  ).trim()
  if (!quoteId) return { handled: false }

  const { data: transfer } = await admin
    .from("grid_transfers")
    .select("id,transaction_id,status,pay_in_currency,metadata")
    .eq("grid_quote_id", quoteId)
    .eq("mode", "cross_border_send")
    .maybeSingle()

  if (!transfer?.transaction_id) return { handled: false }

  const status = String(input.status ?? input.event.data?.status ?? "").toUpperCase()
  const type = eventType(input.event)
  const incomingComplete =
    type.includes("INCOMING_PAYMENT.COMPLETED") ||
    (status.includes("COMPLETED") && type.includes("INCOMING") && !type.includes("REFUND"))
  const outgoingComplete =
    type.includes("OUTGOING_PAYMENT.COMPLETED") && !type.includes("REFUND")
  const terminalFailed =
    type.includes("REFUND") ||
    status.includes("FAILED") ||
    type.includes("OUTGOING_PAYMENT.FAILED") ||
    type.includes("FAILED")

  const now = new Date().toISOString()
  let txStatus = "pending"
  if (outgoingComplete) txStatus = "settled"
  else if (terminalFailed) txStatus = "failed"
  else if (incomingComplete) txStatus = "processing"

  await admin
    .from("grid_transfers")
    .update({
      status: outgoingComplete ? "settled" : terminalFailed ? "failed" : incomingComplete ? "processing" : transfer.status,
      grid_transaction_id: String(
        input.transactionId ?? gridWebhookTransactionId(webhookData(input.event)) ?? "",
      ),
      updated_at: now,
    })
    .eq("id", transfer.id)

  const { data: tx } = await admin
    .from("transactions")
    .select("id,user_id,business_id,metadata,amount,provider,provider_transaction_id")
    .eq("id", transfer.transaction_id)
    .maybeSingle()

  if (!tx?.id) return { handled: true }

  const prior =
    tx.metadata && typeof tx.metadata === "object" ? (tx.metadata as Record<string, unknown>) : {}
  const metadata = mergeGridPayoutLifecycle(prior, {
    grid_webhook_status: status || type,
    grid_transaction_id: input.transactionId,
    settled_at: outgoingComplete ? now : undefined,
    failure_reason: terminalFailed ? String(input.event.data?.failureReason ?? status) : undefined,
  })

  await upsertLedgerTransaction(admin, {
    userId: String(tx.user_id),
    businessId: tx.business_id ? String(tx.business_id) : null,
    provider: "grid",
    providerTransactionId: String(tx.provider_transaction_id ?? quoteId),
    status: txStatus,
    amount: Number(tx.amount ?? 0),
    currency: String(transfer.pay_in_currency ?? "USD"),
    direction: "out",
    metadata,
    baseCurrency: "USD",
    asset: "USDC",
  })

  return { handled: true }
}

export async function handleGridFundBalanceWebhook(
  admin: SupabaseClient,
  input: { event: GridWebhookEvent; quoteId?: string; status?: string },
): Promise<{ handled: boolean }> {
  const quoteId = String(
    input.quoteId ?? gridWebhookQuoteId(webhookData(input.event)) ?? "",
  ).trim()
  if (!quoteId) return { handled: false }

  const { data: transfer } = await admin
    .from("grid_transfers")
    .select("*")
    .eq("grid_quote_id", quoteId)
    .eq("mode", "fund_balance")
    .maybeSingle()

  if (!transfer?.transaction_id) return { handled: false }

  const status = String(input.status ?? input.event.data?.status ?? "").toUpperCase()
  const type = eventType(input.event)
  const terminalSuccess =
    type.includes("INCOMING_PAYMENT.COMPLETED") ||
    (status === "COMPLETED" && type.includes("INCOMING") && !type.includes("REFUND"))

  if (!terminalSuccess) return { handled: true }

  const { creditGridFundBalanceFromWebhook } = await import("./fund-balance-credit")
  await creditGridFundBalanceFromWebhook(admin, {
    transferId: String(transfer.id),
    transactionId: String(transfer.transaction_id),
  })

  return { handled: true }
}

export async function applyGridWebhookSideEffects(
  admin: SupabaseClient,
  payload: unknown,
): Promise<void> {
  const event = (payload && typeof payload === "object" ? payload : {}) as GridWebhookEvent
  const data = webhookData(event)
  const type = eventType(event)
  const quoteId = gridWebhookQuoteId(data)
  const transactionId = gridWebhookTransactionId(data)
  const status = String(data?.status ?? "").trim()

  if (type.includes("CUSTOMER") && data) {
    const compliance = await maybeApplyGridComplianceRestriction(admin, {
      customer: data,
      event,
      partnerEventId: type,
    })
    if (compliance.handled && !type.includes("CUSTOMER.KYB") && !type.startsWith("VERIFICATION.")) {
      return
    }
  }

  if (type.includes("CUSTOMER.KYB") || type.startsWith("VERIFICATION.")) {
    const { handleGridKybWebhook } = await import("./kyb-webhook")
    const kyb = await handleGridKybWebhook(admin, event)
    if (kyb.handled) return
  }

  if (type.includes("OUTGOING")) {
    const xb = await handleGridCrossBorderSendWebhook(admin, { event, quoteId, transactionId, status })
    if (xb.handled) return
    const { settleGridVaTurnkeySweepFromOutgoing } = await import("./va-turnkey-sweep")
    const sweep = await settleGridVaTurnkeySweepFromOutgoing(admin, { event })
    if (sweep.handled) return
    const { settleGridPayoutRefundSweepFromOutgoing } = await import("./payout-refund-sweep")
    const refundSweep = await settleGridPayoutRefundSweepFromOutgoing(admin, { event })
    if (refundSweep.handled) return
    await handleGridBalancePayoutWebhook(admin, { event, quoteId, transactionId, status })
    return
  }

  if (type.includes("INCOMING")) {
    const xb = await handleGridCrossBorderSendWebhook(admin, { event, quoteId, transactionId, status })
    if (xb.handled) return
    const fund = await handleGridFundBalanceWebhook(admin, { event, quoteId, status })
    if (fund.handled) return
    const payout = await handleGridBalancePayoutWebhook(admin, { event, quoteId, transactionId, status })
    if (payout.handled) return
    // Connect settlement (originator EASNER) before generic VA bank on-ramp
    const { handleGridStripeSettlementWebhook } = await import("./stripe-settlement-webhook")
    const stripeSettlement = await handleGridStripeSettlementWebhook(admin, { event })
    if (stripeSettlement.handled) {
      const { startGridVaTurnkeySweepFromInbound } = await import("./va-turnkey-sweep")
      await startGridVaTurnkeySweepFromInbound(admin, { event }).catch((e) => {
        console.warn("[grid] connect va turnkey sweep enqueue failed:", e instanceof Error ? e.message : e)
      })
      return
    }
    const { handleGridVaInboundDepositWebhook } = await import("./grid-va-inbound-webhook")
    await handleGridVaInboundDepositWebhook(admin, { event })
    return
  }

  if (quoteId) {
    const xb = await handleGridCrossBorderSendWebhook(admin, { event, quoteId, transactionId, status })
    if (xb.handled) return
    const payout = await handleGridBalancePayoutWebhook(admin, { event, quoteId, transactionId, status })
    if (payout.handled) return
    await handleGridFundBalanceWebhook(admin, { event, quoteId, status })
  }
}
