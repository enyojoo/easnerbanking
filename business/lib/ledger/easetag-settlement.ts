import type { SupabaseClient } from "@supabase/supabase-js"

export type EasetagSettlementStatus = "pending" | "submitted" | "settled" | "failed"

export type EasetagSettlementRow = {
  transfer_group_id: string
  idempotency_key: string
  status: EasetagSettlementStatus
  sender_user_id: string
  sender_business_id: string | null
  payee_user_id: string
  payee_business_id: string | null
  amount: number
  currency: "USD" | "EUR"
  asset: "USDC" | "EURC"
  turnkey_send_status_id: string | null
  tx_hash: string | null
  error: string | null
  debit_provider_transaction_id: string | null
  credit_provider_transaction_id: string | null
}

export async function updateEasetagSettlementLedgerPtids(
  admin: SupabaseClient,
  transferGroupId: string,
  debitPtid: string,
  creditPtid: string,
): Promise<void> {
  const now = new Date().toISOString()
  await admin
    .from("easetag_settlements")
    .update({
      debit_provider_transaction_id: debitPtid,
      credit_provider_transaction_id: creditPtid,
      updated_at: now,
    })
    .eq("transfer_group_id", transferGroupId)
}

const EASETAG_SETTLEMENT_ACTIVE_STATUSES = ["pending", "submitted", "settled"] as const

function amountsRoughlyEqual(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return false
  return Math.abs(a - b) <= Math.max(0.01, a * 0.001)
}

async function getEasetagSettlementByTransferGroupId(
  admin: SupabaseClient,
  transferGroupId: string,
): Promise<EasetagSettlementRow | null> {
  const id = String(transferGroupId || "").trim()
  if (!id) return null
  const { data } = await admin.from("easetag_settlements").select("*").eq("transfer_group_id", id).maybeSingle()
  if (!data) return null
  return normalizeRow(data as Record<string, unknown>)
}

/** P2P sender debit leg tagged with on-chain tx before `easetag_settlements.tx_hash` is set. */
async function findEasetagSettlementViaP2pDebitTxHash(
  admin: SupabaseClient,
  txHash: string,
): Promise<EasetagSettlementRow | null> {
  const hx = String(txHash || "").trim()
  if (!hx) return null

  const { data: byColumn } = await admin
    .from("transactions")
    .select("metadata")
    .eq("provider", "easner_internal")
    .eq("tx_hash", hx)
    .like("provider_transaction_id", "easetag_p2p:%:debit")
    .limit(1)
    .maybeSingle()
  const fromColumn = transferGroupIdFromEasetagDebitMeta(byColumn?.metadata)
  if (fromColumn) {
    const row = await getEasetagSettlementByTransferGroupId(admin, fromColumn)
    if (row && EASETAG_SETTLEMENT_ACTIVE_STATUSES.includes(row.status)) return row
  }

  const { data: debits } = await admin
    .from("transactions")
    .select("metadata")
    .eq("provider", "easner_internal")
    .like("provider_transaction_id", "easetag_p2p:%:debit")
    .filter("metadata->>turnkey_tx_hash", "eq", hx)
    .limit(3)
  for (const debit of debits ?? []) {
    const tg = transferGroupIdFromEasetagDebitMeta(debit.metadata)
    if (!tg) continue
    const row = await getEasetagSettlementByTransferGroupId(admin, tg)
    if (row && EASETAG_SETTLEMENT_ACTIVE_STATUSES.includes(row.status)) return row
  }
  return null
}

function transferGroupIdFromEasetagDebitMeta(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null
  const tg = String((metadata as Record<string, unknown>).transfer_group_id ?? "").trim()
  return tg || null
}

async function findEasetagSettlementByPayeeInbound(
  admin: SupabaseClient,
  input: {
    payeeUserId: string
    payeeBusinessId: string | null
    amount: number
    currency: string
  },
): Promise<EasetagSettlementRow | null> {
  const amount = Number(input.amount)
  const currency = String(input.currency || "").trim().toUpperCase()
  if (!Number.isFinite(amount) || amount <= 0 || (currency !== "USD" && currency !== "EUR")) return null

  let q = admin
    .from("easetag_settlements")
    .select("*")
    .eq("payee_user_id", input.payeeUserId)
    .eq("currency", currency)
    .in("status", ["pending", "submitted"])
  if (input.payeeBusinessId) q = q.eq("payee_business_id", input.payeeBusinessId)
  else q = q.is("payee_business_id", null)

  const { data: rows } = await q.order("updated_at", { ascending: false }).limit(8)
  for (const row of rows ?? []) {
    if (amountsRoughlyEqual(amount, Number(row.amount))) return normalizeRow(row as Record<string, unknown>)
  }
  return null
}

export type EasetagSettlementChainSuppressionInput = {
  turnkeySendStatusId?: string | null
  txHash?: string | null
  /** Payee wallet scope for inbound Turnkey balance webhooks (duplicate of easetag_p2p credit). */
  payeeUserId?: string | null
  payeeBusinessId?: string | null
  amount?: number | null
  currency?: string | null
}

/** True when ledger delta from Turnkey webhook/RPC should be skipped (already applied in Easetag ledger). */
export async function findEasetagSettlementForChainSuppression(
  admin: SupabaseClient,
  input: EasetagSettlementChainSuppressionInput,
): Promise<EasetagSettlementRow | null> {
  const tid = String(input.turnkeySendStatusId || "").trim()
  const hx = String(input.txHash || "").trim()

  if (tid) {
    const { data } = await admin
      .from("easetag_settlements")
      .select("*")
      .eq("turnkey_send_status_id", tid)
      .in("status", [...EASETAG_SETTLEMENT_ACTIVE_STATUSES])
      .maybeSingle()
    if (data) return normalizeRow(data)
  }
  if (hx) {
    const { data } = await admin
      .from("easetag_settlements")
      .select("*")
      .eq("tx_hash", hx)
      .in("status", [...EASETAG_SETTLEMENT_ACTIVE_STATUSES])
      .maybeSingle()
    if (data) return normalizeRow(data)

    const viaDebit = await findEasetagSettlementViaP2pDebitTxHash(admin, hx)
    if (viaDebit) return viaDebit
  }

  const payeeUserId = String(input.payeeUserId || "").trim()
  if (payeeUserId && input.amount != null && input.currency) {
    return findEasetagSettlementByPayeeInbound(admin, {
      payeeUserId,
      payeeBusinessId: input.payeeBusinessId ?? null,
      amount: Number(input.amount),
      currency: String(input.currency),
    })
  }

  return null
}

/** True when Easetag P2P payee credit leg is already visible (ledger applied before chain hash linked). */
export async function easetagP2pCreditVisibleForTransferGroup(
  admin: SupabaseClient,
  transferGroupId: string,
): Promise<boolean> {
  const id = String(transferGroupId || "").trim()
  if (!id) return false

  const creditPtid = `easetag_p2p:${id}:credit`
  const { data: row } = await admin
    .from("transactions")
    .select("id,hidden_from_feed,metadata")
    .eq("provider", "easner_internal")
    .eq("provider_transaction_id", creditPtid)
    .maybeSingle()
  if (!row?.id || row.hidden_from_feed === true) return false
  const meta = (row.metadata as Record<string, unknown> | undefined) ?? {}
  return String(meta.source ?? "").toLowerCase() === "easetag_p2p"
}

function normalizeRow(data: Record<string, unknown>): EasetagSettlementRow {
  return {
    transfer_group_id: String(data.transfer_group_id),
    idempotency_key: String(data.idempotency_key),
    status: data.status as EasetagSettlementStatus,
    sender_user_id: String(data.sender_user_id),
    sender_business_id: data.sender_business_id != null ? String(data.sender_business_id) : null,
    payee_user_id: String(data.payee_user_id),
    payee_business_id: data.payee_business_id != null ? String(data.payee_business_id) : null,
    amount: Number(data.amount),
    currency: String(data.currency).toUpperCase() as "USD" | "EUR",
    asset: String(data.asset).toUpperCase() as "USDC" | "EURC",
    turnkey_send_status_id: data.turnkey_send_status_id != null ? String(data.turnkey_send_status_id) : null,
    tx_hash: data.tx_hash != null ? String(data.tx_hash) : null,
    error: data.error != null ? String(data.error) : null,
    debit_provider_transaction_id: data.debit_provider_transaction_id != null ? String(data.debit_provider_transaction_id) : null,
    credit_provider_transaction_id: data.credit_provider_transaction_id != null ? String(data.credit_provider_transaction_id) : null,
  }
}

export async function getEasetagSettlementByIdempotencyKey(
  admin: SupabaseClient,
  idempotencyKey: string,
): Promise<EasetagSettlementRow | null> {
  const { data, error } = await admin
    .from("easetag_settlements")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle()
  if (error || !data) return null
  return normalizeRow(data as Record<string, unknown>)
}

export async function insertEasetagSettlementPending(
  admin: SupabaseClient,
  row: {
    transfer_group_id: string
    idempotency_key: string
    sender_user_id: string
    sender_business_id: string | null
    payee_user_id: string
    payee_business_id: string | null
    amount: number
    currency: "USD" | "EUR"
    asset: "USDC" | "EURC"
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = new Date().toISOString()
  const { error } = await admin.from("easetag_settlements").insert({
    transfer_group_id: row.transfer_group_id,
    idempotency_key: row.idempotency_key,
    status: "pending",
    sender_user_id: row.sender_user_id,
    sender_business_id: row.sender_business_id,
    payee_user_id: row.payee_user_id,
    payee_business_id: row.payee_business_id,
    amount: row.amount,
    currency: row.currency,
    asset: row.asset,
    debit_provider_transaction_id: null,
    credit_provider_transaction_id: null,
    created_at: now,
    updated_at: now,
  })
  if (error) {
    if (String(error.code) === "23505") return { ok: false, error: "duplicate_idempotency" }
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

/** Patch sender debit leg with on-chain settlement refs (no separate Turnkey `transactions` row). */
export async function patchEasetagP2pChainSettlement(
  admin: SupabaseClient,
  input: {
    transferGroupId: string
    turnkeySendId: string
    txHash?: string | null
    turnkeySendStatus?: string | null
  },
): Promise<void> {
  const transferGroupId = String(input.transferGroupId || "").trim()
  const turnkeySendId = String(input.turnkeySendId || "").trim()
  if (!transferGroupId || !turnkeySendId) return

  const debitPtid = `easetag_p2p:${transferGroupId}:debit`
  const { data: row } = await admin
    .from("transactions")
    .select("id, metadata")
    .eq("provider", "easner_internal")
    .eq("provider_transaction_id", debitPtid)
    .maybeSingle()
  if (!row?.id) return

  const meta = { ...((row.metadata || {}) as Record<string, unknown>) }
  meta.turnkey_send_id = turnkeySendId
  if (input.txHash) meta.turnkey_tx_hash = input.txHash
  if (input.turnkeySendStatus) meta.turnkey_send_status = input.turnkeySendStatus

  await admin
    .from("transactions")
    .update({
      metadata: meta,
      ...(input.txHash ? { tx_hash: input.txHash } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
}

export async function updateEasetagSettlementSubmitted(
  admin: SupabaseClient,
  transferGroupId: string,
  turnkeySendStatusId: string,
  txHash: string | null,
): Promise<void> {
  const now = new Date().toISOString()
  await admin
    .from("easetag_settlements")
    .update({
      status: "submitted",
      turnkey_send_status_id: turnkeySendStatusId,
      tx_hash: txHash || null,
      updated_at: now,
    })
    .eq("transfer_group_id", transferGroupId)
}

export async function updateEasetagSettlementSettled(
  admin: SupabaseClient,
  transferGroupId: string,
  txHash: string | null,
): Promise<void> {
  const now = new Date().toISOString()
  await admin
    .from("easetag_settlements")
    .update({
      status: "settled",
      tx_hash: txHash || null,
      updated_at: now,
    })
    .eq("transfer_group_id", transferGroupId)
}

export async function updateEasetagSettlementFailed(
  admin: SupabaseClient,
  transferGroupId: string,
  message: string,
): Promise<void> {
  const now = new Date().toISOString()
  await admin
    .from("easetag_settlements")
    .update({
      status: "failed",
      error: message.slice(0, 2000),
      updated_at: now,
    })
    .eq("transfer_group_id", transferGroupId)
}

export async function resetEasetagSettlementForRetry(
  admin: SupabaseClient,
  transferGroupId: string,
): Promise<void> {
  const now = new Date().toISOString()
  await admin
    .from("easetag_settlements")
    .update({
      status: "pending",
      turnkey_send_status_id: null,
      tx_hash: null,
      error: null,
      updated_at: now,
    })
    .eq("transfer_group_id", transferGroupId)
    .eq("status", "failed")
}

export async function listEasetagSettlementsSubmittedStale(
  admin: SupabaseClient,
  opts: { limit: number; olderThanMs: number },
): Promise<EasetagSettlementRow[]> {
  const cutoff = new Date(Date.now() - opts.olderThanMs).toISOString()
  const { data, error } = await admin
    .from("easetag_settlements")
    .select("*")
    .eq("status", "submitted")
    .not("turnkey_send_status_id", "is", null)
    .lt("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(opts.limit)
  if (error || !data?.length) return []
  return data.map((r) => normalizeRow(r as Record<string, unknown>))
}

export async function deleteEasetagSettlement(admin: SupabaseClient, transferGroupId: string): Promise<void> {
  await admin.from("easetag_settlements").delete().eq("transfer_group_id", transferGroupId)
}
