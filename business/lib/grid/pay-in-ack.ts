import type { SupabaseClient } from "@supabase/supabase-js"

export class GridPayInAckError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

function normalizeEtid(value: string | undefined | null): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
}

async function loadTransactionByEtid(
  admin: SupabaseClient,
  easnerTransactionId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await admin
    .from("transactions")
    .select("*")
    .eq("easner_transaction_id", easnerTransactionId)
    .maybeSingle()
  if (error) throw new GridPayInAckError("transaction_lookup_failed", error.message)
  return (data as Record<string, unknown> | null) ?? null
}

async function loadTransactionById(
  admin: SupabaseClient,
  id: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await admin.from("transactions").select("*").eq("id", id).maybeSingle()
  if (error) throw new GridPayInAckError("transaction_lookup_failed", error.message)
  return (data as Record<string, unknown> | null) ?? null
}

function assertOwnership(input: {
  row: Record<string, unknown>
  userId: string
  businessId: string | null
}): void {
  const rowUserId = String(input.row.user_id ?? "")
  const rowBusinessId =
    input.row.business_id != null ? String(input.row.business_id) : null
  if (input.businessId) {
    if (rowBusinessId !== input.businessId) {
      throw new GridPayInAckError("forbidden", "Not authorized for this transfer")
    }
    return
  }
  if (rowUserId !== input.userId || rowBusinessId != null) {
    throw new GridPayInAckError("forbidden", "Not authorized for this transfer")
  }
}

function isGridPayInTransaction(row: Record<string, unknown>): boolean {
  if (String(row.provider ?? "").trim().toLowerCase() === "grid") return true
  const meta = (row.metadata ?? {}) as Record<string, unknown>
  return String(meta.pay_in_provider ?? "").trim().toLowerCase() === "grid"
}

/** Record that the user indicated they sent the local Grid pay-in transfer. Idempotent. */
export async function ackGridPayIn(input: {
  admin: SupabaseClient
  userId: string
  businessId: string | null
  easnerTransactionId?: string
  transactionId?: string
}): Promise<{ attestedAt: string; alreadyAttested: boolean }> {
  const etid = normalizeEtid(input.easnerTransactionId ?? input.transactionId)
  const rawId = String(input.transactionId ?? input.easnerTransactionId ?? "").trim()
  if (!etid && !rawId) {
    throw new GridPayInAckError("id_required", "transactionId required")
  }

  let tx: Record<string, unknown> | null = null
  if (etid) {
    tx = await loadTransactionByEtid(input.admin, etid)
  }
  if (!tx && rawId && /^[0-9a-f-]{36}$/i.test(rawId)) {
    tx = await loadTransactionById(input.admin, rawId)
  }
  if (!tx) throw new GridPayInAckError("not_found", "Transaction not found")

  assertOwnership({ row: tx, userId: input.userId, businessId: input.businessId })
  if (!isGridPayInTransaction(tx)) {
    throw new GridPayInAckError("not_grid_pay_in", "Not a Grid pay-in transaction")
  }

  const meta = (tx.metadata ?? {}) as Record<string, unknown>
  const attestedAt = String(meta.grid_user_attested_pay_in_at ?? "").trim()
  if (attestedAt) {
    return { attestedAt, alreadyAttested: true }
  }

  const ledgerStatus = String(tx.status ?? "").trim().toLowerCase()
  if (ledgerStatus === "settled" || ledgerStatus === "failed" || ledgerStatus === "cancelled") {
    throw new GridPayInAckError("not_attestable", "Transaction is no longer awaiting payment")
  }

  const now = new Date().toISOString()
  const nextMeta = {
    ...meta,
    grid_user_attested_pay_in_at: now,
  }

  const { error } = await input.admin
    .from("transactions")
    .update({ metadata: nextMeta, updated_at: now })
    .eq("id", String(tx.id))

  if (error) throw new GridPayInAckError("update_failed", error.message)

  return { attestedAt: now, alreadyAttested: false }
}
