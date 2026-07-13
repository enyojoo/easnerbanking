#!/usr/bin/env npx tsx
/**
 * Reconcile pending wallet_send ledger rows (LI.FI routes).
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/reconcile-pending-wallet-sends.ts [--days=7]
 */
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { lifiGetStatus } from "@/lib/lifi/client"
import { reconcileTurnkeySendStatus } from "@/lib/turnkey/send"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { captureWalletSendFeeLegIfPending } from "@/lib/processing-fee/capture-pending-processing-fee"

const daysArg = process.argv.find((a) => a.startsWith("--days="))
const days = daysArg ? Number.parseInt(daysArg.split("=")[1] || "7", 10) : 7
const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

async function main() {
  const admin = createSupabaseAdmin()
  const { data: rows, error } = await admin
    .from("transactions")
    .select("id, provider, provider_transaction_id, status, tx_hash, metadata, user_id, business_id, amount, currency, direction, wallet_address, counterparty_address, asset, chain")
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
    const userId = String(row.user_id || "")
    const businessId = row.business_id != null ? String(row.business_id) : null

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

      if (executionModel === "lifi_bridge" && txHash && row.id) {
        const status = await lifiGetStatus(txHash)
        const next = String(status.status || "").toUpperCase()
        if (next === "DONE") {
          const occurredAt = new Date().toISOString()
          await upsertLedgerTransaction(admin, {
            userId,
            businessId,
            provider: "lifi",
            providerTransactionId: String(row.provider_transaction_id),
            status: "settled",
            amount: Number(row.amount ?? 0),
            currency: String(row.currency ?? "USD"),
            direction: "out",
            occurredAt,
            settledAt: occurredAt,
            txHash,
            walletAddress: row.wallet_address ? String(row.wallet_address) : null,
            counterpartyAddress: row.counterparty_address ? String(row.counterparty_address) : null,
            asset: row.asset ? String(row.asset) : null,
            chain: row.chain ? String(row.chain) : null,
            metadata: meta,
            baseCurrency: String(row.currency ?? "USD"),
          })
          await captureWalletSendFeeLegIfPending(admin, {
            transactionId: String(row.id),
            userId,
            businessId,
          }).catch((e) => console.warn("wallet_send_fee_capture:", e))
          patched += 1
        } else if (next === "FAILED") {
          await upsertLedgerTransaction(admin, {
            userId,
            businessId,
            provider: "lifi",
            providerTransactionId: String(row.provider_transaction_id),
            status: "failed",
            amount: Number(row.amount ?? 0),
            currency: String(row.currency ?? "USD"),
            direction: "out",
            txHash,
            metadata: meta,
            baseCurrency: String(row.currency ?? "USD"),
          })
          patched += 1
        }
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
