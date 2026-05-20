import type { SupabaseClient } from "@supabase/supabase-js"
import { formatDisplayPersonName } from "@easner/shared"

export type FiatDepositWebhookTimestamps = {
  processingAt: string | null
  completedAt: string | null
  senderName: string | null
  paymentMethodType: string | null
  paymentReference: string | null
}

const FIAT_DEPOSIT_WEBHOOK_SCAN_LIMIT = 3000

function emptyTimestamps(): FiatDepositWebhookTimestamps {
  return {
    processingAt: null,
    completedAt: null,
    senderName: null,
    paymentMethodType: null,
    paymentReference: null,
  }
}

function pickIso(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (c == null) continue
    const s = String(c).trim()
    if (s) return s
  }
  return null
}

function mergeFiatDepositDelivery(
  acc: FiatDepositWebhookTimestamps,
  envelope: Record<string, unknown>,
  data: Record<string, unknown>,
  receivedAt: unknown,
): FiatDepositWebhookTimestamps {
  const status = String(data.Status ?? "").toLowerCase()
  const created = pickIso(data.Created)
  const occurred = pickIso(envelope.Occurred, data.Created, receivedAt)

  const sender = data.Sender as Record<string, unknown> | undefined
  if (sender?.FullName != null && String(sender.FullName).trim()) {
    acc.senderName = formatDisplayPersonName(String(sender.FullName))
  }
  if (data.PaymentMethodType != null && String(data.PaymentMethodType).trim()) {
    acc.paymentMethodType = String(data.PaymentMethodType).trim()
  }
  const ref = data.Reference ?? data.Description
  if (ref != null && String(ref).trim()) {
    acc.paymentReference = String(ref).trim()
  }

  if (status === "pending" && !acc.processingAt) {
    acc.processingAt = created ?? occurred
  }
  if (status === "settled") {
    acc.completedAt = occurred ?? created ?? pickIso(receivedAt)
  }

  return acc
}

/**
 * Loads FiatDeposit webhooks and matches `Data.ID` in memory (PostgREST JSON filters are unreliable).
 */
export async function fetchFiatDepositWebhooksByDepositIds(
  admin: SupabaseClient,
  depositIds: string[],
): Promise<Map<string, FiatDepositWebhookTimestamps>> {
  const wanted = new Set(
    depositIds.map((id) => String(id || "").trim()).filter(Boolean),
  )
  const result = new Map<string, FiatDepositWebhookTimestamps>()
  if (wanted.size === 0) return result

  const { data, error } = await admin
    .from("event_inbox")
    .select("payload, received_at")
    .eq("provider", "noah")
    .eq("event_type", "FiatDeposit")
    .order("received_at", { ascending: true })
    .limit(FIAT_DEPOSIT_WEBHOOK_SCAN_LIMIT)

  if (error || !data) return result

  for (const row of data) {
    const envelope = row.payload as Record<string, unknown> | undefined
    const d = envelope?.Data as Record<string, unknown> | undefined
    if (!d) continue
    const depositId = String(d.ID ?? "").trim()
    if (!wanted.has(depositId)) continue

    const prev = result.get(depositId) ?? emptyTimestamps()
    result.set(
      depositId,
      mergeFiatDepositDelivery(prev, envelope ?? {}, d, row.received_at),
    )
  }

  return result
}

/**
 * FiatDeposit webhooks carry earlier processing time than the Transaction webhook row.
 */
export async function fetchFiatDepositLifecycleFromWebhooks(
  admin: SupabaseClient,
  fiatDepositId: string,
): Promise<FiatDepositWebhookTimestamps> {
  const depositId = String(fiatDepositId || "").trim()
  if (!depositId) return emptyTimestamps()
  const map = await fetchFiatDepositWebhooksByDepositIds(admin, [depositId])
  return map.get(depositId) ?? emptyTimestamps()
}
