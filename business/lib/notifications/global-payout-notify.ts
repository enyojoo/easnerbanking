import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { normalizeDirection } from "@/lib/ledger/transactions"
import { findGlobalPayoutNoahRowByEasnerPayoutId } from "@/lib/noah/global-payout-ledger"
import { dispatchTransactionNotification } from "@/lib/notifications/dispatch"

/** Notify sender when a global payout row moves to failed (Noah webhook or execute-time failure). */
export async function notifyGlobalPayoutFailed(
  admin: SupabaseClient,
  easnerPayoutId: string,
  failureReason?: string,
): Promise<void> {
  const row = await findGlobalPayoutNoahRowByEasnerPayoutId(admin, easnerPayoutId)
  if (!row?.id) return

  const uid = String(row.user_id ?? "").trim()
  if (!uid) return

  const meta = row.metadata
  const reason =
    failureReason?.trim() ||
    (typeof meta.failure_reason === "string" ? meta.failure_reason.trim() : undefined)

  await dispatchTransactionNotification(admin, {
    userId: uid,
    transactionId: row.id,
    provider: String(row.provider ?? "noah"),
    direction: normalizeDirection(String(row.direction ?? "out")),
    amount: typeof row.amount === "number" ? row.amount : Number(row.amount) || 0,
    currency: String(row.currency ?? "USD"),
    metadata: meta,
    payload: (row.payload as Record<string, unknown> | null) ?? null,
    outcome: "failed",
    failureReason: reason,
  }).catch((e) => console.warn("payout failed notification (non-fatal):", e))
}
