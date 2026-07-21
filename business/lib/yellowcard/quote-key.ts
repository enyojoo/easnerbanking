import type { SupabaseClient } from "@supabase/supabase-js"
import { failLedgerForExpiredYcPayInTransfer } from "./reconcile-expired-yc-pay-in"

export type YcTransferMode = "fund_balance" | "cross_border_send" | "balance_payout"

const ACTIVE_TRANSFER_STATUSES = ["awaiting_pay_in", "pending_authorize"] as const

function stablePart(value: string | number | null | undefined): string {
  if (value == null) return ""
  return String(value).trim()
}

/** Deterministic key for idempotent confirm — same inputs reuse the same active transfer. */
export function buildYcQuoteKey(parts: Record<string, string | number | null | undefined>): string {
  return Object.keys(parts)
    .sort()
    .map((key) => `${key}=${stablePart(parts[key])}`)
    .join("&")
}

export async function findReusableYcTransfer(
  admin: SupabaseClient,
  input: {
    userId: string
    mode: YcTransferMode
    quoteKey: string
  },
): Promise<Record<string, unknown> | null> {
  const now = Date.now()
  const { data: rows } = await admin
    .from("yc_transfers")
    .select("*")
    .eq("user_id", input.userId)
    .eq("mode", input.mode)
    .in("status", [...ACTIVE_TRANSFER_STATUSES])
    .contains("metadata", { quote_key: input.quoteKey })
    .order("created_at", { ascending: false })
    .limit(5)

  for (const row of rows ?? []) {
    const expiresAt = row.expires_at != null ? new Date(String(row.expires_at)).getTime() : null
    if (expiresAt != null && expiresAt <= now) continue
    return row as Record<string, unknown>
  }
  return null
}

/** Marks expired pay-in sessions so re-confirm can create a fresh order. */
export async function expireStaleYcPayInTransfers(
  admin: SupabaseClient,
  opts?: { userId?: string; limit?: number },
): Promise<number> {
  const now = new Date().toISOString()
  let query = admin
    .from("yc_transfers")
    .select("id, transaction_id, mode, leg1_sequence_id, status")
    .in("status", ["awaiting_pay_in", "pending_authorize"])
    .lt("expires_at", now)
    .limit(opts?.limit ?? 50)

  if (opts?.userId) {
    query = query.eq("user_id", opts.userId)
  }

  const { data: rows } = await query
  if (!rows?.length) return 0

  const ids = rows.map((r) => String(r.id))
  const { error } = await admin
    .from("yc_transfers")
    .update({ status: "expired", updated_at: now })
    .in("id", ids)

  if (error) return 0

  for (const row of rows) {
    if (!row.transaction_id) continue
    try {
      await failLedgerForExpiredYcPayInTransfer(admin, {
        ...row,
        status: "expired",
      } as Record<string, unknown>)
    } catch (e) {
      console.warn("[yc-pay-in] failed to sync ledger for expired transfer", {
        transferId: row.id,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return ids.length
}
