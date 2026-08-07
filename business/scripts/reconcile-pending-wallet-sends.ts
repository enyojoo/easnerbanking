#!/usr/bin/env npx tsx
/**
 * Reconcile pending wallet_send ledger rows (Relay bridge routes).
 */
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { isRelayWalletSendEnabled } from "@/lib/relay/config"
import { reconcileTurnkeySendStatus } from "@/lib/turnkey/send"
import { reconcileRelayWalletSendByRequestId } from "@/lib/wallet-send/settle-relay-wallet-send"

const daysArg = process.argv.find((a) => a.startsWith("--days="))
const days = daysArg ? Number.parseInt(daysArg.split("=")[1] || "7", 10) : 7
const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

function isBridgeExecutionModel(model: string): boolean {
  return model === "relay_bridge" || model === "lifi_bridge"
}

async function reconcileBridgeRow(
  admin: ReturnType<typeof createSupabaseAdmin>,
  _row: Record<string, unknown>,
  meta: Record<string, unknown>,
): Promise<boolean> {
  const relayRequestId = String(meta.relay_request_id ?? "").trim()
  if (!isRelayWalletSendEnabled() || !relayRequestId) return false
  const rec = await reconcileRelayWalletSendByRequestId(admin, { relayRequestId })
  return rec.patched
}

async function main() {
  const admin = createSupabaseAdmin()
  const { data: rows, error } = await admin
    .from("transactions")
    .select(
      "id, provider, provider_transaction_id, status, tx_hash, metadata, user_id, business_id, amount, currency, direction, wallet_address, counterparty_address, asset, chain",
    )
    .eq("direction", "out")
    .in("status", ["pending"])
    .gte("created_at", since)
    .limit(500)

  if (error) {
    console.error("[reconcile-pending-wallet-sends] query_failed", error.message)
    process.exit(1)
  }

  let scanned = 0
  let patched = 0

  for (const row of rows ?? []) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>
    if (meta.activity_type !== "wallet_send") continue
    scanned += 1

    const executionModel = String(meta.execution_model || "")

    try {
      if (executionModel === "direct_turnkey" && row.provider_transaction_id) {
        const subOrgId = String(meta.turnkey_sub_org_id || "").trim()
        if (!subOrgId) continue
        const priorStatus = String(row.status || "")
        const rec = await reconcileTurnkeySendStatus(admin, {
          subOrgId,
          providerTransactionId: String(row.provider_transaction_id),
        })
        if (rec.status !== priorStatus) patched += 1
        continue
      }

      if (isBridgeExecutionModel(executionModel) && row.id) {
        const changed = await reconcileBridgeRow(admin, row, meta)
        if (changed) patched += 1
      }
    } catch (e) {
      console.warn("[reconcile-pending-wallet-sends] row_error", {
        id: row.provider_transaction_id,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  console.info("[reconcile-pending-wallet-sends]", { scanned, patched, since })
}

void main()
