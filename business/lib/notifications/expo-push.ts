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
 * Sends Expo push for a settled transaction to every registered device token.
 *
 * Idempotency: `push_notification_deliveries` is unique per (user, transaction, event, expo_push_token).
 * Preference gating uses `user_preferences.communication_preferences`; tokens come from `user_push_devices`.
 */
export async function sendTransactionSettledPush(
  admin: SupabaseClient,
  input: SendTransactionSettledPushInput,
): Promise<SendTransactionSettledPushResult> {
  const pref = await admin
    .from("user_preferences")
    .select("communication_preferences")
    .eq("user_id", input.userId)
    .maybeSingle()

  if (pref.error) {
    if (pref.error.code === "42P01" || pref.error.code === "42703") {
      return { skipped: true, reason: "no_token" }
    }
    return { skipped: false, status: "failed", error: pref.error.message }
  }

  const commRaw = (pref.data as { communication_preferences?: unknown } | null)?.communication_preferences
  const comm = parseCommunicationPreferences(commRaw)
  if (!comm.channels.push) return { skipped: true, reason: "push_disabled" }

  const devicesRes = await admin
    .from("user_push_devices")
    .select("expo_push_token")
    .eq("user_id", input.userId)

  let tokens: string[] = []
  if (!devicesRes.error && Array.isArray(devicesRes.data)) {
    tokens = [
      ...new Set(
        devicesRes.data
          .map((r: { expo_push_token?: string }) => String(r.expo_push_token ?? "").trim())
          .filter(Boolean),
      ),
    ]
  }

  if (tokens.length === 0) return { skipped: true, reason: "no_token" }

  const eventType = "transaction_settled"
  const nowIso = new Date().toISOString()

  type Pending = { token: string }
  const pending: Pending[] = []

  for (const token of tokens) {
    const deliveryInsert = await admin
      .from("push_notification_deliveries")
      .insert({
        user_id: input.userId,
        transaction_id: input.transactionId,
        event_type: eventType,
        expo_push_token: token,
        provider: "expo",
        status: "queued",
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select("id")
      .maybeSingle()

    if (deliveryInsert.error?.code === "23505") continue
    if (deliveryInsert.error?.code === "42P01") {
      return { skipped: false, status: "failed", error: "push_notification_deliveries table missing" }
    }
    if (deliveryInsert.error) {
      return { skipped: false, status: "failed", error: deliveryInsert.error.message }
    }
    pending.push({ token })
  }

  if (pending.length === 0) return { skipped: true, reason: "already_sent" }

  const messages: ExpoPushMessage[] = pending.map((p) => ({
    to: p.token,
    title: input.title,
    body: input.body,
    data: input.data,
    sound: "default",
    priority: "high",
  }))

  try {
    const tickets = await postExpoPush(messages)
    let firstTicketId: string | undefined

    for (let i = 0; i < pending.length; i++) {
      const p = pending[i]
      const ticket = tickets[i]
      if (!p || !ticket) continue

      if (ticket.status === "ok") {
        if (!firstTicketId) firstTicketId = ticket.id
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
          .eq("expo_push_token", p.token)
      } else {
        const details = ticket.details ?? {}
        const errorMessage = ticket.message || "Expo push error"

        if ((details as any)?.error === "DeviceNotRegistered") {
          await admin.from("user_push_devices").delete().eq("user_id", input.userId).eq("expo_push_token", p.token)
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
          .eq("expo_push_token", p.token)
      }
    }

    return { skipped: false, status: "sent", ticketId: firstTicketId }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    for (const p of pending) {
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
        .eq("expo_push_token", p.token)
    }
    return { skipped: false, status: "failed", error: msg }
  }
}
