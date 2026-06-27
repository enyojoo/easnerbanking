import type { SupabaseClient } from "@supabase/supabase-js"
import { ensureExchangeRatesFresh, findExchangeRate } from "@/lib/fx/exchange-rates"
import { ensureEasnerTransactionId } from "@/lib/easner-transaction-id"
import { dispatchTransactionNotification } from "@/lib/notifications/dispatch"
import { shouldDeferBankDepositSettledPush } from "@/lib/notifications/bank-deposit-settled-notify"
import {
  isEasetagChainSettlementTransaction,
  isNoahInternalSettlementTransaction,
  isTurnkeyEasetagP2pChainMirror,
} from "@/lib/transactions/transaction-feed-filters"
import { resolveHiddenFromFeed } from "@/lib/transactions/ledger-list-cursor"

export type LedgerDirection = "in" | "out"

export type UpsertLedgerTransactionInput = {
  userId: string
  businessId?: string | null
  provider: string
  providerTransactionId: string
  providerEventId?: string | null
  status?: string | null
  amount?: number | null
  currency?: string | null
  direction?: LedgerDirection | null
  payload?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
  txHash?: string | null
  walletAddress?: string | null
  asset?: string | null
  chain?: string | null
  counterpartyAddress?: string | null
  occurredAt?: string | null
  settledAt?: string | null
  baseCurrency?: string | null
}

export type UpsertLedgerTransactionResult = {
  transactionId: string
  inserted: boolean
  updated: boolean
  previousStatus: string | null
  nextStatus: string
  becameSettled: boolean
  becameFailed: boolean
}

function normalizeStatus(raw: string | null | undefined): string {
  const lower = String(raw || "").trim().toLowerCase()
  if (!lower) return "unknown"
  return lower
}

export function normalizeDirection(raw: string | null | undefined): LedgerDirection | null {
  const lower = String(raw || "").trim().toLowerCase()
  if (lower === "in" || lower === "credit" || lower === "receive" || lower === "received") return "in"
  if (lower === "out" || lower === "debit" || lower === "send" || lower === "sent") return "out"
  return null
}

function normalizeCurrency(raw: string | null | undefined, fallback = "USD"): string {
  const c = String(raw || "").trim().toUpperCase()
  return c || fallback
}

function asNumber(raw: unknown, fallback = 0): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

function mergeMetadata(
  existing: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return ensureEasnerTransactionId(existing, incoming)
}

function shouldSkipLedgerNotification(metadata: Record<string, unknown>): boolean {
  return (
    isEasetagChainSettlementTransaction(metadata) ||
    isTurnkeyEasetagP2pChainMirror(metadata) ||
    isNoahInternalSettlementTransaction(metadata)
  )
}

async function maybeNotifyLedgerTransaction(
  admin: SupabaseClient,
  input: {
    userId: string
    transactionId: string
    provider: string
    direction: LedgerDirection | null
    amount: number
    currency: string
    metadata: Record<string, unknown>
    payload: Record<string, unknown> | null
    outcome: "success" | "failed"
    easnerTransactionId?: string | null
    deferBankDeposit?: boolean
  },
): Promise<void> {
  if (shouldSkipLedgerNotification(input.metadata)) return
  if (input.outcome === "success" && input.deferBankDeposit) return

  const etid =
    typeof input.easnerTransactionId === "string" && input.easnerTransactionId.trim()
      ? input.easnerTransactionId.trim()
      : typeof input.metadata.easner_transaction_id === "string"
        ? input.metadata.easner_transaction_id.trim()
        : undefined

  await dispatchTransactionNotification(admin, {
    userId: input.userId,
    transactionId: input.transactionId,
    provider: input.provider,
    direction: input.direction,
    amount: input.amount,
    currency: input.currency,
    metadata: input.metadata,
    payload: input.payload,
    outcome: input.outcome,
    easnerTransactionId: etid,
    failureReason:
      typeof input.metadata.failure_reason === "string"
        ? input.metadata.failure_reason
        : undefined,
  }).catch((e) => console.warn("ledger transaction notification (non-fatal):", e))
}

export async function upsertLedgerTransaction(
  admin: SupabaseClient,
  input: UpsertLedgerTransactionInput,
  opts?: { retryOnConflict?: boolean },
): Promise<UpsertLedgerTransactionResult> {
  const provider = String(input.provider || "").trim().toLowerCase()
  const providerTransactionId = String(input.providerTransactionId || "").trim()
  if (!provider || !providerTransactionId) {
    throw new Error("provider and providerTransactionId are required")
  }

  const baseCurrency = normalizeCurrency(input.baseCurrency, "USD")
  const currency = normalizeCurrency(input.currency, "USD")
  const amount = asNumber(input.amount, 0)
  const direction = normalizeDirection(input.direction)
  const status = normalizeStatus(input.status)

  const rates = await ensureExchangeRatesFresh(admin)
  const fx = findExchangeRate(rates, currency, baseCurrency)
  const fxRate = fx?.rate ?? (currency === baseCurrency ? 1 : null)
  const baseAmount = fxRate != null ? Math.abs(amount) * fxRate : null

  const { data: existing, error: existingErr } = await admin
    .from("transactions")
    .select("id,status,metadata,payload,settled_at,occurred_at")
    .eq("provider", provider)
    .eq("provider_transaction_id", providerTransactionId)
    .maybeSingle()
  if (existingErr) throw existingErr

  const mergedMetadata = mergeMetadata(
    (existing?.metadata as Record<string, unknown> | undefined) ?? null,
    input.metadata,
  )

  const previousStatus = existing?.status ? String(existing.status) : null
  const isStatusDowngradeFromSettled =
    previousStatus === "settled" &&
    (status === "pending" || status === "processing" || status === "unknown")
  const nextStatus = isStatusDowngradeFromSettled ? "settled" : status
  const becameSettled = previousStatus !== "settled" && nextStatus === "settled"
  const becameFailed =
    previousStatus !== "failed" &&
    previousStatus !== "cancelled" &&
    (nextStatus === "failed" || nextStatus === "cancelled")
  const payload = isStatusDowngradeFromSettled
    ? ((existing?.payload as Record<string, unknown> | null | undefined) ?? input.payload ?? null)
    : (input.payload ?? null)
  const settledAt = isStatusDowngradeFromSettled
    ? (existing?.settled_at != null ? String(existing.settled_at) : input.settledAt ?? null)
    : (input.settledAt ?? null)

  const existingOccurred =
    existing?.occurred_at != null ? String(existing.occurred_at).trim() : ""
  const occurredAt =
    existing?.id && existingOccurred
      ? existingOccurred
      : (input.occurredAt ?? null)

  const hiddenFromFeed = resolveHiddenFromFeed(mergedMetadata, payload)

  const record = {
    user_id: input.userId,
    business_id: input.businessId ?? null,
    provider,
    provider_transaction_id: providerTransactionId,
    provider_event_id: input.providerEventId ?? null,
    status: nextStatus,
    amount,
    currency,
    direction,
    payload,
    metadata: mergedMetadata,
    easner_transaction_id:
      typeof mergedMetadata.easner_transaction_id === "string" && mergedMetadata.easner_transaction_id.trim()
        ? mergedMetadata.easner_transaction_id.trim()
        : null,
    tx_hash: input.txHash ?? null,
    wallet_address: input.walletAddress ?? null,
    asset: input.asset ?? null,
    chain: input.chain ?? null,
    counterparty_address: input.counterpartyAddress ?? null,
    occurred_at: occurredAt,
    settled_at: settledAt,
    base_currency: baseCurrency,
    base_amount: baseAmount,
    hidden_from_feed: hiddenFromFeed,
    updated_at: new Date().toISOString(),
  }

  if (existing?.id) {
    const { error } = await admin
      .from("transactions")
      .update(record)
      .eq("id", existing.id)
    if (error) throw error
    if (becameSettled) {
      await maybeNotifyLedgerTransaction(admin, {
        userId: input.userId,
        transactionId: existing.id,
        provider,
        direction,
        amount,
        currency,
        metadata: mergedMetadata,
        payload: (input.payload ?? null) as Record<string, unknown> | null,
        outcome: "success",
        deferBankDeposit: shouldDeferBankDepositSettledPush(mergedMetadata),
      })
    } else if (becameFailed) {
      await maybeNotifyLedgerTransaction(admin, {
        userId: input.userId,
        transactionId: existing.id,
        provider,
        direction,
        amount,
        currency,
        metadata: mergedMetadata,
        payload: (input.payload ?? null) as Record<string, unknown> | null,
        outcome: "failed",
      })
    }
    return {
      transactionId: existing.id,
      inserted: false,
      updated: true,
      previousStatus,
      nextStatus,
      becameSettled,
      becameFailed,
    }
  }

  const insert = await admin.from("transactions").insert(record).select("id").maybeSingle()
  if (insert.error) {
    if (String(insert.error.code) === "23505" && !opts?.retryOnConflict) {
      return upsertLedgerTransaction(admin, input, { retryOnConflict: true })
    }
    throw insert.error
  }
  const insertedId = String((insert.data as any)?.id || "").trim()
  if (!insertedId) throw new Error("Inserted transaction missing id")

  const insertedBecameSettled = nextStatus === "settled"
  if (insertedBecameSettled) {
    await maybeNotifyLedgerTransaction(admin, {
      userId: input.userId,
      transactionId: insertedId,
      provider,
      direction,
      amount,
      currency,
      metadata: mergedMetadata,
      payload: (input.payload ?? null) as Record<string, unknown> | null,
      outcome: "success",
      deferBankDeposit: shouldDeferBankDepositSettledPush(mergedMetadata),
    })
  } else if (nextStatus === "failed" || nextStatus === "cancelled") {
    await maybeNotifyLedgerTransaction(admin, {
      userId: input.userId,
      transactionId: insertedId,
      provider,
      direction,
      amount,
      currency,
      metadata: mergedMetadata,
      payload: (input.payload ?? null) as Record<string, unknown> | null,
      outcome: "failed",
    })
  }

  return {
    transactionId: insertedId,
    inserted: true,
    updated: false,
    previousStatus: null,
    nextStatus,
    becameSettled: insertedBecameSettled,
    becameFailed: nextStatus === "failed" || nextStatus === "cancelled",
  }
}
