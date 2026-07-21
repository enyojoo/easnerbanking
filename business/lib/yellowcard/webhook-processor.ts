/**
 * Yellowcard webhook side-effect handlers (Noah-parity ledger + orchestration).
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import {
  classifyYellowcardWebhookEvent,
  isYcReceivePrePaymentEvent,
  shouldYcReceiveWebhookAdvanceProcessing,
  yellowcardWebhookEventId,
  yellowcardWebhookEventType,
} from "./webhook-event-id"
import {
  buildYcRefundExpectedPatch,
  canTransitionYcCrossBorderStatus,
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
import { findPendingGlobalPayoutByExternalId } from "@/lib/noah/global-payout-ledger"

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
  const eventType = yellowcardWebhookEventType(input.payload)

  if (input.classified.isTerminalFailure) {
    await patchYcFundBalanceReceiveStatus(admin, {
      transferId: transfer.id,
      transactionId,
      sequenceId: input.sequenceId,
      status: "failed",
      payload: input.payload,
      occurredAt,
      eventType,
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
    status: isYcReceivePrePaymentEvent(eventType) ? "pending" : "processing",
    payload: input.payload,
    occurredAt,
    eventType,
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

  let { data: row } = await admin
    .from("transactions")
    .select("id,user_id,business_id,metadata,status,amount,provider,provider_transaction_id")
    .eq("id", transactionId)
    .maybeSingle()
  if (!row?.id) {
    const easnerPayoutIdFromTransfer = String(transfer?.metadata?.easner_payout_id ?? "").trim()
    if (easnerPayoutIdFromTransfer) {
      const pending = await findPendingGlobalPayoutByExternalId(admin, easnerPayoutIdFromTransfer)
      if (pending?.id) {
        const fallback = await admin
          .from("transactions")
          .select("id,user_id,business_id,metadata,status,amount,provider,provider_transaction_id")
          .eq("id", pending.id)
          .maybeSingle()
        row = fallback.data ?? null
      }
    }
  }
  if (!row?.id) return

  const prior = asMeta(row.metadata)
  const occurredAt = pickOccurredAt(input.payload)
  const easnerPayoutId = String(prior.easner_payout_id ?? row.id)
  const providerTransactionId = String(
    row.provider_transaction_id ?? prior.yc_send_id ?? prior.form_session_id ?? input.sequenceId,
  )

  if (input.classified.isTerminalSuccess) {
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

    await upsertLedgerTransaction(admin, {
      userId: String(row.user_id),
      businessId: row.business_id ? String(row.business_id) : null,
      provider: String(row.provider ?? "yellowcard"),
      providerTransactionId,
      status: "failed",
      amount: Number(row.amount ?? 0),
      currency: "USD",
      direction: "out",
      payload: input.payload,
      metadata: meta,
      occurredAt,
      baseCurrency: "USD",
      asset: "USDC",
    })

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
    provider: String(row.provider ?? "yellowcard"),
    providerTransactionId,
    status: "processing",
    amount: Number(row.amount ?? 0),
    currency: "USD",
    direction: "out",
    payload: input.payload,
    metadata: meta,
    occurredAt,
    baseCurrency: "USD",
    asset: "USDC",
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
  const eventType = yellowcardWebhookEventType(input.payload)

  async function loadTxAttestedAt(): Promise<string | null> {
    if (!transactionId) return null
    const { data: txRow } = await admin
      .from("transactions")
      .select("metadata")
      .eq("id", transactionId)
      .maybeSingle()
    return String(asMeta(txRow?.metadata).payment_attested_at ?? "").trim() || null
  }

  async function shouldAdvanceLeg1Processing(force?: boolean): Promise<boolean> {
    const attestedAt = await loadTxAttestedAt()
    return shouldYcReceiveWebhookAdvanceProcessing({
      eventType,
      paymentAttestedAt: attestedAt,
      webhookOccurredAt: occurredAt,
      force,
    })
  }

  async function upsertCrossBorderTx(
    status: "processing" | "failed" | "settled",
    lifecyclePatch: Parameters<typeof mergeYcPayoutLifecycle>[1],
    extraMeta?: Record<string, unknown>,
    opts?: { settledAt?: string },
  ): Promise<void> {
    if (!transactionId) return
    const { data: txRow } = await admin
      .from("transactions")
      .select(
        "id,user_id,business_id,metadata,amount,provider,provider_transaction_id,direction,currency",
      )
      .eq("id", transactionId)
      .maybeSingle()
    if (!txRow?.id) return
    const prior = asMeta(txRow.metadata)
    const metadata = {
      ...mergeYcPayoutLifecycle(prior, lifecyclePatch),
      ...(extraMeta ?? {}),
    }
    await upsertLedgerTransaction(admin, {
      userId: String(txRow.user_id),
      businessId: txRow.business_id ? String(txRow.business_id) : null,
      provider: String(txRow.provider ?? "yellowcard"),
      providerTransactionId: String(
        txRow.provider_transaction_id ?? prior.yc_sequence_id ?? transfer.leg1_sequence_id ?? transfer.id,
      ),
      status,
      amount: Number(txRow.amount ?? 0),
      currency: String(txRow.currency ?? "USD"),
      direction: (txRow.direction === "in" ? "in" : "out") as "in" | "out",
      payload: input.payload,
      metadata,
      occurredAt,
      settledAt: opts?.settledAt,
      baseCurrency: "USD",
    })
  }

  // Leg 1 receive settlement → trigger leg 2
  if (
    input.shouldTriggerCrossBorderLeg2 &&
    (ctx.matchedLeg === "leg1" || transfer.leg1_sequence_id === input.sequenceId)
  ) {
    if (canTransitionYcCrossBorderStatus(String(transfer.status), "leg1_settled")) {
      const transferMeta = asMeta(transfer.metadata)
      const settlement = (input.payload.settlementInfo ??
        input.payload.settlement_info) as Record<string, unknown> | null
      const omnibusAmount = Number(
        settlement?.cryptoAmount ?? transfer.omnibus_in_actual ?? 0,
      )
      const { isCrossBorderLeg1OmnibusSufficient } = await import("./cross-border-orchestrator")
      const omnibusSufficient =
        omnibusAmount > 0 &&
        isCrossBorderLeg1OmnibusSufficient({
          omnibusAmount,
          metadata: transferMeta,
        })

      await upsertCrossBorderTx(
        "processing",
        {
          processing_at: occurredAt,
        },
        {
          leg1_settled_at: occurredAt,
          leg1_status: "complete",
          ...(omnibusSufficient ? {} : { ops_alert: "yc_omnibus_underfunded" }),
        },
      )
      await admin
        .from("yc_transfers")
        .update({
          leg1_status: "complete",
          status: "leg1_settled",
          ...(omnibusAmount > 0 ? { omnibus_in_actual: omnibusAmount } : {}),
          metadata: {
            ...transferMeta,
            leg1_settled_at: occurredAt,
            ...(omnibusAmount > 0 ? { omnibus_in_actual: omnibusAmount } : {}),
            ...(omnibusSufficient
              ? {}
              : { ops_alert: "yc_omnibus_underfunded" }),
          },
          updated_at: occurredAt,
        })
        .eq("id", transfer.id)

      if (omnibusSufficient) {
        const { maybeExecuteCrossBorderLeg2 } = await import("./cross-border-orchestrator")
        await maybeExecuteCrossBorderLeg2(admin, transfer.id)
      }
    }
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
      if (canTransitionYcCrossBorderStatus(String(transfer.status), "failed")) {
        await admin
          .from("yc_transfers")
          .update({
            status: "failed",
            leg2_status: "failed",
            metadata: meta,
            updated_at: occurredAt,
          })
          .eq("id", transfer.id)
        await upsertCrossBorderTx(
          "failed",
          { failed_at: occurredAt },
          {
            ...buildYcRefundExpectedPatch({}),
            failure_leg: "leg2",
            leg2_status: "failed",
          },
        )
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
      if (canTransitionYcCrossBorderStatus(String(transfer.status), "failed")) {
        await admin
          .from("yc_transfers")
          .update({ status: "failed", leg1_status: "failed", updated_at: occurredAt })
          .eq("id", transfer.id)
        await upsertCrossBorderTx(
          "failed",
          { failed_at: occurredAt },
          { failure_leg: "leg1", leg1_status: "failed" },
        )
      }
      return
    }
    if (input.classified.isTerminalSuccess && !input.shouldTriggerCrossBorderLeg2) {
      const advance = await shouldAdvanceLeg1Processing()
      await upsertCrossBorderTx(
        advance ? "processing" : "pending",
        advance ? { processing_at: occurredAt } : {},
        { yc_last_webhook_at: occurredAt, yc_last_event_type: eventType },
      )
      return
    }

    if (
      !input.classified.isTerminalFailure &&
      !input.classified.isTerminalSuccess &&
      !input.shouldTriggerCrossBorderLeg2
    ) {
      const advance = await shouldAdvanceLeg1Processing()
      const priorTransferStatus = String(transfer.status)
      const nextTransferStatus =
        advance && priorTransferStatus === "awaiting_pay_in"
          ? "processing"
          : priorTransferStatus
      await admin
        .from("yc_transfers")
        .update({
          status: nextTransferStatus,
          leg1_status: isYcReceivePrePaymentEvent(eventType) ? "pending" : "processing",
          updated_at: occurredAt,
        })
        .eq("id", transfer.id)
      await upsertCrossBorderTx(
        advance ? "processing" : "pending",
        advance ? { processing_at: occurredAt } : {},
        {
          leg1_status: isYcReceivePrePaymentEvent(eventType) ? "pending" : "processing",
          yc_last_webhook_at: occurredAt,
          yc_last_event_type: eventType,
        },
      )
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
