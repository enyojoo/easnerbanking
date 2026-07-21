import type { SupabaseClient } from "@supabase/supabase-js"
import {
  isYcPayInFlowMetadata,
  isYcPayInPaymentWindowOpen,
  readYcPayInExpiresAt,
} from "@easner/shared"
import { pollYellowcardTransferStatus } from "@/lib/reconciliation/yc-transaction-poll"

export const YC_EXPIRED_PAY_IN_RECONCILE_POLLED_AT = "yc_expired_reconcile_polled_at"

function isOpenYcPayInLedgerStatus(status: string): boolean {
  const st = String(status ?? "").trim().toLowerCase()
  return st === "pending" || st === "processing" || st === "unknown"
}

export function shouldReconcileExpiredYcPayInOnDetail(
  metadata: Record<string, unknown>,
  ledgerStatus: string,
  nowMs: number = Date.now(),
): boolean {
  if (!isYcPayInFlowMetadata(metadata)) return false
  if (!isOpenYcPayInLedgerStatus(ledgerStatus)) return false
  if (!readYcPayInExpiresAt(metadata)) return false
  if (isYcPayInPaymentWindowOpen(metadata, nowMs)) return false
  if (metadata[YC_EXPIRED_PAY_IN_RECONCILE_POLLED_AT]) return false
  return true
}

async function fetchYcTransferForPayIn(
  admin: SupabaseClient,
  metadata: Record<string, unknown>,
  transactionLedgerId: string,
): Promise<Record<string, unknown> | null> {
  const transferId = String(metadata.yc_transfer_id ?? "").trim()
  if (transferId) {
    const { data } = await admin.from("yc_transfers").select("*").eq("id", transferId).maybeSingle()
    return (data as Record<string, unknown> | null) ?? null
  }

  const { data } = await admin
    .from("yc_transfers")
    .select("*")
    .eq("transaction_id", transactionLedgerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  return (data as Record<string, unknown> | null) ?? null
}

/** Fail a pending/processing ledger row when the linked YC pay-in session expired. */
export async function failLedgerForExpiredYcPayInTransfer(
  admin: SupabaseClient,
  transfer: Record<string, unknown>,
): Promise<boolean> {
  const transactionId = transfer.transaction_id != null ? String(transfer.transaction_id).trim() : ""
  if (!transactionId) return false

  const { data: tx } = await admin
    .from("transactions")
    .select("status")
    .eq("id", transactionId)
    .maybeSingle()
  if (!isOpenYcPayInLedgerStatus(String(tx?.status ?? ""))) return false

  const sequenceId = String(transfer.leg1_sequence_id ?? "").trim()
  if (!sequenceId) return false

  const now = new Date().toISOString()
  const { applyYellowcardWebhookSideEffects } = await import("@/lib/yellowcard/webhook-processor")
  await applyYellowcardWebhookSideEffects(admin, {
    event: "RECEIVE.FAILED",
    status: "expired",
    sequenceId,
    executedAt: now,
  })
  return true
}

async function markExpiredPayInReconcileAttempted(
  admin: SupabaseClient,
  transactionLedgerId: string,
  priorMetadata: Record<string, unknown>,
  nowIso: string,
): Promise<void> {
  const { data: row } = await admin
    .from("transactions")
    .select("metadata")
    .eq("id", transactionLedgerId)
    .maybeSingle()

  const current = (row?.metadata ?? priorMetadata) as Record<string, unknown>
  if (current[YC_EXPIRED_PAY_IN_RECONCILE_POLLED_AT]) return

  await admin
    .from("transactions")
    .update({
      metadata: {
        ...current,
        [YC_EXPIRED_PAY_IN_RECONCILE_POLLED_AT]: nowIso,
      },
    })
    .eq("id", transactionLedgerId)
}

/**
 * One-shot reconcile when the deposit window has closed but the ledger is still open.
 * Replays terminal YC status through webhook side effects (e.g. RECEIVE.FAILED).
 */
export async function reconcileExpiredYcPayInOnDetail(
  admin: SupabaseClient,
  input: {
    transactionLedgerId: string
    metadata: Record<string, unknown>
    ledgerStatus: string
    nowMs?: number
  },
): Promise<{ attempted: boolean; polled: boolean; statusChanged: boolean }> {
  const nowMs = input.nowMs ?? Date.now()
  const nowIso = new Date(nowMs).toISOString()

  if (!shouldReconcileExpiredYcPayInOnDetail(input.metadata, input.ledgerStatus, nowMs)) {
    return { attempted: false, polled: false, statusChanged: false }
  }

  const priorStatus = String(input.ledgerStatus ?? "").trim().toLowerCase()
  const transfer = await fetchYcTransferForPayIn(admin, input.metadata, input.transactionLedgerId)

  let polled = 0
  if (transfer) {
    const transferStatus = String(transfer.status ?? "").trim().toLowerCase()
    if (transferStatus === "expired") {
      try {
        await failLedgerForExpiredYcPayInTransfer(admin, transfer)
      } catch (e) {
        console.warn("[yc-pay-in] expired ledger fail failed", {
          transactionId: input.transactionLedgerId,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    } else {
      try {
        const result = await pollYellowcardTransferStatus(admin, transfer)
        polled = result.polled
      } catch (e) {
        console.warn("[yc-pay-in] expired detail reconcile poll failed", {
          transactionId: input.transactionLedgerId,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }
  }

  await markExpiredPayInReconcileAttempted(admin, input.transactionLedgerId, input.metadata, nowIso)

  const { data: row } = await admin
    .from("transactions")
    .select("status")
    .eq("id", input.transactionLedgerId)
    .maybeSingle()

  const nextStatus = String(row?.status ?? priorStatus).trim().toLowerCase()
  return {
    attempted: true,
    polled: polled > 0,
    statusChanged: nextStatus !== priorStatus,
  }
}
