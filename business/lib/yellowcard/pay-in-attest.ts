import type { SupabaseClient } from "@supabase/supabase-js"
import { isYcCrossBorderRow, isYcFundBalanceRow } from "@/lib/yellowcard/yc-ledger"

export class PayInAttestError extends Error {
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

async function loadTransfer(
  admin: SupabaseClient,
  transferId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await admin.from("yc_transfers").select("*").eq("id", transferId).maybeSingle()
  if (error) throw new PayInAttestError("transfer_lookup_failed", error.message)
  return (data as Record<string, unknown> | null) ?? null
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
  if (error) throw new PayInAttestError("transaction_lookup_failed", error.message)
  return (data as Record<string, unknown> | null) ?? null
}

async function loadTransactionById(
  admin: SupabaseClient,
  id: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await admin.from("transactions").select("*").eq("id", id).maybeSingle()
  if (error) throw new PayInAttestError("transaction_lookup_failed", error.message)
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
      throw new PayInAttestError("forbidden", "Not authorized for this transfer")
    }
    return
  }
  if (rowUserId !== input.userId || rowBusinessId != null) {
    throw new PayInAttestError("forbidden", "Not authorized for this transfer")
  }
}

function isAttestableTransferStatus(status: string): boolean {
  const s = status.trim().toLowerCase()
  return s === "awaiting_pay_in" || s === "pending" || s === "processing" || s === "leg2_quoted"
}

/** Record that the user indicated they sent the local pay-in transfer. Idempotent. */
export async function attestYcPayIn(input: {
  admin: SupabaseClient
  userId: string
  businessId: string | null
  easnerTransactionId?: string
  transferId?: string
}): Promise<{ attestedAt: string; alreadyAttested: boolean }> {
  const etid = normalizeEtid(input.easnerTransactionId)
  const transferId = String(input.transferId ?? "").trim()
  if (!etid && !transferId) {
    throw new PayInAttestError("id_required", "transactionId or transferId required")
  }

  let transfer: Record<string, unknown> | null = null
  if (transferId) {
    transfer = await loadTransfer(input.admin, transferId)
    if (!transfer) throw new PayInAttestError("not_found", "Transfer not found")
    assertOwnership({ row: transfer, userId: input.userId, businessId: input.businessId })
  }

  let tx: Record<string, unknown> | null = null
  if (etid) {
    tx = await loadTransactionByEtid(input.admin, etid)
  } else if (transfer?.transaction_id) {
    tx = await loadTransactionById(input.admin, String(transfer.transaction_id))
  }
  if (!tx) throw new PayInAttestError("not_found", "Transaction not found")
  assertOwnership({ row: tx, userId: input.userId, businessId: input.businessId })

  const meta = (tx.metadata ?? {}) as Record<string, unknown>
  if (!isYcFundBalanceRow(meta) && !isYcCrossBorderRow(meta)) {
    throw new PayInAttestError("not_yc_pay_in", "Not a Yellowcard pay-in transaction")
  }

  const attestedAt = String(meta.payment_attested_at ?? "").trim()
  if (attestedAt) {
    return { attestedAt, alreadyAttested: true }
  }

  const ledgerStatus = String(tx.status ?? "").trim().toLowerCase()
  if (ledgerStatus === "settled" || ledgerStatus === "failed" || ledgerStatus === "cancelled") {
    throw new PayInAttestError("not_attestable", "Transaction is no longer awaiting payment")
  }

  if (transfer && !isAttestableTransferStatus(String(transfer.status ?? ""))) {
    throw new PayInAttestError("not_attestable", "Transfer is no longer awaiting payment")
  }

  const now = new Date().toISOString()
  const nextMeta = {
    ...meta,
    payment_attested_at: now,
  }

  const { error } = await input.admin
    .from("transactions")
    .update({ metadata: nextMeta, updated_at: now })
    .eq("id", String(tx.id))

  if (error) throw new PayInAttestError("update_failed", error.message)

  return { attestedAt: now, alreadyAttested: false }
}
