import type { SupabaseClient } from "@supabase/supabase-js"
import {
  balanceConvertListProductLabel,
  normalizeBalanceMoveReviewSnapshot,
  type BalanceMoveReviewSnapshot,
} from "@easner/shared"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { ensureEasnerTransactionId } from "@/lib/easner-transaction-id"

export type BalanceConvertSessionForLedger = {
  id: string
  wallet_owner_id: string
  user_id: string
  direction: string
  source_amount: number
  destination_amount: number | null
  relay_request_id: string | null
  metadata?: unknown
}

function resolveMoveReview(session: BalanceConvertSessionForLedger): BalanceMoveReviewSnapshot | null {
  const meta = (session.metadata ?? {}) as Record<string, unknown>
  return (
    normalizeBalanceMoveReviewSnapshot(meta.move_review) ??
    normalizeBalanceMoveReviewSnapshot({
      direction: session.direction,
      source_amount: session.source_amount,
      destination_amount: session.destination_amount,
    })
  )
}

export function balanceConvertProviderTransactionId(sessionId: string): string {
  return `balance_convert:${sessionId}`
}

export async function upsertBalanceConvertLedgerTransaction(
  admin: SupabaseClient,
  input: {
    session: BalanceConvertSessionForLedger
    scope: { userId: string; businessId: string | null }
    status: "pending" | "settled" | "failed"
    failureReason?: string | null
    txHash?: string | null
  },
): Promise<{ transactionId: string; inserted: boolean }> {
  const moveReview = resolveMoveReview(input.session)
  if (!moveReview) throw new Error("balance_convert_missing_move_review")

  const providerTransactionId = balanceConvertProviderTransactionId(String(input.session.id))
  const occurredAt = new Date().toISOString()
  const metadata = ensureEasnerTransactionId(null, {
    flow: "balance_convert",
    activity_type: "balance_convert",
    balance_convert_session_id: input.session.id,
    balance_convert_direction: input.session.direction,
    relay_request_id: input.session.relay_request_id,
    move_review: moveReview,
    transfer_method: balanceConvertListProductLabel(),
    ...(input.failureReason ? { failure_reason: input.failureReason } : {}),
  })

  const upsert = await upsertLedgerTransaction(admin, {
    userId: input.scope.userId,
    businessId: input.scope.businessId,
    provider: "relay",
    providerTransactionId,
    status: input.status,
    amount: moveReview.total_debited,
    currency: moveReview.source_currency,
    direction: "out",
    occurredAt,
    ...(input.status === "settled" ? { settledAt: occurredAt } : {}),
    txHash: input.txHash ?? null,
    asset: moveReview.source_currency === "USD" ? "USDC" : "EURC",
    chain: "solana",
    metadata,
    baseCurrency: moveReview.source_currency,
  })

  return { transactionId: upsert.transactionId, inserted: upsert.inserted }
}

export async function findBalanceConvertLedgerTransactionId(
  admin: SupabaseClient,
  sessionId: string,
): Promise<string | null> {
  const providerTransactionId = balanceConvertProviderTransactionId(sessionId)
  const { data } = await admin
    .from("transactions")
    .select("id")
    .eq("provider", "relay")
    .eq("provider_transaction_id", providerTransactionId)
    .maybeSingle()
  return data?.id ? String(data.id) : null
}
