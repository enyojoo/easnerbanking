"use client"

import { fetchWithSession } from "@/lib/fetch-with-session"

export type ReserveEasnerTransactionIdResult =
  | { ok: true; easner_transaction_id: string }
  | { ok: false; error: string }

/** Server-issued ETID hold (see `reserve_easner_transaction_id`); matches persisted debit leg when Easetag ledger P2P completes. */
export async function fetchReserveEasnerTransactionId(): Promise<ReserveEasnerTransactionIdResult> {
  const res = await fetchWithSession("/api/transactions/reserve-etid", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  })
  const data = (await res.json().catch(() => ({}))) as { easner_transaction_id?: string; error?: string }
  if (!res.ok) {
    return { ok: false, error: typeof data.error === "string" ? data.error : "reserve_failed" }
  }
  const id = typeof data.easner_transaction_id === "string" ? data.easner_transaction_id.trim() : ""
  if (!id) return { ok: false, error: "missing_easner_transaction_id" }
  return { ok: true, easner_transaction_id: id }
}
