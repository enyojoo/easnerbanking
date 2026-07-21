import { yellowcardFetch, YellowcardHttpError } from "@/lib/yellowcard/http"
import { classifyYellowcardWebhookEvent } from "@/lib/yellowcard/webhook-event-id"

export type YcPollLeg = "send" | "receive"

/** Map YC REST status to synthetic webhook event for idempotent replay. */
export function buildYellowcardPollWebhookEnvelope(
  leg: YcPollLeg,
  txData: Record<string, unknown>,
): Record<string, unknown> {
  const status = String(txData.status ?? txData.Status ?? "").trim().toLowerCase()
  const sequenceId = String(txData.sequenceId ?? txData.sequence_id ?? "").trim()
  const updatedAt = String(txData.updatedAt ?? txData.updated_at ?? new Date().toISOString())

  let event = leg === "send" ? "SEND.PROCESSING" : "RECEIVE.PROCESSING"
  if (status === "complete" || status === "completed" || status === "success") {
    event = leg === "send" ? "SEND.COMPLETE" : "RECEIVE.SETTLEMENT_COMPLETE"
  } else if (status === "failed" || status === "fail" || status === "cancelled" || status === "expired") {
    event = leg === "send" ? "SEND.FAILED" : "RECEIVE.FAILED"
  } else if (status === "pending" || status === "created") {
    event = leg === "send" ? "SEND.PENDING" : "RECEIVE.PENDING"
  }

  return {
    event,
    status,
    sequenceId,
    executedAt: updatedAt,
    ...txData,
  }
}

export function isYcPollTerminalStatus(status: string): boolean {
  const s = String(status || "").trim().toLowerCase()
  return (
    s === "complete" ||
    s === "completed" ||
    s === "success" ||
    s === "failed" ||
    s === "fail" ||
    s === "cancelled" ||
    s === "expired"
  )
}

export function isYcPollTerminalEnvelope(payload: Record<string, unknown>): boolean {
  const classified = classifyYellowcardWebhookEvent(
    String(payload.event ?? payload.status ?? ""),
  )
  return classified.isTerminalSuccess || classified.isTerminalFailure
}

async function fetchYcBySequenceId(
  leg: YcPollLeg,
  sequenceId: string,
): Promise<Record<string, unknown> | null> {
  const id = String(sequenceId || "").trim()
  if (!id) return null
  const paths =
    leg === "send"
      ? [`/send/sequence-id/${encodeURIComponent(id)}`, `/payments/sequence-id/${encodeURIComponent(id)}`]
      : [
          `/receive/sequence-id/${encodeURIComponent(id)}`,
          `/collections/sequence-id/${encodeURIComponent(id)}`,
        ]

  for (const path of paths) {
    try {
      return await yellowcardFetch<Record<string, unknown>>({ method: "GET", path })
    } catch (e) {
      if (e instanceof YellowcardHttpError && e.status === 404) continue
      throw e
    }
  }
  return null
}

export async function fetchYcSendBySequenceId(
  sequenceId: string,
): Promise<Record<string, unknown> | null> {
  return fetchYcBySequenceId("send", sequenceId)
}

export async function fetchYcReceiveBySequenceId(
  sequenceId: string,
): Promise<Record<string, unknown> | null> {
  return fetchYcBySequenceId("receive", sequenceId)
}

export function pickYcPollSequenceIds(
  transfer: Record<string, unknown>,
): Array<{ leg: YcPollLeg; sequenceId: string }> {
  const mode = String(transfer.mode ?? "")
  const out: Array<{ leg: YcPollLeg; sequenceId: string }> = []
  const leg1 = String(transfer.leg1_sequence_id ?? "").trim()
  const leg2 = String(transfer.leg2_sequence_id ?? "").trim()
  if (mode === "fund_balance" && leg1) out.push({ leg: "receive", sequenceId: leg1 })
  if (mode === "balance_payout" && leg2) out.push({ leg: "send", sequenceId: leg2 })
  if (mode === "cross_border_send") {
    const status = String(transfer.status ?? "")
    const leg2Status = String(transfer.leg2_status ?? "")
    if (leg1 && !["leg1_settled", "leg2_in_progress", "completed"].includes(status)) {
      out.push({ leg: "receive", sequenceId: leg1 })
    }
    if (leg2 && (status === "leg2_in_progress" || leg2Status === "pending_yc")) {
      out.push({ leg: "send", sequenceId: leg2 })
    }
  }
  return out
}

/** Poll YC REST for terminal status and replay through webhook side effects. */
export async function pollYellowcardTransferStatus(
  admin: import("@supabase/supabase-js").SupabaseClient,
  transfer: Record<string, unknown>,
): Promise<{ polled: number }> {
  const { applyYellowcardWebhookSideEffects } = await import("@/lib/yellowcard/webhook-processor")
  let polled = 0
  for (const { leg, sequenceId } of pickYcPollSequenceIds(transfer)) {
    const txData =
      leg === "send"
        ? await fetchYcSendBySequenceId(sequenceId)
        : await fetchYcReceiveBySequenceId(sequenceId)
    if (!txData) continue
    const ycStatus = String(txData.status ?? txData.Status ?? "").trim()
    if (!ycStatus || !isYcPollTerminalStatus(ycStatus)) continue
    const envelope = buildYellowcardPollWebhookEnvelope(leg, txData)
    if (!isYcPollTerminalEnvelope(envelope)) continue
    await applyYellowcardWebhookSideEffects(admin, envelope)
    polled += 1
  }
  return { polled }
}
