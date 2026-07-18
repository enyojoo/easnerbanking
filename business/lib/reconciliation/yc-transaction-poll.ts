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
  } else if (status === "failed" || status === "fail" || status === "cancelled") {
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
    s === "cancelled"
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
