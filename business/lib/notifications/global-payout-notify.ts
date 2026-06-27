import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { normalizeDirection } from "@/lib/ledger/transactions"
import {
  findGlobalPayoutNoahRowByEasnerPayoutId,
} from "@/lib/noah/global-payout-ledger"
import { dispatchTransactionNotification } from "@/lib/notifications/dispatch"

/** Notify sender after global payout wallet debit was reversed (server-only). */
export async function notifyGlobalPayoutReversed(
  admin: SupabaseClient,
  easnerPayoutId: string,
): Promise<void> {
  const row = await findGlobalPayoutNoahRowByEasnerPayoutId(admin, easnerPayoutId)
  if (!row?.id) return

  const meta = row.metadata
  if (meta.balance_delta_reversed !== true) return

  const uid = String(row.user_id ?? "").trim()
  if (!uid) return

  await dispatchTransactionNotification(admin, {
    userId: uid,
    transactionId: row.id,
    provider: String(row.provider ?? "noah"),
    direction: normalizeDirection(String(row.direction ?? "out")),
    amount: typeof row.amount === "number" ? row.amount : Number(row.amount) || 0,
    currency: String(row.currency ?? "USD"),
    metadata: meta,
    payload: (row.payload as Record<string, unknown> | null) ?? null,
    outcome: "reversed",
    failureReason: "Payout failed — funds returned to your balance",
  }).catch((e) => console.warn("payout reversal notification (non-fatal):", e))
}
