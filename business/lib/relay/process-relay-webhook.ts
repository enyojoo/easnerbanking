import type { SupabaseClient } from "@supabase/supabase-js"
import { relayGetRequestV3 } from "@/lib/relay/client"
import { isRelayConfigured } from "@/lib/relay/config"
import { readRelayDepositAddressV3 } from "@/lib/relay/requests-v3"
import { settleBalanceConvertByRelayRequestId } from "@/lib/balance-convert/settle-convert"
import { syncRelayDepositFromRequestId } from "@/lib/relay-deposit/settle-relay-deposit"
import { reconcileRelayWalletSendByRequestId } from "@/lib/wallet-send/settle-relay-wallet-send"

export type RelayWebhookResult =
  | { ok: true; flow: "wallet_send" | "balance_convert" | "tron_deposit"; action: string }
  | { ok: true; flow: "ignored"; action: string }
  | { ok: false; error: string }

function readRequestId(payload: Record<string, unknown>): string {
  const data = (payload.data ?? {}) as Record<string, unknown>
  return String(data.requestId ?? payload.requestId ?? payload.id ?? "").trim()
}

function readDepositAddress(payload: Record<string, unknown>): string {
  const data = (payload.data ?? {}) as Record<string, unknown>
  const depositObj = data.depositAddress
  if (depositObj && typeof depositObj === "object") {
    const addr = String((depositObj as { address?: string }).address ?? "").trim()
    if (addr) return addr
  }
  return String(payload.depositAddress ?? payload.deposit_address ?? data.depositAddress ?? "").trim()
}

async function hasExecutedConvertSession(
  admin: SupabaseClient,
  relayRequestId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("balance_convert_sessions")
    .select("id")
    .eq("relay_request_id", relayRequestId)
    .eq("status", "executed")
    .maybeSingle()
  return Boolean(data?.id)
}

async function hasPendingWalletSend(
  admin: SupabaseClient,
  relayRequestId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("transactions")
    .select("id")
    .eq("direction", "out")
    .eq("status", "pending")
    .contains("metadata", { relay_request_id: relayRequestId, activity_type: "wallet_send" })
    .limit(1)
  return Boolean(data?.[0]?.id)
}

async function isKnownDepositAddress(admin: SupabaseClient, tronAddress: string): Promise<boolean> {
  if (!tronAddress) return false
  const { data } = await admin
    .from("relay_deposit_addresses")
    .select("id")
    .eq("tron_address", tronAddress)
    .maybeSingle()
  return Boolean(data?.id)
}

/**
 * Route Relay webhook events to the correct settlement handler.
 * Always re-fetches GET /requests/v3 before mutating state.
 */
export async function processRelayWebhookEvent(
  admin: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<RelayWebhookResult> {
  if (!isRelayConfigured()) {
    return { ok: false, error: "relay_not_configured" }
  }

  const relayRequestId = readRequestId(payload)
  const payloadDepositAddress = readDepositAddress(payload)

  if (!relayRequestId && !payloadDepositAddress) {
    return { ok: false, error: "missing_relay_request_id" }
  }

  const request = relayRequestId ? await relayGetRequestV3(relayRequestId) : null
  const depositAddress =
    payloadDepositAddress ||
    (request ? readRelayDepositAddressV3(request) : null) ||
    ""

  if (relayRequestId && (await hasExecutedConvertSession(admin, relayRequestId))) {
    const convert = await settleBalanceConvertByRelayRequestId(admin, {
      relayRequestId,
      request,
    })
    if (convert.settled) {
      return { ok: true, flow: "balance_convert", action: convert.action }
    }
    if (convert.action !== "no_pending_convert_session") {
      return { ok: true, flow: "balance_convert", action: convert.action }
    }
  }

  if (relayRequestId && (await hasPendingWalletSend(admin, relayRequestId))) {
    const walletSend = await reconcileRelayWalletSendByRequestId(admin, {
      relayRequestId,
      request,
    })
    if (walletSend.patched) {
      return { ok: true, flow: "wallet_send", action: walletSend.action }
    }
    return { ok: true, flow: "wallet_send", action: walletSend.action }
  }

  if (
    depositAddress &&
    (await isKnownDepositAddress(admin, depositAddress)) &&
    relayRequestId
  ) {
    const deposit = await syncRelayDepositFromRequestId(admin, {
      relayRequestId,
      depositAddress,
      webhookPayload: payload,
    })
    if (!deposit.ok) return { ok: false, error: deposit.error }
    return { ok: true, flow: "tron_deposit", action: deposit.action }
  }

  if (depositAddress && relayRequestId) {
    const deposit = await syncRelayDepositFromRequestId(admin, {
      relayRequestId,
      depositAddress,
      webhookPayload: payload,
    })
    if (deposit.ok) {
      return { ok: true, flow: "tron_deposit", action: deposit.action }
    }
    if (deposit.error !== "unknown_deposit_address") {
      return { ok: false, error: deposit.error }
    }
  }

  if (relayRequestId && request) {
    const convert = await settleBalanceConvertByRelayRequestId(admin, {
      relayRequestId,
      request,
    })
    if (convert.settled) {
      return { ok: true, flow: "balance_convert", action: convert.action }
    }
    const walletSend = await reconcileRelayWalletSendByRequestId(admin, {
      relayRequestId,
      request,
    })
    if (walletSend.patched) {
      return { ok: true, flow: "wallet_send", action: walletSend.action }
    }
  }

  return { ok: true, flow: "ignored", action: "ignored_unmatched_request" }
}

export async function reconcileAllRelaySettlements(
  admin: SupabaseClient,
  opts?: { depositLimit?: number; convertLimit?: number; walletSendLimit?: number },
): Promise<{
  deposits: Awaited<ReturnType<typeof import("@/lib/relay-deposit/settle-relay-deposit").reconcilePendingRelayDeposits>>
  converts: Awaited<ReturnType<typeof import("@/lib/balance-convert/settle-convert").reconcilePendingBalanceConverts>>
  walletSends: Awaited<ReturnType<typeof import("@/lib/wallet-send/settle-relay-wallet-send").reconcilePendingRelayWalletSends>>
}> {
  const { reconcilePendingRelayDeposits } = await import("@/lib/relay-deposit/settle-relay-deposit")
  const { reconcilePendingBalanceConverts } = await import("@/lib/balance-convert/settle-convert")
  const { reconcilePendingRelayWalletSends } = await import("@/lib/wallet-send/settle-relay-wallet-send")

  const [deposits, converts, walletSends] = await Promise.all([
    reconcilePendingRelayDeposits(admin, { limit: opts?.depositLimit ?? 100 }),
    reconcilePendingBalanceConverts(admin, { limit: opts?.convertLimit ?? 100 }),
    reconcilePendingRelayWalletSends(admin, { limit: opts?.walletSendLimit ?? 100 }),
  ])

  return { deposits, converts, walletSends }
}
