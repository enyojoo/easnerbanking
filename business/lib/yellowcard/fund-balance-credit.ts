import type { SupabaseClient } from "@supabase/supabase-js"
import {
  triggerYcFundBalanceOmnibusSplit,
  computeYcFundBalanceEconomics,
} from "@/lib/yellowcard/execute-yc-fund-balance-split"
import {
  buildYcFundBalanceReceiveMetadata,
  mergeYcFundBalanceLifecycle,
} from "@/lib/yellowcard/yc-ledger"
import { shouldYcReceiveWebhookAdvanceProcessing } from "@/lib/yellowcard/webhook-event-id"
import { resolveLedgerOccurredAt } from "@/lib/ledger/ledger-occurred-at"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"

function asMeta(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
}

/**
 * Orchestrate YC fund_balance receive settlement: enrich metadata, then split omnibus → user vault.
 * Ledger credit happens only after on-chain delivery (see finalizeYcFundBalanceCredit).
 */
export async function creditFundBalanceFromYcReceive(
  admin: SupabaseClient,
  input: {
    transferId: string
    transactionId: string | null
    payload: Record<string, unknown>
    omnibusTxHash?: string | null
    omnibusAmount?: number | null
  },
): Promise<{ credited: boolean; creditAmt: number }> {
  const { data: transfer } = await admin
    .from("yc_transfers")
    .select("*")
    .eq("id", input.transferId)
    .maybeSingle()
  if (!transfer || transfer.mode !== "fund_balance") {
    return { credited: false, creditAmt: 0 }
  }
  if (String(transfer.status) === "completed") {
    const meta = asMeta(transfer.metadata)
    return { credited: false, creditAmt: Number(meta.usd_credit_applied ?? 0) }
  }

  const transferMeta = asMeta(transfer.metadata)
  const economics = computeYcFundBalanceEconomics({
    transfer,
    payload: input.payload,
    omnibusAmount: input.omnibusAmount,
  })
  const now = new Date().toISOString()
  const settlementInfo = asMeta(
    input.payload.settlementInfo ?? input.payload.settlement_info ?? transfer.settlement_info,
  )
  const omnibusTxHash = String(
    input.omnibusTxHash ??
      transferMeta.leg1_omnibus_tx_hash ??
      settlementInfo.txHash ??
      settlementInfo.tx_hash ??
      "",
  ).trim()

  await admin
    .from("yc_transfers")
    .update({
      leg1_status: "complete",
      omnibus_in_actual: economics.cryptoAmount,
      settlement_info:
        input.payload.settlementInfo ??
        input.payload.settlement_info ??
        transfer.settlement_info,
      metadata: {
        ...transferMeta,
        omnibus_in_expected: economics.expectedOmnibus,
        omnibus_in_actual: economics.cryptoAmount,
        ...(omnibusTxHash ? { leg1_omnibus_tx_hash: omnibusTxHash } : {}),
        ...(economics.omnibusCheckOk ? {} : { ops_alert: "yc_omnibus_underfunded" }),
      },
      updated_at: now,
    })
    .eq("id", input.transferId)

  if (input.transactionId) {
    await patchYcFundBalanceReceiveStatus(admin, {
      transferId: input.transferId,
      transactionId: input.transactionId,
      sequenceId: String(transfer.leg1_sequence_id ?? ""),
      status: "processing",
      payload: input.payload,
      occurredAt: now,
      forceAdvanceProcessing: true,
    })
  }

  if (!omnibusTxHash) {
    return { credited: false, creditAmt: 0 }
  }

  const split = await triggerYcFundBalanceOmnibusSplit(admin, {
    transferId: input.transferId,
    transactionId: input.transactionId,
    payload: input.payload,
    omnibusTxHash,
    omnibusAmount: input.omnibusAmount ?? economics.cryptoAmount,
  })

  return {
    credited: split.finalized === true,
    creditAmt: split.creditAmt ?? economics.creditAmt,
  }
}

/**
 * Patch fund_balance ledger for intermediate RECEIVE statuses (no credit yet).
 */
export async function patchYcFundBalanceReceiveStatus(
  admin: SupabaseClient,
  input: {
    transferId: string
    transactionId: string | null
    sequenceId: string
    status: "pending" | "processing" | "failed"
    payload: Record<string, unknown>
    occurredAt?: string
    eventType?: string
    forceAdvanceProcessing?: boolean
  },
): Promise<void> {
  const now = input.occurredAt ?? new Date().toISOString()
  const eventType = String(
    input.eventType ??
      input.payload.event ??
      input.payload.Event ??
      input.payload.status ??
      "",
  ).trim()
  const { data: transfer } = await admin
    .from("yc_transfers")
    .select("metadata, status, quoted_pay_in, pay_in_currency, quoted_receive, user_id, business_id, leg1_sequence_id")
    .eq("id", input.transferId)
    .maybeSingle()
  if (!transfer) return
  if (String(transfer.status) === "completed") return

  if (!input.transactionId) {
    const priorTransferStatus = String(transfer.status)
    const transferStatus =
      input.status === "failed"
        ? "failed"
        : priorTransferStatus === "awaiting_pay_in" || priorTransferStatus === "pending"
          ? priorTransferStatus
          : "processing"
    await admin
      .from("yc_transfers")
      .update({
        status: transferStatus,
        leg1_status: input.status === "failed" ? "failed" : input.status,
        updated_at: now,
      })
      .eq("id", input.transferId)
    return
  }

  const { data: txRow } = await admin
    .from("transactions")
    .select("metadata, occurred_at, created_at, provider, provider_transaction_id, amount")
    .eq("id", input.transactionId)
    .maybeSingle()
  const prior = asMeta(txRow?.metadata)
  const attestedAt = String(prior.payment_attested_at ?? "").trim()
  const advanceProcessing =
    input.status !== "failed" &&
    shouldYcReceiveWebhookAdvanceProcessing({
      eventType,
      paymentAttestedAt: attestedAt || null,
      webhookOccurredAt: now,
      force: input.forceAdvanceProcessing,
    })

  const priorTransferStatus = String(transfer.status)
  const transferStatus =
    input.status === "failed"
      ? "failed"
      : advanceProcessing
        ? "processing"
        : priorTransferStatus

  await admin
    .from("yc_transfers")
    .update({
      status: transferStatus,
      leg1_status: input.status === "failed" ? "failed" : input.status,
      updated_at: now,
    })
    .eq("id", input.transferId)

  const occurredAt = resolveLedgerOccurredAt({
    occurredAt: txRow?.occurred_at != null ? String(txRow.occurred_at) : null,
    createdAt: txRow?.created_at != null ? String(txRow.created_at) : null,
    fallback: now,
  })
  let meta = buildYcFundBalanceReceiveMetadata({
    prior,
    sequenceId: input.sequenceId,
    transferId: input.transferId,
    payload: input.payload,
    localPayIn: transfer.quoted_pay_in != null ? Number(transfer.quoted_pay_in) : null,
    localCurrency: transfer.pay_in_currency ? String(transfer.pay_in_currency) : null,
    usdCredit: transfer.quoted_receive != null ? Number(transfer.quoted_receive) : null,
  })
  meta = {
    ...meta,
    yc_last_webhook_at: now,
    ...(eventType ? { yc_last_event_type: eventType } : {}),
  }
  if (advanceProcessing) {
    meta = mergeYcFundBalanceLifecycle(meta, { processing_at: now })
  }
  if (input.status === "failed") {
    meta = mergeYcFundBalanceLifecycle(meta, { failed_at: now })
  }

  const nextStatus =
    input.status === "failed" ? "failed" : advanceProcessing ? "processing" : "pending"

  await upsertLedgerTransaction(admin, {
    userId: String(transfer.user_id),
    businessId: transfer.business_id ? String(transfer.business_id) : null,
    provider: "yellowcard",
    providerTransactionId: String(
      transfer.leg1_sequence_id ?? txRow?.provider_transaction_id ?? input.sequenceId,
    ),
    status: nextStatus,
    amount: Number(txRow?.amount ?? transfer.quoted_receive ?? 0),
    currency: "USD",
    direction: "in",
    payload: input.payload,
    metadata: meta,
    occurredAt,
    baseCurrency: "USD",
  })
}
