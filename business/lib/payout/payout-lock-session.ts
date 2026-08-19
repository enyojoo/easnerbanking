import type { SupabaseClient } from "@supabase/supabase-js"
import { computeFootedDisplayProcessingFee } from "@easner/shared"
import type { PayoutQuoteResult } from "@/lib/noah/payout-quote"

export type PayoutLockProvider = "noah" | "yellowcard" | "grid"

export type PayoutLockSessionRow = {
  id: string
  user_id: string
  business_id: string | null
  recipient_id: string | null
  destination_ref: string
  provider: PayoutLockProvider
  quote_key: string
  status: "locked" | "executed" | "expired"
  recipient_snapshot_hash: string
  pricing_json: PayoutQuoteResult
  provider_payload_json: Record<string, unknown>
  expires_at: string
}

function rowFromDb(data: Record<string, unknown>): PayoutLockSessionRow {
  return {
    id: String(data.id),
    user_id: String(data.user_id),
    business_id: data.business_id == null ? null : String(data.business_id),
    recipient_id: data.recipient_id == null ? null : String(data.recipient_id),
    destination_ref:
      String(data.destination_ref || "").trim() ||
      (data.recipient_id == null ? "" : `recipient:${String(data.recipient_id)}`),
    provider: String(data.provider) as PayoutLockProvider,
    quote_key: String(data.quote_key),
    status: String(data.status) as PayoutLockSessionRow["status"],
    recipient_snapshot_hash: String(data.recipient_snapshot_hash),
    pricing_json: data.pricing_json as PayoutQuoteResult,
    provider_payload_json: (data.provider_payload_json as Record<string, unknown>) ?? {},
    expires_at: String(data.expires_at),
  }
}

export async function findReusablePayoutLockSession(
  admin: SupabaseClient,
  input: { userId: string; quoteKey: string },
): Promise<PayoutLockSessionRow | null> {
  const now = Date.now()
  const { data } = await admin
    .from("payout_lock_sessions")
    .select("*")
    .eq("user_id", input.userId)
    .eq("quote_key", input.quoteKey)
    .eq("status", "locked")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null
  const row = rowFromDb(data as Record<string, unknown>)
  if (new Date(row.expires_at).getTime() <= now) {
    await admin
      .from("payout_lock_sessions")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", row.id)
    return null
  }
  return row
}

export async function getPayoutLockSession(
  admin: SupabaseClient,
  input: { lockId: string; userId: string },
): Promise<PayoutLockSessionRow | null> {
  const { data, error } = await admin
    .from("payout_lock_sessions")
    .select("*")
    .eq("id", input.lockId)
    .eq("user_id", input.userId)
    .maybeSingle()

  if (error || !data) return null
  const row = rowFromDb(data as Record<string, unknown>)
  if (row.status !== "locked") return null
  if (new Date(row.expires_at).getTime() <= Date.now()) return null
  return row
}

export async function upsertPayoutLockSession(
  admin: SupabaseClient,
  input: {
    userId: string
    businessId: string | null
    recipientId: string
    destinationRef?: string
    provider: PayoutLockProvider
    quoteKey: string
    recipientSnapshotHash: string
    pricing: PayoutQuoteResult
    providerPayload: Record<string, unknown>
    expiresAt: string
  },
): Promise<PayoutLockSessionRow> {
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from("payout_lock_sessions")
    .upsert(
      {
        user_id: input.userId,
        business_id: input.businessId,
        recipient_id:
          input.destinationRef?.startsWith("payroll_method:") ? null : input.recipientId,
        destination_ref: input.destinationRef || `recipient:${input.recipientId}`,
        provider: input.provider,
        quote_key: input.quoteKey,
        status: "locked",
        recipient_snapshot_hash: input.recipientSnapshotHash,
        pricing_json: input.pricing,
        provider_payload_json: input.providerPayload,
        expires_at: input.expiresAt,
        updated_at: now,
      },
      { onConflict: "user_id,quote_key" },
    )
    .select("*")
    .single()

  if (error || !data) {
    throw new Error(error?.message || "payout_lock_session_upsert_failed")
  }
  return rowFromDb(data as Record<string, unknown>)
}

export async function markPayoutLockSessionExecuted(
  admin: SupabaseClient,
  lockId: string,
): Promise<void> {
  await admin
    .from("payout_lock_sessions")
    .update({ status: "executed", updated_at: new Date().toISOString() })
    .eq("id", lockId)
}

/** Atomically consume a lock before any wallet debit or provider funding side effect. */
export async function claimPayoutLockSession(
  admin: SupabaseClient,
  input: { lockId: string; userId: string },
): Promise<boolean> {
  const { data } = await admin
    .from("payout_lock_sessions")
    .update({ status: "executed", updated_at: new Date().toISOString() })
    .eq("id", input.lockId)
    .eq("user_id", input.userId)
    .eq("status", "locked")
    .gt("expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle()
  return Boolean(data?.id)
}

export function lockedQuoteFromSession(row: PayoutLockSessionRow): PayoutQuoteResult {
  const payload = row.provider_payload_json ?? {}
  const requestedReceiveAmount = row.pricing_json.requestedReceiveAmount
  const quote: PayoutQuoteResult = {
    ...row.pricing_json,
    // Backfill persisted locks created before displayReceiveAmount was introduced.
    displayReceiveAmount:
      row.pricing_json.displayReceiveAmount ??
      (row.provider === "yellowcard" &&
      requestedReceiveAmount != null &&
      Number.isFinite(requestedReceiveAmount) &&
      requestedReceiveAmount > 0
        ? requestedReceiveAmount
        : row.pricing_json.receiveAmount),
    displayProcessingFee: computeFootedDisplayProcessingFee({
      sendingAmount: row.pricing_json.customerPrincipal,
      totalDebited: row.pricing_json.totalDebited,
      fallbackFee: row.pricing_json.displayProcessingFee,
    }),
    lockId: row.id,
    quoteKey: row.quote_key,
    quotePhase: "locked",
    requiresConfirm: false,
  }
  if (row.provider === "grid") {
    quote.grid = {
      quoteId: String(payload.quoteId ?? quote.grid?.quoteId ?? ""),
      sequenceId: String(payload.sequenceId ?? quote.grid?.sequenceId ?? ""),
      customerId: String(payload.customerId ?? quote.grid?.customerId ?? ""),
      externalAccountId: String(payload.externalAccountId ?? quote.grid?.externalAccountId ?? ""),
      cryptoAmount: Number(payload.cryptoAmount ?? quote.grid?.cryptoAmount ?? 0),
      ...(String(payload.fundingAddress ?? "").trim()
        ? { fundingAddress: String(payload.fundingAddress).trim() }
        : {}),
    }
  }
  return quote
}
