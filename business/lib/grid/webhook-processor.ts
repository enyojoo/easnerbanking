import type { SupabaseClient } from "@supabase/supabase-js"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { mergeGridPayoutLifecycle } from "./grid-ledger"
import type { GridWebhookEvent } from "./types"
import {
  gridWebhookQuoteId,
  gridWebhookTransactionId,
} from "./webhook-event-id"

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
  const terminalSuccess =
    status.includes("COMPLETED") ||
    eventType(input.event).includes("OUTGOING_PAYMENT.COMPLETED") ||
    eventType(input.event).includes("COMPLETED")
  const terminalFailed =
    status.includes("FAILED") ||
    eventType(input.event).includes("OUTGOING_PAYMENT.FAILED") ||
    eventType(input.event).includes("FAILED")

  const txStatus = terminalSuccess ? "settled" : terminalFailed ? "failed" : "pending"
  const now = new Date().toISOString()

  await admin
    .from("grid_transfers")
    .update({
      status: terminalSuccess ? "settled" : terminalFailed ? "failed" : transfer.status,
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
    grid_webhook_status: status || eventType(input.event),
    grid_transaction_id: input.transactionId,
    settled_at: terminalSuccess ? now : undefined,
    failure_reason: terminalFailed ? String(input.event.data?.failureReason ?? status) : undefined,
  })

  await upsertLedgerTransaction(admin, {
    userId: String(tx.user_id),
    businessId: tx.business_id ? String(tx.business_id) : null,
    provider: "grid",
    providerTransactionId: String(tx.provider_transaction_id ?? quoteId),
    status: txStatus,
    amount: Number(tx.amount ?? 0),
    currency: "USD",
    direction: "out",
    metadata,
    baseCurrency: "USD",
    asset: "USDC",
  })

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
    (status.includes("COMPLETED") && type.includes("INCOMING"))
  const outgoingComplete =
    type.includes("OUTGOING_PAYMENT.COMPLETED") ||
    (status.includes("COMPLETED") && type.includes("OUTGOING"))
  const terminalFailed = status.includes("FAILED") || type.includes("FAILED")

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
  const terminalSuccess =
    status.includes("COMPLETED") ||
    eventType(input.event).includes("INCOMING_PAYMENT.COMPLETED") ||
    eventType(input.event).includes("COMPLETED")

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

  if (type.includes("CUSTOMER.KYB")) {
    const { handleGridKybWebhook } = await import("./kyb-webhook")
    const kyb = await handleGridKybWebhook(admin, event)
    if (kyb.handled) return
  }

  if (type.includes("OUTGOING")) {
    const xb = await handleGridCrossBorderSendWebhook(admin, { event, quoteId, transactionId, status })
    if (xb.handled) return
    await handleGridBalancePayoutWebhook(admin, { event, quoteId, transactionId, status })
    return
  }

  if (type.includes("INCOMING")) {
    const xb = await handleGridCrossBorderSendWebhook(admin, { event, quoteId, transactionId, status })
    if (xb.handled) return
    const fund = await handleGridFundBalanceWebhook(admin, { event, quoteId, status })
    if (fund.handled) return
    const { handleGridVaInboundDepositWebhook } = await import("./grid-va-inbound-webhook")
    const vaInbound = await handleGridVaInboundDepositWebhook(admin, { event })
    if (vaInbound.handled) return
    // Quote-less INCOMING: Stripe invoice settlement payout to Grid VA
    const { handleGridStripeSettlementWebhook } = await import("./stripe-settlement-webhook")
    await handleGridStripeSettlementWebhook(admin, { event })
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
