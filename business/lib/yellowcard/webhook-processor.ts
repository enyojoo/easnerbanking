/**
 * Yellowcard webhook side-effect handlers (Noah-parity ledger + orchestration).
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import {
  classifyYellowcardWebhookEvent,
  yellowcardWebhookEventId,
  yellowcardWebhookEventType,
} from "./webhook-event-id"
import {
  buildYcRefundExpectedPatch,
  findYcContextBySequenceId,
  mergeYcPayoutLifecycle,
} from "./yc-ledger"
import {
  creditFundBalanceFromYcReceive,
  patchYcFundBalanceReceiveStatus,
} from "./fund-balance-credit"
import {
  handleYcBalancePayoutSendComplete,
  handleYcBalancePayoutSendFailed,
} from "./payout-execute"

function asMeta(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
}

function pickSequenceId(payload: Record<string, unknown>): string | null {
  if (typeof payload.sequenceId === "string" && payload.sequenceId.trim()) {
    return payload.sequenceId.trim()
  }
  if (typeof payload.sequence_id === "string" && payload.sequence_id.trim()) {
    return payload.sequence_id.trim()
  }
  return null
}

function pickOccurredAt(payload: Record<string, unknown>): string {
  const raw =
    payload.executedAt ?? payload.executed_at ?? payload.updatedAt ?? payload.updated_at ?? null
  if (typeof raw === "string" && raw.trim()) return raw.trim()
  return new Date().toISOString()
}

export async function handleYcFundBalanceReceiveWebhook(
  admin: SupabaseClient,
  input: {
    sequenceId: string
    classified: ReturnType<typeof classifyYellowcardWebhookEvent>
    payload: Record<string, unknown>
  },
): Promise<void> {
  const ctx = await findYcContextBySequenceId(admin, input.sequenceId)
  const transfer = ctx.transfer
  if (!transfer || transfer.mode !== "fund_balance") return

  const transactionId = transfer.transaction_id ?? ctx.transaction?.id ?? null
  const occurredAt = pickOccurredAt(input.payload)

  if (input.classified.isTerminalFailure) {
    await patchYcFundBalanceReceiveStatus(admin, {
      transferId: transfer.id,
      transactionId,
      sequenceId: input.sequenceId,
      status: "failed",
      payload: input.payload,
      occurredAt,
    })
    return
  }

  if (input.classified.isTerminalSuccess || input.classified.isCryptoSettlementComplete) {
    await creditFundBalanceFromYcReceive(admin, {
      transferId: transfer.id,
      transactionId,
      payload: input.payload,
    })
    return
  }

  await patchYcFundBalanceReceiveStatus(admin, {
    transferId: transfer.id,
    transactionId,
    sequenceId: input.sequenceId,
    status: "processing",
    payload: input.payload,
    occurredAt,
  })
}

export async function handleYcBalancePayoutSendWebhook(
  admin: SupabaseClient,
  input: {
    sequenceId: string
    classified: ReturnType<typeof classifyYellowcardWebhookEvent>
    payload: Record<string, unknown>
  },
): Promise<void> {
  const ctx = await findYcContextBySequenceId(admin, input.sequenceId)
  const tx = ctx.transaction
  const transfer = ctx.transfer
  const mode =
    String(tx?.metadata?.yc_mode ?? "") ||
    (transfer?.mode === "balance_payout" ? "balance_payout" : "")
  if (mode !== "balance_payout" && transfer?.mode !== "balance_payout") return

  const transactionId = tx?.id ?? transfer?.transaction_id
  if (!transactionId) return

  const { data: row } = await admin
    .from("transactions")
    .select("id,user_id,business_id,metadata,status,amount")
    .eq("id", transactionId)
    .maybeSingle()
  if (!row?.id) return

  const prior = asMeta(row.metadata)
  const occurredAt = pickOccurredAt(input.payload)
  const easnerPayoutId = String(prior.easner_payout_id ?? row.id)

  if (input.classified.isTerminalSuccess) {
    let meta = mergeYcPayoutLifecycle(prior, { completed_at: occurredAt, processing_at: occurredAt })
    await admin
      .from("transactions")
      .update({
        status: "settled",
        settled_at: occurredAt,
        metadata: meta,
        updated_at: occurredAt,
      })
      .eq("id", row.id)

    if (transfer) {
      await admin
        .from("yc_transfers")
        .update({ status: "completed", leg2_status: "complete", updated_at: occurredAt })
        .eq("id", transfer.id)
    }

    await handleYcBalancePayoutSendComplete({
      transactionId: row.id,
      userId: String(row.user_id),
      businessId: row.business_id ? String(row.business_id) : null,
    })
    return
  }

  if (input.classified.isTerminalFailure) {
    const refundAmt = Number(prior.crypto_authorized_amount ?? prior.noah_send_amount ?? row.amount ?? 0)
    let meta = buildYcRefundExpectedPatch(prior, {
      refundAmount: Number.isFinite(refundAmt) && refundAmt > 0 ? refundAmt : null,
    })
    meta = mergeYcPayoutLifecycle(meta, { failed_at: occurredAt, processing_at: occurredAt })
    await admin
      .from("transactions")
      .update({ status: "failed", metadata: meta, updated_at: occurredAt })
      .eq("id", row.id)

    if (transfer) {
      await admin
        .from("yc_transfers")
        .update({ status: "failed", leg2_status: "failed", updated_at: occurredAt })
        .eq("id", transfer.id)
    }

    await handleYcBalancePayoutSendFailed({ easnerPayoutId })
    return
  }

  // In-flight
  const meta = mergeYcPayoutLifecycle(prior, { processing_at: occurredAt })
  await upsertLedgerTransaction(admin, {
    userId: String(row.user_id),
    businessId: row.business_id ? String(row.business_id) : null,
    provider: "yellowcard",
    providerTransactionId: String(prior.yc_send_id ?? prior.form_session_id ?? input.sequenceId),
    status: "processing",
    amount: Number(row.amount ?? 0),
    currency: "USD",
    direction: "out",
    payload: input.payload,
    metadata: meta,
    occurredAt,
    baseCurrency: "USD",
  })
}

export async function handleYcCrossBorderWebhook(
  admin: SupabaseClient,
  input: {
    sequenceId: string
    classified: ReturnType<typeof classifyYellowcardWebhookEvent>
    payload: Record<string, unknown>
    shouldTriggerCrossBorderLeg2: boolean
  },
): Promise<void> {
  const ctx = await findYcContextBySequenceId(admin, input.sequenceId)
  const transfer = ctx.transfer
  if (!transfer || transfer.mode !== "cross_border_send") return

  const occurredAt = pickOccurredAt(input.payload)
  const transactionId = transfer.transaction_id ?? ctx.transaction?.id ?? null

  // Leg 1 receive settlement → trigger leg 2
  if (
    input.shouldTriggerCrossBorderLeg2 &&
    (ctx.matchedLeg === "leg1" || transfer.leg1_sequence_id === input.sequenceId)
  ) {
    if (transactionId) {
      const { data: txRow } = await admin
        .from("transactions")
        .select("metadata")
        .eq("id", transactionId)
        .maybeSingle()
      const prior = asMeta(txRow?.metadata)
      const meta = mergeYcPayoutLifecycle(prior, {
        processing_at: occurredAt,
        leg1_settled_at: occurredAt,
        leg1_status: "complete",
      })
      await admin
        .from("transactions")
        .update({ status: "processing", metadata: meta, updated_at: occurredAt })
        .eq("id", transactionId)
    }
    await admin
      .from("yc_transfers")
      .update({
        leg1_status: "complete",
        status: "leg1_settled",
        metadata: {
          ...transfer.metadata,
          leg1_settled_at: occurredAt,
        },
        updated_at: occurredAt,
      })
      .eq("id", transfer.id)

    const { maybeExecuteCrossBorderLeg2 } = await import("./cross-border-orchestrator")
    await maybeExecuteCrossBorderLeg2(admin, transfer.id)
    return
  }

  // Leg 2 send
  if (ctx.matchedLeg === "leg2" || transfer.leg2_sequence_id === input.sequenceId) {
    if (input.classified.isTerminalSuccess) {
      const { completeCrossBorderOnSendSuccess } = await import("./cross-border-orchestrator")
      await completeCrossBorderOnSendSuccess(admin, transfer.id)
      return
    }
    if (input.classified.isTerminalFailure) {
      const meta = {
        ...transfer.metadata,
        ops_alert: "cross_border_leg2_failed_refund_to_fee_wallet",
        yc_refund_expected: true,
      }
      await admin
        .from("yc_transfers")
        .update({
          status: "failed",
          leg2_status: "failed",
          metadata: meta,
          updated_at: occurredAt,
        })
        .eq("id", transfer.id)
      if (transactionId) {
        const { data: txRow } = await admin
          .from("transactions")
          .select("metadata")
          .eq("id", transactionId)
          .maybeSingle()
        const prior = asMeta(txRow?.metadata)
        await admin
          .from("transactions")
          .update({
            status: "failed",
            metadata: mergeYcPayoutLifecycle(buildYcRefundExpectedPatch(prior), {
              failed_at: occurredAt,
              failure_leg: "leg2",
              leg2_status: "failed",
            }),
            updated_at: occurredAt,
          })
          .eq("id", transactionId)
      }
      console.error("[yc-cross-border] SEND.FAILED — refund to fee wallet; NGN recovery runbook", {
        transferId: transfer.id,
      })
      return
    }
  }

  // Leg 1 intermediate / terminal without crypto settlement yet
  if (ctx.matchedLeg === "leg1" || transfer.leg1_sequence_id === input.sequenceId) {
    if (input.classified.isTerminalFailure) {
      await admin
        .from("yc_transfers")
        .update({ status: "failed", leg1_status: "failed", updated_at: occurredAt })
        .eq("id", transfer.id)
      if (transactionId) {
        const { data: txRow } = await admin
          .from("transactions")
          .select("metadata")
          .eq("id", transactionId)
          .maybeSingle()
        const prior = asMeta(txRow?.metadata)
        await admin
          .from("transactions")
          .update({
            status: "failed",
            metadata: mergeYcPayoutLifecycle(prior, {
              failed_at: occurredAt,
              failure_leg: "leg1",
              leg1_status: "failed",
            }),
            updated_at: occurredAt,
          })
          .eq("id", transactionId)
      }
      return
    }
    if (input.classified.isTerminalSuccess && transactionId) {
      await admin
        .from("transactions")
        .update({
          status: "processing",
          metadata: mergeYcPayoutLifecycle(asMeta(ctx.transaction?.metadata), {
            processing_at: occurredAt,
          }),
          updated_at: occurredAt,
        })
        .eq("id", transactionId)
    }
  }
}

/**
 * Apply Yellowcard webhook side effects.
 * Leg 2 for cross-border fires when receive crypto settlement is complete.
 */
export async function applyYellowcardWebhookSideEffects(
  admin: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<{
  eventType: string
  kind: string
  sequenceId: string | null
  shouldTriggerCrossBorderLeg2: boolean
}> {
  const eventType = yellowcardWebhookEventType(payload)
  const classified = classifyYellowcardWebhookEvent(eventType)
  const sequenceId = pickSequenceId(payload)

  const shouldTriggerCrossBorderLeg2 =
    classified.isCryptoSettlementComplete ||
    (classified.kind === "receive" && classified.isCryptoSettlementComplete)

  console.info("[yellowcard-webhook]", {
    eventType,
    kind: classified.kind,
    sequenceId,
    status: payload.status ?? null,
    shouldTriggerCrossBorderLeg2,
  })

  if (!sequenceId) {
    return { eventType, kind: classified.kind, sequenceId: null, shouldTriggerCrossBorderLeg2 }
  }

  const ctx = await findYcContextBySequenceId(admin, sequenceId)
  const mode = ctx.transfer?.mode ?? String(ctx.transaction?.metadata?.yc_mode ?? "")

  if (mode === "fund_balance") {
    await handleYcFundBalanceReceiveWebhook(admin, { sequenceId, classified, payload })
  } else if (mode === "balance_payout") {
    if (classified.kind === "send" || classified.kind === "legacy_payment") {
      await handleYcBalancePayoutSendWebhook(admin, { sequenceId, classified, payload })
    }
  } else if (mode === "cross_border_send") {
    await handleYcCrossBorderWebhook(admin, {
      sequenceId,
      classified,
      payload,
      shouldTriggerCrossBorderLeg2,
    })
  } else if (ctx.transaction || ctx.transfer) {
    // Fallback: try balance_payout handlers if yc_mode missing but send event
    if (classified.kind === "send" || classified.kind === "legacy_payment") {
      await handleYcBalancePayoutSendWebhook(admin, { sequenceId, classified, payload })
    }
  }

  return {
    eventType,
    kind: classified.kind,
    sequenceId,
    shouldTriggerCrossBorderLeg2,
  }
}

export { yellowcardWebhookEventId, yellowcardWebhookEventType }
