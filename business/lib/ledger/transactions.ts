import type { SupabaseClient } from "@supabase/supabase-js"
import { ensureExchangeRatesFresh, findExchangeRate } from "@/lib/fx/exchange-rates"
import { ensureEasnerTransactionId } from "@/lib/easner-transaction-id"

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
  amountMinor?: string | number | null
  baseCurrency?: string | null
}

export type UpsertLedgerTransactionResult = {
  inserted: boolean
  updated: boolean
  previousStatus: string | null
  nextStatus: string
  becameSettled: boolean
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

export async function upsertLedgerTransaction(
  admin: SupabaseClient,
  input: UpsertLedgerTransactionInput,
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
  const fxAsOf = fx?.asOf ?? null

  const { data: existing, error: existingErr } = await admin
    .from("transactions")
    .select("id,status,metadata")
    .eq("provider", provider)
    .eq("provider_transaction_id", providerTransactionId)
    .maybeSingle()
  if (existingErr) throw existingErr

  const mergedMetadata = mergeMetadata(
    (existing?.metadata as Record<string, unknown> | undefined) ?? null,
    input.metadata,
  )

  const previousStatus = existing?.status ? String(existing.status) : null
  const nextStatus = status
  const becameSettled = previousStatus !== "settled" && nextStatus === "settled"

  const record = {
    user_id: input.userId,
    business_id: input.businessId ?? null,
    provider,
    provider_transaction_id: providerTransactionId,
    provider_event_id: input.providerEventId ?? null,
    status,
    amount,
    currency,
    direction,
    payload: input.payload ?? null,
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
    occurred_at: input.occurredAt ?? null,
    settled_at: input.settledAt ?? null,
    amount_minor: input.amountMinor ?? null,
    base_currency: baseCurrency,
    base_amount: baseAmount,
    fx_rate: fxRate,
    fx_rate_as_of: fxAsOf,
    updated_at: new Date().toISOString(),
  }

  if (existing?.id) {
    const { error } = await admin
      .from("transactions")
      .update(record)
      .eq("id", existing.id)
    if (error) throw error
    return { inserted: false, updated: true, previousStatus, nextStatus, becameSettled }
  }

  const { error } = await admin.from("transactions").insert(record)
  if (error) throw error
  return { inserted: true, updated: false, previousStatus: null, nextStatus, becameSettled: nextStatus === "settled" }
}
