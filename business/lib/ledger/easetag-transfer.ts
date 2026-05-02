import type { SupabaseClient } from "@supabase/supabase-js"
import { createHash } from "crypto"

function deterministicTransferGroupUuid(idempotencyKey: string): string {
  const h = createHash("sha256").update(idempotencyKey).digest()
  const bytes = Buffer.alloc(16)
  h.copy(bytes, 0, 0, 16)
  bytes[6] = (bytes[6]! & 0x0f) | 0x50
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.toString("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

export type ExecuteEasetagTransferInput = {
  idempotencyKey: string
  amount: number
  currency: "USD" | "EUR"
  senderUserId: string
  senderBusinessId: string | null
  payeeUserId: string
  payeeBusinessId: string | null
  payeeEasetag: string
}

export type ExecuteEasetagTransferResult =
  | {
      ok: true
      idempotent: boolean
      transferGroupId: string
      debitProviderTransactionId: string
      creditProviderTransactionId: string
      /** Sender-facing ETID for `/transactions/[etid]` */
      easnerTransactionId: string
    }
  | { ok: false; error: string }

export async function executeEasetagTransfer(
  admin: SupabaseClient,
  input: ExecuteEasetagTransferInput,
): Promise<ExecuteEasetagTransferResult> {
  const key = String(input.idempotencyKey || "").trim()
  if (!key) return { ok: false, error: "idempotency_key_required" }
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { ok: false, error: "invalid_amount" }

  const transferGroupId = deterministicTransferGroupUuid(key)
  const { data, error } = await (admin as SupabaseClient & { rpc: (a: string, b: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> }).rpc(
    "transfer_easetag_p2p",
    {
      p_idempotency_key: key,
      p_amount: input.amount,
      p_currency: input.currency,
      p_sender_user_id: input.senderUserId,
      p_sender_business_id: input.senderBusinessId,
      p_payee_user_id: input.payeeUserId,
      p_payee_business_id: input.payeeBusinessId,
      p_payee_easetag: input.payeeEasetag,
      p_transfer_group_id: transferGroupId,
    },
  )

  if (error) {
    return { ok: false, error: error.message || "rpc_failed" }
  }

  const row = (data || {}) as Record<string, unknown>
  if (row.ok !== true) {
    return { ok: false, error: String(row.error || "transfer_failed") }
  }

  const debitId = String(row.debit_provider_transaction_id || "")
  const etid = String(row.easner_transaction_id || "").trim()

  return {
    ok: true,
    idempotent: Boolean(row.idempotent),
    transferGroupId: String(row.transfer_group_id || transferGroupId),
    debitProviderTransactionId: debitId,
    creditProviderTransactionId: String(row.credit_provider_transaction_id || ""),
    easnerTransactionId: etid || debitId,
  }
}

export function isEasetagLedgerP2PEnabled(): boolean {
  const a = String(process.env.EASETAG_LEDGER_P2P_ENABLED || "").trim().toLowerCase()
  const b = String(process.env.NEXT_PUBLIC_EASETAG_LEDGER_P2P_ENABLED || "").trim().toLowerCase()
  return a === "true" || b === "true"
}
