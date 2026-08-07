import type { SupabaseClient } from "@supabase/supabase-js"
import {
  computeEasnerRevenueFeeWalletSweepAmount,
  EASNER_REVENUE_FEE_WALLET_SWEEP_MIN,
} from "@easner/shared"
import { applyNoahWebhookSideEffects } from "@/lib/noah/webhook-side-effects"
import { applyYellowcardWebhookSideEffects } from "@/lib/yellowcard/webhook-processor"
import { maybeExecuteCrossBorderLeg2 } from "@/lib/yellowcard/cross-border-orchestrator"
import { pollYellowcardTransferStatus } from "@/lib/reconciliation/yc-transaction-poll"
import { expireStaleYcPayInTransfers } from "@/lib/yellowcard/quote-key"
import {
  buildEasnerRevenueSweepMetadataPatch,
  computeSweepAmountFromMetadata,
  isEasnerRevenueAlreadySwept,
  readPriorSweepFromMetadata,
  sweepEasnerRevenueFromDepositOmnibus,
} from "@/lib/processing-fee/fee-wallet-sweep"
import {
  captureGlobalPayoutProcessingFeeIfPending,
  captureWalletSendFeeLegIfPending,
  captureYcBalancePayoutProcessingFeeIfPending,
} from "@/lib/processing-fee/capture-pending-processing-fee"
import {
  isNoahGlobalPayoutLedgerMeta,
  isYcBalancePayoutLedgerMeta,
} from "@/lib/processing-fee/payout-fee-ledger-routing"
import {
  buildNoahTransactionWebhookEnvelope,
  fetchNoahTransactionById,
  findNoahTransactionByExternalId,
  readEasnerPayoutIdFromRow,
  readNoahTransactionIdFromPendingRow,
} from "@/lib/reconciliation/noah-transaction-poll"
import {
  replayFailedEventInbox,
  replayStaleReceivedEventInbox,
} from "@/lib/webhooks/replay-event-inbox"

export type ReconcileStuckPayoutsOpts = {
  sinceDays?: number
  minAgeMinutes?: number
  dryRun?: boolean
  skipInbox?: boolean
  skipNoah?: boolean
  skipYc?: boolean
  skipFees?: boolean
  skipWalletSends?: boolean
}

export type ReconcileStuckPayoutsResult = {
  inbox: { failedReplayed: number; failedErrors: number; staleReplayed: number; staleErrors: number }
  noah: { scanned: number; patched: number }
  yc: {
    scanned: number
    replayed: number
    polled: number
    leg2Triggered: number
    feeRetried: number
    expiredPayIns: number
    stuckAwaitingPayIn: number
    stuckLeg2InProgress: number
    ycRefundExpected: number
  }
  fees: { scanned: number; captured: number }
  walletSends: { scanned: number; patched: number }
}

const WEBHOOK_PROVIDERS = ["noah", "yellowcard", "turnkey", "grid"] as const

function asMeta(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
}

function sinceIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

function pickSequenceIdsFromTransfer(row: Record<string, unknown>): string[] {
  const ids = [
    row.leg1_sequence_id,
    row.leg2_sequence_id,
    asMeta(row.metadata).yc_sequence_id,
  ]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
  return [...new Set(ids)]
}

async function countYcStuckHealth(
  admin: SupabaseClient,
  since: string,
): Promise<{
  stuckAwaitingPayIn: number
  stuckLeg2InProgress: number
  ycRefundExpected: number
}> {
  const { data: rows, error } = await admin
    .from("yc_transfers")
    .select("status, leg2_status, metadata")
    .gte("created_at", since)
    .limit(500)
  if (error) throw error

  let stuckAwaitingPayIn = 0
  let stuckLeg2InProgress = 0
  let ycRefundExpected = 0
  for (const row of rows ?? []) {
    const status = String(row.status ?? "")
    if (status === "awaiting_pay_in") stuckAwaitingPayIn += 1
    if (status === "leg2_in_progress" && String(row.leg2_status ?? "") === "pending_yc") {
      stuckLeg2InProgress += 1
    }
    const meta = asMeta(row.metadata)
    if (meta.yc_refund_expected === true && meta.yc_refund_tx_hash == null) {
      ycRefundExpected += 1
    }
  }
  return { stuckAwaitingPayIn, stuckLeg2InProgress, ycRefundExpected }
}

function payloadSequenceId(payload: Record<string, unknown>): string | null {
  if (typeof payload.sequenceId === "string" && payload.sequenceId.trim()) {
    return payload.sequenceId.trim()
  }
  if (typeof payload.sequence_id === "string" && payload.sequence_id.trim()) {
    return payload.sequence_id.trim()
  }
  return null
}

async function replayYellowcardInboxForSequenceIds(
  admin: SupabaseClient,
  sequenceIds: string[],
  since: string,
): Promise<{ replayed: number }> {
  if (!sequenceIds.length) return { replayed: 0 }

  const { data: rows, error } = await admin
    .from("event_inbox")
    .select("event_id, payload, status")
    .eq("provider", "yellowcard")
    .gte("received_at", since)
    .order("received_at", { ascending: false })
    .limit(500)

  if (error) throw error

  const wanted = new Set(sequenceIds)
  let replayed = 0
  for (const row of rows ?? []) {
    const payload = asMeta(row.payload)
    const seq = payloadSequenceId(payload)
    if (!seq || !wanted.has(seq)) continue
    await applyYellowcardWebhookSideEffects(admin, payload)
    replayed += 1
  }
  return { replayed }
}

async function retryYcTransferFeeSweep(
  admin: SupabaseClient,
  transfer: Record<string, unknown>,
): Promise<boolean> {
  const meta = asMeta(transfer.metadata)
  if (readPriorSweepFromMetadata(meta).captured) return false

  const mode = String(transfer.mode ?? "")
  const processingFee = Number(meta.processing_fee ?? 0)
  const marginAmount = Number(meta.margin_amount ?? 0)

  let sweepAmt = 0
  if (mode === "cross_border_send") {
    const omnibusIn = Number(transfer.omnibus_in_actual ?? 0)
    const leg2Crypto = Number(
      (transfer.settlement_info as { send?: { cryptoAmount?: number } } | null)?.send?.cryptoAmount ?? 0,
    )
    const residual = omnibusIn > 0 && leg2Crypto > 0 ? Math.max(0, omnibusIn - leg2Crypto) : 0
    sweepAmt = computeEasnerRevenueFeeWalletSweepAmount({
      marginAmount,
      processingFee,
      ledgerSurplus: residual,
    })
  } else if (mode === "fund_balance") {
    const cryptoAmount = Number(transfer.omnibus_in_actual ?? meta.usd_credit ?? 0)
    const creditAmt = Number(meta.usd_credit_applied ?? transfer.quoted_receive ?? 0)
    sweepAmt = computeEasnerRevenueFeeWalletSweepAmount({
      marginAmount,
      processingFee,
      ledgerSurplus: cryptoAmount > 0 && creditAmt > 0 ? Math.max(0, cryptoAmount - creditAmt) : undefined,
    })
  } else if (mode === "balance_payout") {
    const transactionId = String(transfer.transaction_id ?? "").trim()
    const userId = String(transfer.user_id ?? "")
    const businessId = transfer.business_id != null ? String(transfer.business_id) : null
    if (!transactionId || !userId) return false

    const captured = await captureYcBalancePayoutProcessingFeeIfPending(admin, {
      transactionId,
      userId,
      businessId,
    })
    if (!captured.captured) return false

    const { data: txRow } = await admin
      .from("transactions")
      .select("metadata")
      .eq("id", transactionId)
      .maybeSingle()
    const txMeta = asMeta(txRow?.metadata)
    const sweepAmt = Number(txMeta.fee_wallet_sweep ?? txMeta.easner_revenue_sweep_amount ?? 0)
    const feeWalletSweepTxHash = String(txMeta.fee_wallet_sweep_tx_hash ?? "").trim() || null

    await admin
      .from("yc_transfers")
      .update({
        fee_wallet_sweep: sweepAmt > 0 ? sweepAmt : null,
        metadata: {
          ...meta,
          margin_capture_mode: "fee_wallet_deferred",
          ...(feeWalletSweepTxHash ? { fee_wallet_sweep_tx_hash: feeWalletSweepTxHash } : {}),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", String(transfer.id))

    return true
  } else {
    return false
  }

  if (!Number.isFinite(sweepAmt) || sweepAmt < EASNER_REVENUE_FEE_WALLET_SWEEP_MIN) return false

  const sweep = await sweepEasnerRevenueFromDepositOmnibus({
    ledgerCurrency: "USD",
    amount: sweepAmt,
    logTag: `yc-${mode}-reconcile`,
  })

  if (!sweep.feeWalletSweepTxHash && !sweep.captured) return false

  await admin
    .from("yc_transfers")
    .update({
      fee_wallet_sweep: sweepAmt,
      metadata: {
        ...meta,
        ...buildEasnerRevenueSweepMetadataPatch({
          sweepAmt,
          feeWalletSweepTxHash: sweep.feeWalletSweepTxHash,
          captured: sweep.captured,
        }),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", String(transfer.id))

  return true
}

export async function reconcileStaleEventInbox(
  limitPerProvider: number,
  minAgeMinutes: number,
): Promise<ReconcileStuckPayoutsResult["inbox"]> {
  let failedReplayed = 0
  let failedErrors = 0
  let staleReplayed = 0
  let staleErrors = 0

  for (const provider of WEBHOOK_PROVIDERS) {
    const failed = await replayFailedEventInbox(provider, limitPerProvider)
    failedReplayed += failed.replayed
    failedErrors += failed.failed

    const stale = await replayStaleReceivedEventInbox(provider, limitPerProvider, minAgeMinutes)
    staleReplayed += stale.replayed
    staleErrors += stale.failed
  }

  return { failedReplayed, failedErrors, staleReplayed, staleErrors }
}

export async function reconcilePendingNoahGlobalPayouts(
  admin: SupabaseClient,
  since: string,
  dryRun: boolean,
): Promise<{ scanned: number; patched: number }> {
  const { data: rows, error } = await admin
    .from("transactions")
    .select("id, provider_transaction_id, metadata, status, user_id, business_id")
    .eq("provider", "noah")
    .eq("direction", "out")
    .in("status", ["pending", "processing"])
    .gte("created_at", since)
    .filter("metadata->>payout_type", "eq", "global_fiat")
    .limit(200)

  if (error) throw error

  let scanned = 0
  let patched = 0

  for (const row of rows ?? []) {
    scanned += 1
    const meta = asMeta(row.metadata)
    let txData =
      (await (async () => {
        const noahId = readNoahTransactionIdFromPendingRow({
          providerTransactionId: row.provider_transaction_id ? String(row.provider_transaction_id) : null,
          metadata: meta,
        })
        if (noahId) return fetchNoahTransactionById(noahId)

        const easnerPayoutId = readEasnerPayoutIdFromRow(meta)
        if (easnerPayoutId) return findNoahTransactionByExternalId(easnerPayoutId)
        return null
      })()) ?? null

    if (!txData) continue

    const noahStatus = String(txData.Status ?? "").toLowerCase()
    if (!noahStatus || noahStatus === "pending") continue

    if (dryRun) {
      patched += 1
      continue
    }

    await applyNoahWebhookSideEffects(admin, buildNoahTransactionWebhookEnvelope(txData))
    patched += 1
  }

  return { scanned, patched }
}

export async function reconcileStuckYcTransfers(
  admin: SupabaseClient,
  since: string,
  dryRun: boolean,
): Promise<{
  scanned: number
  replayed: number
  polled: number
  leg2Triggered: number
  feeRetried: number
  expiredPayIns: number
  stuckAwaitingPayIn: number
  stuckLeg2InProgress: number
  ycRefundExpected: number
}> {
  // Local TTL expiry + ledger fail — do not wait for amount-screen visits.
  const expiredPayIns = dryRun ? 0 : await expireStaleYcPayInTransfers(admin, { limit: 100 })

  const health = await countYcStuckHealth(admin, since)
  const { data: rows, error } = await admin
    .from("yc_transfers")
    .select("*")
    .gte("created_at", since)
    .limit(300)

  if (error) throw error

  const stuckRows = (rows ?? []).filter(
    (row) => !["completed", "failed", "expired"].includes(String(row.status ?? "")),
  )

  let replayed = 0
  let polled = 0
  let leg2Triggered = 0
  let feeRetried = 0

  for (const transfer of stuckRows) {
    const sequenceIds = pickSequenceIdsFromTransfer(transfer as Record<string, unknown>)
    if (dryRun) continue

    const replay = await replayYellowcardInboxForSequenceIds(admin, sequenceIds, since)
    replayed += replay.replayed

    const poll = await pollYellowcardTransferStatus(admin, transfer as Record<string, unknown>)
    polled += poll.polled

    const mode = String(transfer.mode ?? "")
    if (mode === "cross_border_send") {
      const leg1 = String(transfer.leg1_status ?? "")
      const leg2 = String(transfer.leg2_status ?? "")
      if (
        (leg1 === "complete" || leg1 === "settled") &&
        leg2 !== "complete" &&
        leg2 !== "depositing" &&
        leg2 !== "failed"
      ) {
        await maybeExecuteCrossBorderLeg2(admin, String(transfer.id))
        leg2Triggered += 1
      }
    }

    if (mode === "balance_payout" && transfer.transaction_id) {
      const { data: tx } = await admin
        .from("transactions")
        .select("id, status, user_id, business_id, metadata")
        .eq("id", String(transfer.transaction_id))
        .maybeSingle()
      if (tx?.id && String(tx.status) === "settled" && !isEasnerRevenueAlreadySwept(asMeta(tx.metadata))) {
        await captureYcBalancePayoutProcessingFeeIfPending(admin, {
          transactionId: String(tx.id),
          userId: String(tx.user_id),
          businessId: tx.business_id ? String(tx.business_id) : null,
        })
        feeRetried += 1
      }
    }
  }

  const { data: completedUnswept, error: unsweptErr } = await admin
    .from("yc_transfers")
    .select("*")
    .eq("status", "completed")
    .gte("updated_at", since)
    .limit(200)

  if (unsweptErr) throw unsweptErr

  for (const transfer of completedUnswept ?? []) {
    const meta = asMeta(transfer.metadata)
    if (readPriorSweepFromMetadata(meta).captured) continue
    const expectedSweep = Number(transfer.fee_wallet_sweep ?? 0)
    if (!(expectedSweep >= EASNER_REVENUE_FEE_WALLET_SWEEP_MIN)) continue
    if (dryRun) {
      feeRetried += 1
      continue
    }
    if (await retryYcTransferFeeSweep(admin, transfer as Record<string, unknown>)) {
      feeRetried += 1
    }
  }

  return {
    scanned: stuckRows.length,
    replayed,
    polled,
    leg2Triggered,
    feeRetried,
    expiredPayIns,
    ...health,
  }
}

export async function reconcilePendingFeeCaptures(
  admin: SupabaseClient,
  since: string,
  dryRun: boolean,
): Promise<{ scanned: number; captured: number }> {
  const { data: rows, error } = await admin
    .from("transactions")
    .select("id, status, metadata, user_id, business_id, amount, currency")
    .eq("status", "settled")
    .gte("settled_at", since)
    .filter("metadata->>processing_fee_pending", "eq", "true")
    .limit(300)

  if (error) throw error

  let scanned = 0
  let captured = 0

  for (const row of rows ?? []) {
    scanned += 1
    const meta = asMeta(row.metadata)
    if (isEasnerRevenueAlreadySwept(meta)) continue

    const userId = String(row.user_id ?? "")
    const businessId = row.business_id != null ? String(row.business_id) : null
    if (!userId) continue

    if (dryRun) {
      captured += 1
      continue
    }

    let result = { captured: false as boolean }

    if (meta.activity_type === "wallet_send") {
      result = await captureWalletSendFeeLegIfPending(admin, {
        transactionId: String(row.id),
        userId,
        businessId,
      })
    } else if (isYcBalancePayoutLedgerMeta(meta)) {
      result = await captureYcBalancePayoutProcessingFeeIfPending(admin, {
        transactionId: String(row.id),
        userId,
        businessId,
      })
    } else if (isNoahGlobalPayoutLedgerMeta(meta)) {
      result = await captureGlobalPayoutProcessingFeeIfPending(admin, {
        transactionId: String(row.id),
        userId,
        businessId,
      })
    } else if (meta.margin_capture_mode === "fee_wallet_omnibus") {
      const sweepAmt = computeSweepAmountFromMetadata(meta, { rowAmount: Number(row.amount ?? 0) })
      if (sweepAmt >= EASNER_REVENUE_FEE_WALLET_SWEEP_MIN) {
        const sweep = await sweepEasnerRevenueFromDepositOmnibus({
          ledgerCurrency: String(row.currency ?? "USD").toUpperCase() === "EUR" ? "EUR" : "USD",
          amount: sweepAmt,
          logTag: "reconcile-fee-capture",
        })
        if (sweep.captured || sweep.feeWalletSweepTxHash) {
          await admin
            .from("transactions")
            .update({
              metadata: {
                ...meta,
                ...buildEasnerRevenueSweepMetadataPatch({
                  sweepAmt,
                  feeWalletSweepTxHash: sweep.feeWalletSweepTxHash,
                  captured: sweep.captured,
                }),
              },
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id)
          result = { captured: true }
        }
      }
    }

    if (result.captured) captured += 1
  }

  return { scanned, captured }
}

export async function reconcilePendingWalletSends(
  admin: SupabaseClient,
  since: string,
  dryRun: boolean,
): Promise<{ scanned: number; patched: number }> {
  const { reconcileTurnkeySendStatus } = await import("@/lib/turnkey/send")

  const { data: rows, error } = await admin
    .from("transactions")
    .select(
      "id, provider, provider_transaction_id, status, tx_hash, metadata, user_id, business_id, amount, currency, direction, wallet_address, counterparty_address, asset, chain",
    )
    .eq("direction", "out")
    .eq("status", "pending")
    .gte("created_at", since)
    .limit(500)

  if (error) throw error

  let scanned = 0
  let patched = 0

  for (const row of rows ?? []) {
    const meta = asMeta(row.metadata)
    if (meta.activity_type !== "wallet_send") continue
    scanned += 1
    if (dryRun) continue

    const executionModel = String(meta.execution_model || "")
    const userId = String(row.user_id || "")
    const businessId = row.business_id != null ? String(row.business_id) : null

    try {
      if (executionModel === "direct_turnkey" && row.provider_transaction_id) {
        const subOrgId = String(meta.turnkey_sub_org_id || "").trim()
        if (!subOrgId) continue
        const priorStatus = String(row.status || "")
        const rec = await reconcileTurnkeySendStatus(admin, {
          subOrgId,
          providerTransactionId: String(row.provider_transaction_id),
        })
        if (rec.status !== priorStatus) patched += 1
        if (rec.status === "settled") {
          await captureWalletSendFeeLegIfPending(admin, {
            transactionId: String(row.id),
            userId,
            businessId,
          }).catch(() => undefined)
        }
        continue
      }

      if (
        executionModel === "relay_bridge" &&
        row.id
      ) {
        const relayRequestId = String(meta.relay_request_id ?? "").trim()
        if (relayRequestId) {
          const { reconcileRelayWalletSendByRequestId } = await import(
            "@/lib/wallet-send/settle-relay-wallet-send"
          )
          const rec = await reconcileRelayWalletSendByRequestId(admin, { relayRequestId })
          if (rec.patched) patched += 1
        }
      }
    } catch (e) {
      console.warn("[reconcile-stuck-payouts] wallet_send row_error", {
        id: row.id,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return { scanned, patched }
}

export async function reconcileStuckPayouts(
  admin: SupabaseClient,
  opts: ReconcileStuckPayoutsOpts = {},
): Promise<ReconcileStuckPayoutsResult> {
  const sinceDays = opts.sinceDays ?? 7
  const minAgeMinutes = opts.minAgeMinutes ?? 5
  const since = sinceIso(sinceDays)
  const dryRun = opts.dryRun === true

  const result: ReconcileStuckPayoutsResult = {
    inbox: { failedReplayed: 0, failedErrors: 0, staleReplayed: 0, staleErrors: 0 },
    noah: { scanned: 0, patched: 0 },
    yc: { scanned: 0, replayed: 0, polled: 0, leg2Triggered: 0, feeRetried: 0, expiredPayIns: 0, stuckAwaitingPayIn: 0, stuckLeg2InProgress: 0, ycRefundExpected: 0 },
    fees: { scanned: 0, captured: 0 },
    walletSends: { scanned: 0, patched: 0 },
  }

  if (!opts.skipInbox) {
    result.inbox = await reconcileStaleEventInbox(50, minAgeMinutes)
  }
  if (!opts.skipNoah) {
    result.noah = await reconcilePendingNoahGlobalPayouts(admin, since, dryRun)
  }
  if (!opts.skipYc) {
    result.yc = await reconcileStuckYcTransfers(admin, since, dryRun)
  }
  if (!opts.skipFees) {
    result.fees = await reconcilePendingFeeCaptures(admin, since, dryRun)
  }
  if (!opts.skipWalletSends) {
    result.walletSends = await reconcilePendingWalletSends(admin, since, dryRun)
  }

  return result
}
