/**
 * Recover the 19 Aug 2026 failed NGN payout: mark ledger failed and sweep
 * 1.50 USDC from Grid internal back to the owner Turnkey vault (no new deposit row).
 *
 *   cd business
 *   node --env-file=.env.local --import tsx scripts/recover-grid-payout-refund-usdc.ts
 */
import { createClient } from "@supabase/supabase-js"
import { startGridPayoutRefundTurnkeySweep } from "../lib/grid/payout-refund-sweep"
import { buildGridRefundExpectedPatch, mergeGridPayoutLifecycle } from "../lib/grid/grid-ledger"

const QUOTE_ID = "Quote:d6be72f5-cf4f-5246-0000-d20f6c9aed5d"
const GRID_TX_ID = "Transaction:01a019e5-f9dd-b78f-0000-ca4c1eed7768"
const CUSTOMER_ID = "Customer:01a008db-9fbc-938e-0000-a3e2e6585384"

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("supabase env missing")
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  const { data: transfer, error: transferErr } = await admin
    .from("grid_transfers")
    .select("id,transaction_id,user_id,business_id,grid_customer_id,status,metadata")
    .eq("grid_quote_id", QUOTE_ID)
    .eq("mode", "balance_payout")
    .maybeSingle()
  if (transferErr) throw transferErr
  if (!transfer?.transaction_id) throw new Error("payout transfer not found")

  const { data: tx, error: txErr } = await admin
    .from("transactions")
    .select("id,user_id,business_id,metadata,status,amount,provider_transaction_id")
    .eq("id", transfer.transaction_id)
    .maybeSingle()
  if (txErr) throw txErr
  if (!tx?.id) throw new Error("payout ledger row not found")

  const prior =
    tx.metadata && typeof tx.metadata === "object" ? (tx.metadata as Record<string, unknown>) : {}
  const easnerPayoutId = String(prior.easner_payout_id ?? "").trim()
  if (!easnerPayoutId) throw new Error("easner_payout_id missing on payout row")

  const now = new Date().toISOString()
  const metadata = buildGridRefundExpectedPatch(
    mergeGridPayoutLifecycle(prior, {
      grid_webhook_status: "FAILED",
      grid_transaction_id: GRID_TX_ID,
      failure_reason: "QUOTE_EXECUTION_FAILED",
      failed_at: now,
    }),
    { refundAmount: 1.5 },
  )

  const { error: updateErr } = await admin
    .from("transactions")
    .update({
      status: "failed",
      metadata,
      updated_at: now,
    })
    .eq("id", tx.id)
  if (updateErr) throw updateErr

  await admin
    .from("grid_transfers")
    .update({ status: "failed", grid_transaction_id: GRID_TX_ID, updated_at: now })
    .eq("id", transfer.id)

  const sweep = await startGridPayoutRefundTurnkeySweep(admin, {
    userId: String(tx.user_id ?? transfer.user_id),
    businessId: tx.business_id ? String(tx.business_id) : transfer.business_id,
    customerId: String(prior.grid_customer_id ?? transfer.grid_customer_id ?? CUSTOMER_ID),
    easnerPayoutId,
    payoutLedgerTransactionId: String(tx.id),
    failedGridTransactionId: GRID_TX_ID,
    requestedAmountUsdc: 1.5,
  })

  console.log(
    JSON.stringify(
      {
        payoutTransactionId: tx.id,
        easnerPayoutId,
        previousStatus: tx.status,
        sweep,
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
