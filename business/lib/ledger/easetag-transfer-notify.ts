import type { SupabaseClient } from "@supabase/supabase-js"
import { dispatchTransactionNotification } from "@/lib/notifications/dispatch"
import { normalizeDirection } from "@/lib/ledger/transactions"

/**
 * Easetag P2P rows are inserted by SQL RPC – settlement notifications from the API after transfer.
 * Push + email via {@link dispatchTransactionNotification} (ledger email flag applies).
 */
export async function notifyEasetagTransferSettled(
  admin: SupabaseClient,
  input: {
    idempotent: boolean
    debitProviderTransactionId: string
    creditProviderTransactionId: string
  },
): Promise<void> {
  if (input.idempotent) return

  const sel = "id,user_id,provider,metadata,payload,amount,currency,direction,status"
  const [debitRes, creditRes] = await Promise.all([
    admin
      .from("transactions")
      .select(sel)
      .eq("provider", "easner_internal")
      .eq("provider_transaction_id", input.debitProviderTransactionId)
      .maybeSingle(),
    admin
      .from("transactions")
      .select(sel)
      .eq("provider", "easner_internal")
      .eq("provider_transaction_id", input.creditProviderTransactionId)
      .maybeSingle(),
  ])

  if (debitRes.error) throw debitRes.error
  if (creditRes.error) throw creditRes.error

  const rows = [debitRes.data, creditRes.data].filter(Boolean) as Record<string, unknown>[]

  for (const row of rows) {
    if (String(row.status ?? "").toLowerCase() !== "settled") continue
    const meta = row.metadata as Record<string, unknown> | null | undefined
    const id = String(row.id ?? "").trim()
    const uid = String(row.user_id ?? "").trim()
    if (!id || !uid) continue

    const etid =
      typeof meta?.easner_transaction_id === "string" ? meta.easner_transaction_id.trim() : undefined

    await dispatchTransactionNotification(admin, {
      userId: uid,
      transactionId: id,
      provider: String(row.provider ?? "easner_internal"),
      direction: normalizeDirection(String(row.direction ?? "")),
      amount: typeof row.amount === "number" ? row.amount : Number(row.amount) || 0,
      currency: String(row.currency ?? "USD"),
      metadata: meta ?? null,
      payload: (row.payload as Record<string, unknown> | null) ?? null,
      outcome: "success",
      easnerTransactionId: etid,
    }).catch((e) => console.warn("easetag settled notification (non-fatal):", e))
  }
}

export type EasetagDebitSnapshot = {
  transactionId: string
  provider: string
  direction: string
  amount: number
  currency: string
  metadata: Record<string, unknown>
  payload: Record<string, unknown> | null
  easnerTransactionId?: string
}

/** Fetch debit leg before ledger rollback deletes the row. */
export async function fetchEasetagDebitSnapshot(
  admin: SupabaseClient,
  transferGroupId: string,
): Promise<EasetagDebitSnapshot | null> {
  const debitPtid = `easetag_p2p:${transferGroupId}:debit`
  const { data: row } = await admin
    .from("transactions")
    .select("id,user_id,provider,metadata,payload,amount,currency,direction,status")
    .eq("provider", "easner_internal")
    .eq("provider_transaction_id", debitPtid)
    .maybeSingle()
  if (!row?.id) return null

  const meta = (row.metadata as Record<string, unknown> | undefined) ?? {}
  const etid =
    typeof meta.easner_transaction_id === "string" ? meta.easner_transaction_id.trim() : undefined

  return {
    transactionId: String(row.id),
    provider: String(row.provider ?? "easner_internal"),
    direction: normalizeDirection(String(row.direction ?? "")),
    amount: typeof row.amount === "number" ? row.amount : Number(row.amount) || 0,
    currency: String(row.currency ?? "USD"),
    metadata: meta,
    payload: (row.payload as Record<string, unknown> | null) ?? null,
    easnerTransactionId: etid,
  }
}

/** Easetag chain-settlement rollback – failed notice only (uses pre-rollback snapshot). */
export async function notifyEasetagTransferFailed(
  admin: SupabaseClient,
  input: { userId: string; snapshot: EasetagDebitSnapshot; failureReason: string },
): Promise<void> {
  await dispatchTransactionNotification(admin, {
    userId: input.userId,
    transactionId: input.snapshot.transactionId,
    provider: input.snapshot.provider,
    direction: input.snapshot.direction,
    amount: input.snapshot.amount,
    currency: input.snapshot.currency,
    metadata: input.snapshot.metadata,
    payload: input.snapshot.payload,
    outcome: "failed",
    failureReason: input.failureReason,
    easnerTransactionId: input.snapshot.easnerTransactionId,
  }).catch((e) => console.warn("easetag failed notification (non-fatal):", e))
}
