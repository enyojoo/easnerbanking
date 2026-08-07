import type { SupabaseClient } from "@supabase/supabase-js"
import { relayGetRequestV3 } from "@/lib/relay/client"
import { isRelayConfigured } from "@/lib/relay/config"
import { isRelayRequestTerminalV3, mapRelayRequestStatusV3 } from "@/lib/relay/requests-v3"
import type { RelayRequestV3 } from "@/lib/relay/types"
import { applyWalletBalanceDelta } from "@/lib/wallet/wallet-balances-db"

export type BalanceConvertSessionRow = {
  id: string
  wallet_owner_id: string
  user_id: string
  direction: string
  source_amount: number
  destination_amount: number | null
  relay_request_id: string | null
  status: string
}

async function resolveConvertOwnerScope(
  admin: SupabaseClient,
  walletOwnerId: string,
): Promise<{ userId: string; businessId: string | null } | null> {
  const { data: owner } = await admin
    .from("wallet_owners")
    .select("owner_type, owner_ref, user_id")
    .eq("id", walletOwnerId)
    .maybeSingle()
  if (!owner) return null
  if (owner.owner_type === "business") {
    return {
      userId: String(owner.user_id ?? owner.owner_ref),
      businessId: String(owner.owner_ref),
    }
  }
  return { userId: String(owner.owner_ref), businessId: null }
}

async function findConvertSessionByRelayRequestId(
  admin: SupabaseClient,
  relayRequestId: string,
): Promise<BalanceConvertSessionRow | null> {
  const { data } = await admin
    .from("balance_convert_sessions")
    .select("id, wallet_owner_id, user_id, direction, source_amount, destination_amount, relay_request_id, status")
    .eq("relay_request_id", relayRequestId)
    .in("status", ["executed"])
    .maybeSingle()
  return (data as BalanceConvertSessionRow | null) ?? null
}

async function applyConvertBalanceDeltas(
  admin: SupabaseClient,
  session: BalanceConvertSessionRow,
): Promise<void> {
  const scope = await resolveConvertOwnerScope(admin, String(session.wallet_owner_id))
  if (!scope) return

  const direction = String(session.direction)
  const sourceCurrency = direction === "usd_to_eur" ? "USD" : "EUR"
  const destCurrency = direction === "usd_to_eur" ? "EUR" : "USD"
  const destAmount = Number(session.destination_amount ?? 0)
  const sourceAmount = Number(session.source_amount ?? 0)
  if (!Number.isFinite(destAmount) || !Number.isFinite(sourceAmount)) return

  await applyWalletBalanceDelta(admin, {
    userId: scope.userId,
    businessId: scope.businessId,
    currency: sourceCurrency as "USD" | "EUR",
    delta: -sourceAmount,
  })
  await applyWalletBalanceDelta(admin, {
    userId: scope.userId,
    businessId: scope.businessId,
    currency: destCurrency as "USD" | "EUR",
    delta: destAmount,
  })
}

/** Complete balance convert when Relay request reaches terminal status. Idempotent. */
export async function settleBalanceConvertByRelayRequestId(
  admin: SupabaseClient,
  input: {
    relayRequestId: string
    request?: RelayRequestV3 | null
  },
): Promise<{ settled: boolean; action: string }> {
  if (!isRelayConfigured()) return { settled: false, action: "relay_not_configured" }

  const relayRequestId = String(input.relayRequestId || "").trim()
  if (!relayRequestId) return { settled: false, action: "missing_relay_request_id" }

  const session = await findConvertSessionByRelayRequestId(admin, relayRequestId)
  if (!session?.id) return { settled: false, action: "no_pending_convert_session" }

  const request = input.request ?? (await relayGetRequestV3(relayRequestId))
  if (!request || !isRelayRequestTerminalV3(String(request.status))) {
    return { settled: false, action: "relay_request_not_terminal" }
  }

  const mapped = mapRelayRequestStatusV3(String(request.status))
  const now = new Date().toISOString()

  if (mapped === "settled") {
    await applyConvertBalanceDeltas(admin, session)
    await admin
      .from("balance_convert_sessions")
      .update({ status: "settled", updated_at: now })
      .eq("id", session.id)
    return { settled: true, action: "convert_settled" }
  }

  await admin
    .from("balance_convert_sessions")
    .update({ status: "failed", updated_at: now })
    .eq("id", session.id)
  return { settled: true, action: "convert_failed" }
}

export async function reconcilePendingBalanceConverts(
  admin: SupabaseClient,
  opts?: { limit?: number },
): Promise<{ scanned: number; settled: number }> {
  if (!isRelayConfigured()) return { scanned: 0, settled: 0 }

  const { data: rows } = await admin
    .from("balance_convert_sessions")
    .select("relay_request_id")
    .eq("status", "executed")
    .not("relay_request_id", "is", null)
    .order("updated_at", { ascending: true })
    .limit(opts?.limit ?? 100)

  let settled = 0
  for (const row of rows ?? []) {
    const relayRequestId = String(row.relay_request_id || "").trim()
    if (!relayRequestId) continue
    const result = await settleBalanceConvertByRelayRequestId(admin, { relayRequestId })
    if (result.settled) settled += 1
  }

  return { scanned: rows?.length ?? 0, settled }
}
