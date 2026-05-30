#!/usr/bin/env npx tsx
/**
 * Reconcile pending wallet_send ledger rows (LI.FI routes).
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/reconcile-pending-wallet-sends.ts [--days=7]
 */
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { lifiGetStatus } from "@/lib/lifi/client"
import { reconcileTurnkeySendStatus } from "@/lib/turnkey/send"

const daysArg = process.argv.find((a) => a.startsWith("--days="))
const days = daysArg ? Number.parseInt(daysArg.split("=")[1] || "7", 10) : 7
const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

async function main() {
  const admin = createSupabaseAdmin()
  const { data: rows, error } = await admin
    .from("ledger_transactions")
    .select("provider, provider_transaction_id, status, tx_hash, metadata, user_id, business_id")
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
    const txHash = String(row.tx_hash || "").trim()

    try {
      if (executionModel === "direct_turnkey" && row.provider_transaction_id) {
        const subOrgId = String(meta.turnkey_sub_org_id || "").trim()
        if (!subOrgId) continue
        const rec = await reconcileTurnkeySendStatus(admin, {
          subOrgId,
          providerTransactionId: String(row.provider_transaction_id),
        })
        if (rec.status !== row.status) patched += 1
        continue
      }

      if (executionModel === "lifi_bridge" && txHash) {
        const status = await lifiGetStatus(txHash)
        const next = String(status.status || "").toUpperCase()
        if (next === "DONE" || next === "FAILED") patched += 1
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
