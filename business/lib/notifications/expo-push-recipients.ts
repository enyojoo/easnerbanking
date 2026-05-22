import type { SupabaseClient } from "@supabase/supabase-js"

type DeliveryRow = {
  expo_push_token: string
  status: string
}

export type PendingRecipient = { token: string }

function isDeliveryComplete(status: string): boolean {
  const s = status.toLowerCase()
  return s === "sent" || s === "queued"
}

/**
 * Returns device tokens that still need an Expo send for this transaction event.
 * Never aborts the whole batch when one token fails to insert a delivery row.
 */
export async function resolvePendingPushRecipients(
  admin: SupabaseClient,
  input: { userId: string; transactionId: string; eventType: string },
  tokens: string[],
): Promise<{ pending: PendingRecipient[]; tableMissing: boolean }> {
  const pending: PendingRecipient[] = []
  const nowIso = new Date().toISOString()

  const existingRes = await admin
    .from("push_notification_deliveries")
    .select("expo_push_token, status")
    .eq("user_id", input.userId)
    .eq("transaction_id", input.transactionId)
    .eq("event_type", input.eventType)

  if (existingRes.error?.code === "42P01") {
    return { pending: [], tableMissing: true }
  }

  const byToken = new Map<string, string>()
  for (const row of (existingRes.data ?? []) as DeliveryRow[]) {
    const token = String(row.expo_push_token ?? "").trim()
    if (token) byToken.set(token, String(row.status ?? ""))
  }

  for (const token of tokens) {
    const priorStatus = byToken.get(token)
    if (priorStatus && isDeliveryComplete(priorStatus)) continue

    const deliveryInsert = await admin
      .from("push_notification_deliveries")
      .insert({
        user_id: input.userId,
        transaction_id: input.transactionId,
        event_type: input.eventType,
        expo_push_token: token,
        provider: "expo",
        status: "queued",
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select("id")
      .maybeSingle()

    if (!deliveryInsert.error) {
      pending.push({ token })
      continue
    }

    if (deliveryInsert.error.code === "23505") {
      const retry = await admin
        .from("push_notification_deliveries")
        .select("expo_push_token, status")
        .eq("user_id", input.userId)
        .eq("transaction_id", input.transactionId)
        .eq("event_type", input.eventType)
        .eq("expo_push_token", token)
        .maybeSingle()

      const retryRow = retry.data as DeliveryRow | null
      if (retryRow && isDeliveryComplete(String(retryRow.status ?? ""))) continue

      console.warn(
        "[expo-push] delivery unique conflict without per-token row; sending to device anyway. " +
          "Apply scripts/fix-push-notification-deliveries-multi-device.sql",
        { userId: input.userId, transactionId: input.transactionId, tokenSuffix: token.slice(-8) },
      )
      pending.push({ token })
      continue
    }

    console.warn("[expo-push] delivery insert failed for device; skipping token", {
      userId: input.userId,
      transactionId: input.transactionId,
      code: deliveryInsert.error.code,
      message: deliveryInsert.error.message,
    })
  }

  return { pending, tableMissing: false }
}
