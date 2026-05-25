import type { SupabaseClient } from "@supabase/supabase-js"
import { isNoahGlobalPayoutSellTx } from "@/lib/noah/global-payout-ledger"

export type GlobalPayoutWebhookTimestamps = {
  processingAt: string | null
  completedAt: string | null
}

const GLOBAL_PAYOUT_WEBHOOK_SCAN_LIMIT = 3000

function emptyTimestamps(): GlobalPayoutWebhookTimestamps {
  return { processingAt: null, completedAt: null }
}

function pickIso(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (c == null) continue
    const s = String(c).trim()
    if (s) return s
  }
  return null
}

function mergeGlobalPayoutDelivery(
  acc: GlobalPayoutWebhookTimestamps,
  envelope: Record<string, unknown>,
  tx: Record<string, unknown>,
  receivedAt: unknown,
): GlobalPayoutWebhookTimestamps {
  if (!isNoahGlobalPayoutSellTx(tx)) return acc
  if (String(tx.Network ?? "") !== "OffNetwork") return acc

  const status = String(tx.Status ?? "").toLowerCase()
  const created = pickIso(tx.Created)
  const occurred = pickIso(envelope.Occurred, tx.Created, receivedAt)

  if (status === "pending" && !acc.processingAt) {
    acc.processingAt = created ?? occurred
  }
  if (status === "settled") {
    acc.completedAt = occurred ?? created ?? pickIso(receivedAt)
  }

  return acc
}

function matchesEasnerPayoutId(tx: Record<string, unknown>, easnerPayoutId: string): boolean {
  const externalId = String(tx.ExternalID ?? tx.externalID ?? tx.ExternalId ?? "").trim()
  return externalId === easnerPayoutId
}

/**
 * Loads Noah Transaction webhooks for global payout OUT Pending/Settled timestamps.
 */
export async function fetchGlobalPayoutLifecycleFromWebhooks(
  admin: SupabaseClient,
  easnerPayoutId: string,
): Promise<GlobalPayoutWebhookTimestamps> {
  const key = String(easnerPayoutId || "").trim()
  if (!key) return emptyTimestamps()

  const { data, error } = await admin
    .from("event_inbox")
    .select("payload, received_at")
    .eq("provider", "noah")
    .eq("event_type", "Transaction")
    .order("received_at", { ascending: true })
    .limit(GLOBAL_PAYOUT_WEBHOOK_SCAN_LIMIT)

  if (error || !data) return emptyTimestamps()

  let acc = emptyTimestamps()
  for (const row of data) {
    const envelope = row.payload as Record<string, unknown> | undefined
    const tx = envelope?.Data as Record<string, unknown> | undefined
    if (!tx || !matchesEasnerPayoutId(tx, key)) continue
    acc = mergeGlobalPayoutDelivery(acc, envelope ?? {}, tx, row.received_at)
  }

  return acc
}
