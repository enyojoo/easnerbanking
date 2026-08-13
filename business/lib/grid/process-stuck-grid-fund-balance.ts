import type { SupabaseClient } from "@supabase/supabase-js"
import { GridHttpError } from "./http"
import { retrieveGridQuote } from "./quote-funding"
import { creditGridFundBalanceFromWebhook } from "./fund-balance-credit"
import { handleGridCrossBorderSendWebhook } from "./webhook-processor"
import type { GridWebhookEvent } from "./types"

export type StuckGridFundBalanceRow = {
  id: string
  transaction_id: string | null
  mode: string
  status: string
  grid_quote_id: string | null
  grid_transaction_id: string | null
  expires_at: string | null
}

const STUCK_STATUSES = ["pending", "awaiting_pay_in", "processing"]

function quoteLooksCompleted(status: string | undefined): boolean {
  const s = String(status ?? "").toUpperCase()
  return s.includes("COMPLETED") || s.includes("SETTLED") || s === "EXECUTED"
}

function quoteLooksFailed(status: string | undefined): boolean {
  const s = String(status ?? "").toUpperCase()
  return s.includes("FAILED") || s.includes("EXPIRED") || s.includes("CANCELLED") || s.includes("CANCELED")
}

export async function listStuckGridFundBalanceTransfers(
  admin: SupabaseClient,
  opts: { limit?: number; olderThanMs?: number } = {},
): Promise<StuckGridFundBalanceRow[]> {
  const limit = Math.max(1, Math.min(100, opts.limit ?? 25))
  const olderThanMs = opts.olderThanMs ?? 15 * 60_000
  const cutoff = new Date(Date.now() - olderThanMs).toISOString()

  const { data: rows } = await admin
    .from("grid_transfers")
    .select("id,transaction_id,mode,status,grid_quote_id,grid_transaction_id,expires_at")
    .in("mode", ["fund_balance", "cross_border_send"])
    .in("status", STUCK_STATUSES)
    .lt("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(limit)

  return (rows ?? []).map((row) => ({
    id: String(row.id),
    transaction_id: row.transaction_id != null ? String(row.transaction_id) : null,
    mode: String(row.mode ?? ""),
    status: String(row.status ?? ""),
    grid_quote_id: row.grid_quote_id != null ? String(row.grid_quote_id) : null,
    grid_transaction_id: row.grid_transaction_id != null ? String(row.grid_transaction_id) : null,
    expires_at: row.expires_at != null ? String(row.expires_at) : null,
  }))
}

async function markTransferFailed(admin: SupabaseClient, row: StuckGridFundBalanceRow, _reason: string) {
  const now = new Date().toISOString()
  await admin
    .from("grid_transfers")
    .update({ status: "failed", updated_at: now })
    .eq("id", row.id)
  if (!row.transaction_id) return
  await admin
    .from("transactions")
    .update({
      status: "failed",
      updated_at: now,
    })
    .eq("id", row.transaction_id)
}

export async function processStuckGridFundBalanceTransfers(
  admin: SupabaseClient,
  opts: { limit?: number; olderThanMs?: number } = {},
): Promise<{ processed: number; completed: number; failed: number }> {
  const jobs = await listStuckGridFundBalanceTransfers(admin, opts)
  let processed = 0
  let completed = 0
  let failed = 0

  for (const row of jobs) {
    processed += 1
    const quoteId = String(row.grid_quote_id ?? "").trim()
    if (row.expires_at && Date.parse(row.expires_at) < Date.now()) {
      await markTransferFailed(admin, row, "quote_expired")
      failed += 1
      continue
    }
    if (!quoteId) {
      await markTransferFailed(admin, row, "missing_quote_id")
      failed += 1
      continue
    }

    try {
      const quote = await retrieveGridQuote(quoteId)
      const status = String(quote.status ?? "")
      if (quoteLooksFailed(status) || (quote.expiresAt && Date.parse(quote.expiresAt) < Date.now() && !quoteLooksCompleted(status))) {
        await markTransferFailed(admin, row, status || "quote_expired")
        failed += 1
        continue
      }
      if (!quoteLooksCompleted(status)) continue

      if (row.mode === "fund_balance" && row.transaction_id) {
        await creditGridFundBalanceFromWebhook(admin, {
          transferId: row.id,
          transactionId: row.transaction_id,
        })
        completed += 1
        continue
      }

      if (row.mode === "cross_border_send") {
        const event: GridWebhookEvent = {
          eventType: "OUTGOING_PAYMENT.COMPLETED",
          data: {
            id: row.grid_transaction_id ?? quote.transactionId ?? quote.id,
            status: "COMPLETED",
            quoteId,
          },
        }
        await handleGridCrossBorderSendWebhook(admin, {
          event,
          quoteId,
          transactionId: String(quote.transactionId ?? row.grid_transaction_id ?? ""),
          status: "COMPLETED",
        })
        completed += 1
      }
    } catch (e) {
      if (e instanceof GridHttpError && (e.status === 404 || e.status === 410)) {
        await markTransferFailed(admin, row, "quote_not_found")
        failed += 1
        continue
      }
      failed += 1
    }
  }

  return { processed, completed, failed }
}
