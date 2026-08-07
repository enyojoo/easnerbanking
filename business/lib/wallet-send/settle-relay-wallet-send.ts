import type { SupabaseClient } from "@supabase/supabase-js"
import { relayGetRequestV3 } from "@/lib/relay/client"
import {
  extractRelayOutTxHashesV3,
  isRelayRequestTerminalV3,
  mapRelayRequestStatusV3,
} from "@/lib/relay/requests-v3"
import type { RelayRequestV3 } from "@/lib/relay/types"
import { isRelayWalletSendEnabled } from "@/lib/relay/config"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { captureWalletSendFeeLegIfPending } from "@/lib/processing-fee/capture-pending-processing-fee"

type WalletSendLedgerRow = {
  id: string
  provider: string
  provider_transaction_id: string | null
  status: string
  tx_hash: string | null
  metadata: unknown
  user_id: string | null
  business_id: string | null
  amount: number | null
  currency: string | null
  wallet_address: string | null
  counterparty_address: string | null
  asset: string | null
  chain: string | null
}

function asMeta(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
}

async function findPendingWalletSendByRelayRequestId(
  admin: SupabaseClient,
  relayRequestId: string,
): Promise<WalletSendLedgerRow | null> {
  const { data: rows } = await admin
    .from("transactions")
    .select(
      "id, provider, provider_transaction_id, status, tx_hash, metadata, user_id, business_id, amount, currency, wallet_address, counterparty_address, asset, chain",
    )
    .eq("direction", "out")
    .eq("status", "pending")
    .contains("metadata", { relay_request_id: relayRequestId, activity_type: "wallet_send" })
    .limit(1)

  return (rows?.[0] as WalletSendLedgerRow | undefined) ?? null
}

/** Settle a pending relay_bridge wallet_send row when Relay request reaches terminal status. */
export async function reconcileRelayWalletSendByRequestId(
  admin: SupabaseClient,
  input: {
    relayRequestId: string
    request?: RelayRequestV3 | null
  },
): Promise<{ patched: boolean; action: string }> {
  if (!isRelayWalletSendEnabled()) {
    return { patched: false, action: "relay_wallet_send_disabled" }
  }

  const relayRequestId = String(input.relayRequestId || "").trim()
  if (!relayRequestId) return { patched: false, action: "missing_relay_request_id" }

  const row = await findPendingWalletSendByRelayRequestId(admin, relayRequestId)
  if (!row?.id) return { patched: false, action: "no_pending_wallet_send" }

  const meta = asMeta(row.metadata)
  const executionModel = String(meta.execution_model || "")
  if (executionModel !== "relay_bridge") {
    return { patched: false, action: "not_relay_bridge_send" }
  }

  const request = input.request ?? (await relayGetRequestV3(relayRequestId))
  if (!request || !isRelayRequestTerminalV3(String(request.status))) {
    return { patched: false, action: "relay_request_not_terminal" }
  }

  const mapped = mapRelayRequestStatusV3(String(request.status))
  const fillHashes = extractRelayOutTxHashesV3(request)
  const txHash = fillHashes[0] ?? (String(row.tx_hash || "").trim() || null)
  const userId = String(row.user_id || "")
  const businessId = row.business_id != null ? String(row.business_id) : null
  const occurredAt = new Date().toISOString()

  await upsertLedgerTransaction(admin, {
    userId,
    businessId,
    provider: "relay",
    providerTransactionId: String(row.provider_transaction_id),
    status: mapped,
    amount: Number(row.amount ?? 0),
    currency: String(row.currency ?? "USD"),
    direction: "out",
    occurredAt,
    ...(mapped === "settled" ? { settledAt: occurredAt } : {}),
    txHash,
    walletAddress: row.wallet_address ? String(row.wallet_address) : null,
    counterpartyAddress: row.counterparty_address ? String(row.counterparty_address) : null,
    asset: row.asset ? String(row.asset) : null,
    chain: row.chain ? String(row.chain) : null,
    metadata: meta,
    baseCurrency: String(row.currency ?? "USD"),
  })

  if (mapped === "settled") {
    await captureWalletSendFeeLegIfPending(admin, {
      transactionId: String(row.id),
      userId,
      businessId,
    }).catch(() => undefined)
  }

  return { patched: true, action: mapped === "settled" ? "wallet_send_settled" : "wallet_send_failed" }
}

export async function reconcilePendingRelayWalletSends(
  admin: SupabaseClient,
  opts?: { sinceIso?: string; limit?: number },
): Promise<{ scanned: number; patched: number }> {
  const sinceIso =
    opts?.sinceIso ??
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: rows, error } = await admin
    .from("transactions")
    .select("metadata")
    .eq("direction", "out")
    .eq("status", "pending")
    .gte("created_at", sinceIso)
    .limit(opts?.limit ?? 200)

  if (error) throw error

  let scanned = 0
  let patched = 0
  const seen = new Set<string>()

  for (const row of rows ?? []) {
    const meta = asMeta(row.metadata)
    if (meta.activity_type !== "wallet_send") continue
    const executionModel = String(meta.execution_model || "")
    if (executionModel !== "relay_bridge") continue
    const relayRequestId = String(meta.relay_request_id ?? "").trim()
    if (!relayRequestId || seen.has(relayRequestId)) continue
    seen.add(relayRequestId)
    scanned += 1
    const result = await reconcileRelayWalletSendByRequestId(admin, { relayRequestId })
    if (result.patched) patched += 1
  }

  return { scanned, patched }
}
