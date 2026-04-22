import { parseCommunicationPreferences } from "@easner/shared"
import type { SupabaseClient } from "@supabase/supabase-js"

type ExpoPushMessage = {
  to: string
  title: string
  body: string
  data?: Record<string, unknown>
  sound?: "default" | null
  priority?: "default" | "normal" | "high"
}

type ExpoPushTicket =
  | { status: "ok"; id: string }
  | { status: "error"; message: string; details?: Record<string, unknown> }

async function postExpoPush(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Expo push HTTP ${res.status}: ${text || res.statusText}`)
  }

  const json = (await res.json()) as unknown
  const data = (json as any)?.data
  if (!Array.isArray(data)) {
    throw new Error("Expo push response missing data[]")
  }
  return data as ExpoPushTicket[]
}

export type SendTransactionSettledPushInput = {
  userId: string
  transactionId: string
  title: string
  body: string
  data: Record<string, unknown>
}

export type SendTransactionSettledPushResult =
  | { skipped: true; reason: "no_token" | "push_disabled" | "already_sent" }
  | { skipped: false; status: "sent"; ticketId?: string }
  | { skipped: false; status: "failed"; error: string }

/**
 * Sends a single Expo push for a settled transaction.
 *
 * Idempotency is enforced via `public.push_notification_deliveries` unique constraint.
 * Preference/token gating uses `public.user_preferences`.
 */
export async function sendTransactionSettledPush(
  admin: SupabaseClient,
  input: SendTransactionSettledPushInput,
): Promise<SendTransactionSettledPushResult> {
  const pref = await admin
    .from("user_preferences")
    .select("expo_push_token, communication_preferences")
    .eq("user_id", input.userId)
    .maybeSingle()

  // If the table/columns aren't present yet, fail closed (skip) rather than throwing in a hot path.
  if (pref.error) {
    if (pref.error.code === "42P01" || pref.error.code === "42703") {
      return { skipped: true, reason: "no_token" }
    }
    return { skipped: false, status: "failed", error: pref.error.message }
  }

  const token = (pref.data as any)?.expo_push_token as string | null | undefined
  if (!token) return { skipped: true, reason: "no_token" }

  const commRaw = (pref.data as any)?.communication_preferences
  const comm = parseCommunicationPreferences(commRaw)
  if (!comm.channels.push) return { skipped: true, reason: "push_disabled" }

  const eventType = "transaction_settled"
  const nowIso = new Date().toISOString()

  const deliveryInsert = await admin
    .from("push_notification_deliveries")
    .insert({
      user_id: input.userId,
      transaction_id: input.transactionId,
      event_type: eventType,
      provider: "expo",
      status: "queued",
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("id")
    .maybeSingle()

  if (deliveryInsert.error) {
    // unique_violation => already sent/queued
    if (deliveryInsert.error.code === "23505") {
      return { skipped: true, reason: "already_sent" }
    }
    if (deliveryInsert.error.code === "42P01") {
      return { skipped: false, status: "failed", error: "push_notification_deliveries table missing" }
    }
    return { skipped: false, status: "failed", error: deliveryInsert.error.message }
  }

  try {
    const [ticket] = await postExpoPush([
      {
        to: token,
        title: input.title,
        body: input.body,
        data: input.data,
        sound: "default",
        priority: "high",
      },
    ])

    if (!ticket) throw new Error("Expo push returned no ticket")

    if (ticket.status === "ok") {
      await admin
        .from("push_notification_deliveries")
        .update({
          provider_ticket_id: ticket.id,
          status: "sent",
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", input.userId)
        .eq("transaction_id", input.transactionId)
        .eq("event_type", eventType)

      return { skipped: false, status: "sent", ticketId: ticket.id }
    }

    const details = ticket.details ?? {}
    const errorMessage = ticket.message || "Expo push error"

    // Permanent failure: clear token to avoid repeated failures.
    if ((details as any)?.error === "DeviceNotRegistered") {
      await admin
        .from("user_preferences")
        .update({
          expo_push_token: null,
          expo_push_token_updated_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", input.userId)
    }

    await admin
      .from("push_notification_deliveries")
      .update({
        status: "failed",
        error: JSON.stringify({ message: errorMessage, details }),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", input.userId)
      .eq("transaction_id", input.transactionId)
      .eq("event_type", eventType)

    return { skipped: false, status: "failed", error: errorMessage }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await admin
      .from("push_notification_deliveries")
      .update({
        status: "failed",
        error: msg,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", input.userId)
      .eq("transaction_id", input.transactionId)
      .eq("event_type", eventType)

    return { skipped: false, status: "failed", error: msg }
  }
}

