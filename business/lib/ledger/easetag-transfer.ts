import type { SupabaseClient } from "@supabase/supabase-js"
import { createHash } from "crypto"
import { applyWalletBalanceDelta } from "@/lib/wallet/wallet-balances-db"
import { generateTransactionId, isEasnerClientTransactionIdFormat } from "@/lib/transaction-id"

function deterministicTransferGroupUuid(idempotencyKey: string): string {
  const h = createHash("sha256").update(idempotencyKey).digest()
  const bytes = Buffer.alloc(16)
  h.copy(bytes, 0, 0, 16)
  bytes[6] = (bytes[6]! & 0x0f) | 0x50
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.toString("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

async function readAvailableBalance(
  admin: SupabaseClient,
  opts: { businessId: string | null; userId: string | null; currency: "USD" | "EUR" },
): Promise<{ available: number; err?: string }> {
  let q = admin.from("wallet_balances").select("available_balance").eq("currency", opts.currency).limit(1)
  if (opts.businessId) q = q.eq("business_id", opts.businessId)
  else if (opts.userId) q = q.eq("user_id", opts.userId)
  else return { available: 0, err: "invalid_scope" }
  const { data, error } = await q.maybeSingle()
  if (error) return { available: 0, err: error.message }
  return { available: Number(data?.available_balance ?? 0) }
}

function buildTransactionInsert(input: {
  userId: string
  businessId: string | null
  providerTransactionId: string
  direction: "in" | "out"
  amount: number
  currency: "USD" | "EUR"
  easnerTransactionId: string
  metadata: Record<string, unknown>
  now: string
}): Record<string, unknown> {
  return {
    user_id: input.userId,
    business_id: input.businessId,
    provider: "easner_internal",
    provider_transaction_id: input.providerTransactionId,
    provider_event_id: null,
    status: "settled",
    amount: input.amount,
    currency: input.currency,
    direction: input.direction,
    payload: { source: "easetag_p2p" },
    metadata: input.metadata,
    easner_transaction_id: input.easnerTransactionId,
    tx_hash: null,
    wallet_address: null,
    asset: null,
    chain: null,
    counterparty_address: null,
    occurred_at: input.now,
    settled_at: input.now,
    amount_minor: null,
    base_currency: input.currency,
    base_amount: input.amount,
    fx_rate: 1,
    fx_rate_as_of: null,
    updated_at: input.now,
  }
}

export type ExecuteEasetagTransferInput = {
  idempotencyKey: string
  amount: number
  currency: "USD" | "EUR"
  senderUserId: string
  senderBusinessId: string | null
  /** Sender display easetag for credit-side labels (optional). */
  senderEasetag?: string | null
  payeeUserId: string
  payeeBusinessId: string | null
  payeeEasetag: string
  /** Client-generated ETID; persisted on both legs when valid `ETID` + 8 digits. */
  reservedDebitEtid?: string | null
}

export type ExecuteEasetagTransferResult =
  | {
      ok: true
      idempotent: boolean
      transferGroupId: string
      debitProviderTransactionId: string
      creditProviderTransactionId: string
      easnerTransactionId: string
    }
  | { ok: false; error: string }

/**
 * Internal Easetag P2P: move `wallet_balances` and insert paired `transactions` rows.
 * Does **not** call Postgres `transfer_easetag_p2p` (avoids dropped `easner_etid_reservations`).
 */
export async function executeEasetagTransfer(
  admin: SupabaseClient,
  input: ExecuteEasetagTransferInput,
): Promise<ExecuteEasetagTransferResult> {
  const key = String(input.idempotencyKey || "").trim()
  if (!key) return { ok: false, error: "idempotency_key_required" }
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { ok: false, error: "invalid_amount" }

  const transferGroupId = deterministicTransferGroupUuid(key)
  const debitPtid = `easetag_p2p:${transferGroupId}:debit`
  const creditPtid = `easetag_p2p:${transferGroupId}:credit`

  const { data: existingDebit, error: existErr } = await admin
    .from("transactions")
    .select("id,easner_transaction_id,metadata")
    .eq("provider", "easner_internal")
    .eq("provider_transaction_id", debitPtid)
    .maybeSingle()
  if (existErr) return { ok: false, error: existErr.message }

  if (existingDebit?.id) {
    const meta = (existingDebit.metadata || {}) as Record<string, unknown>
    const etid = String(existingDebit.easner_transaction_id || meta.easner_transaction_id || "").trim()
    return {
      ok: true,
      idempotent: true,
      transferGroupId,
      debitProviderTransactionId: debitPtid,
      creditProviderTransactionId: creditPtid,
      easnerTransactionId: etid || debitPtid,
    }
  }

  const amt = Math.round(input.amount * 100) / 100
  const reservedRaw = String(input.reservedDebitEtid ?? "").trim()
  const etid =
    reservedRaw && isEasnerClientTransactionIdFormat(reservedRaw) ? reservedRaw.toUpperCase() : generateTransactionId()

  const senderTag = String(input.senderEasetag ?? "").trim().replace(/^@+/, "")
  const payeeTag = String(input.payeeEasetag ?? "").trim().replace(/^@+/, "")

  const senderBalanceScope = {
    businessId: input.senderBusinessId,
    userId: input.senderBusinessId ? null : input.senderUserId,
    currency: input.currency,
  }
  const payeeBalanceScope = {
    businessId: input.payeeBusinessId,
    userId: input.payeeBusinessId ? null : input.payeeUserId,
    currency: input.currency,
  }

  const { available, err: balErr } = await readAvailableBalance(admin, {
    businessId: senderBalanceScope.businessId,
    userId: senderBalanceScope.userId,
    currency: input.currency,
  })
  if (balErr) return { ok: false, error: "sender_balance_row_missing" }
  if (available < amt) return { ok: false, error: "insufficient_balance" }

  const now = new Date().toISOString()
  const debitMeta: Record<string, unknown> = {
    easner_transaction_id: etid,
    source: "easetag_p2p",
    idempotency_key: key,
    transfer_group_id: transferGroupId,
    payee_easetag: payeeTag,
  }
  if (senderTag) debitMeta.sender_easetag = senderTag

  const creditMeta: Record<string, unknown> = {
    easner_transaction_id: etid,
    source: "easetag_p2p",
    idempotency_key: key,
    transfer_group_id: transferGroupId,
    sender_easetag: senderTag,
  }
  if (payeeTag) creditMeta.payee_easetag = payeeTag

  let debited = false
  let credited = false
  let debitInserted = false
  try {
    await applyWalletBalanceDelta(admin, {
      ...senderBalanceScope,
      delta: -amt,
    })
    debited = true
    await applyWalletBalanceDelta(admin, {
      ...payeeBalanceScope,
      delta: amt,
    })
    credited = true

    const debitInsert = buildTransactionInsert({
      userId: input.senderUserId,
      businessId: input.senderBusinessId,
      providerTransactionId: debitPtid,
      direction: "out",
      amount: amt,
      currency: input.currency,
      easnerTransactionId: etid,
      metadata: debitMeta,
      now,
    })
    const creditInsert = buildTransactionInsert({
      userId: input.payeeUserId,
      businessId: input.payeeBusinessId,
      providerTransactionId: creditPtid,
      direction: "in",
      amount: amt,
      currency: input.currency,
      easnerTransactionId: etid,
      metadata: creditMeta,
      now,
    })

    const { error: dErr } = await admin.from("transactions").insert(debitInsert)
    if (dErr) throw dErr
    debitInserted = true
    const { error: cErr } = await admin.from("transactions").insert(creditInsert)
    if (cErr) throw cErr

    return {
      ok: true,
      idempotent: false,
      transferGroupId,
      debitProviderTransactionId: debitPtid,
      creditProviderTransactionId: creditPtid,
      easnerTransactionId: etid,
    }
  } catch (e) {
    try {
      if (debitInserted) {
        await admin.from("transactions").delete().eq("provider", "easner_internal").eq("provider_transaction_id", debitPtid)
      }
      await admin.from("transactions").delete().eq("provider", "easner_internal").eq("provider_transaction_id", creditPtid)
      if (credited)
        await applyWalletBalanceDelta(admin, {
          ...payeeBalanceScope,
          delta: -amt,
        })
      if (debited)
        await applyWalletBalanceDelta(admin, {
          ...senderBalanceScope,
          delta: amt,
        })
    } catch {
      // best-effort rollback
    }
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg || "transfer_failed" }
  }
}

export function isEasetagLedgerP2PEnabled(): boolean {
  const a = String(process.env.EASETAG_LEDGER_P2P_ENABLED || "").trim().toLowerCase()
  const b = String(process.env.NEXT_PUBLIC_EASETAG_LEDGER_P2P_ENABLED || "").trim().toLowerCase()
  return a === "true" || b === "true"
}
