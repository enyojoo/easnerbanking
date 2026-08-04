/**
 * Reconcile stuck Stripe Connect invoice settlements.
 *
 * Usage (from business/):
 *   npx tsx scripts/stripe-connect-reconcile-settlements.ts
 *
 * Flags settlements:
 * - payment_received older than 7 days (transfer may be stuck / payout delayed)
 * - payout_sent older than 14 days without credited
 */
import { createSupabaseAdmin } from "../lib/supabase/admin"

async function main() {
  const admin = createSupabaseAdmin()
  const now = Date.now()
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()
  const fourteenDaysAgo = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString()

  const { data: stuckPayment, error: e1 } = await admin
    .from("invoice_stripe_settlements")
    .select(
      "id,invoice_id,business_id,phase,net_cents,currency,stripe_connected_account_id,stripe_transfer_id,created_at",
    )
    .eq("phase", "payment_received")
    .lt("created_at", sevenDaysAgo)
    .order("created_at", { ascending: true })
    .limit(100)

  if (e1) throw e1

  const { data: stuckPayout, error: e2 } = await admin
    .from("invoice_stripe_settlements")
    .select(
      "id,invoice_id,business_id,phase,net_cents,currency,stripe_payout_id,grid_transfer_id,expected_arrival_at,created_at",
    )
    .eq("phase", "payout_sent")
    .lt("created_at", fourteenDaysAgo)
    .order("created_at", { ascending: true })
    .limit(100)

  if (e2) throw e2

  console.log("=== Stripe Connect settlement reconcile ===")
  console.log(`payment_received > 7d: ${stuckPayment?.length ?? 0}`)
  for (const row of stuckPayment ?? []) {
    console.log(
      JSON.stringify({
        alert: "payment_received_stale",
        id: row.id,
        business_id: row.business_id,
        invoice_id: row.invoice_id,
        net_cents: row.net_cents,
        currency: row.currency,
        stripe_connected_account_id: row.stripe_connected_account_id,
        stripe_transfer_id: row.stripe_transfer_id,
        created_at: row.created_at,
      }),
    )
  }

  console.log(`payout_sent > 14d: ${stuckPayout?.length ?? 0}`)
  for (const row of stuckPayout ?? []) {
    console.log(
      JSON.stringify({
        alert: "payout_sent_not_credited",
        id: row.id,
        business_id: row.business_id,
        invoice_id: row.invoice_id,
        net_cents: row.net_cents,
        currency: row.currency,
        stripe_payout_id: row.stripe_payout_id,
        grid_transfer_id: row.grid_transfer_id,
        expected_arrival_at: row.expected_arrival_at,
        created_at: row.created_at,
      }),
    )
  }

  // Cross-check: payment_received with transfer but no pending grid_transfers expectation
  for (const row of stuckPayment ?? []) {
    if (!row.stripe_connected_account_id) continue
    const { count } = await admin
      .from("grid_transfers")
      .select("id", { count: "exact", head: true })
      .eq("mode", "stripe_settlement")
      .eq("business_id", row.business_id)
      .eq("status", "pending")
    if ((count ?? 0) === 0) {
      console.log(
        JSON.stringify({
          alert: "payment_received_no_pending_grid_transfer",
          settlement_id: row.id,
          business_id: row.business_id,
          stripe_transfer_id: row.stripe_transfer_id,
        }),
      )
    }
  }

  console.log("=== done ===")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
