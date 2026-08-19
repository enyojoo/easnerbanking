/**
 * Reconcile stuck Stripe Connect invoice settlements.
 *
 * Usage (from business/):
 *   npx tsx scripts/stripe-connect-reconcile-settlements.ts
 *   npx tsx scripts/stripe-connect-reconcile-settlements.ts --heal
 *
 * Flags settlements:
 * - payment_received older than 7 days (transfer may be stuck / payout delayed)
 * - payout_sent older than 14 days without credited
 *
 * --heal attaches the Aug 2026 EASNER Connect Grid inbound to invoice ETID94909659
 * (no second wallet credit) and deletes the mistaken bank-deposit row.
 * Leaves the Bridge Building Dashboard deposit alone.
 */
import { createSupabaseAdmin } from "../lib/supabase/admin"

const HEAL_BUSINESS_ID = "4769329d-a171-49cf-8647-7e9b8a0128d3"
const HEAL_SETTLEMENT_ID = "9c28a922-9242-4a51-87e9-5d69520a3a1f"
const HEAL_STRIPE_LEDGER_ID = "b27b7b76-0235-4291-a8cd-87c9104b2511"
const HEAL_EASNER_GRID_TX = "Transaction:01a0182e-5173-da6a-0000-d7235d231cb8"
const HEAL_EASNER_LEDGER_ID = "bf85e3e4-947d-46fb-aadb-1e243675bc53"
const HEAL_BRIDGE_LEDGER_ID = "6031f322-8a0f-4cbf-b4df-1312304f1d35"

async function healEasnerConnectInbound(
  admin: ReturnType<typeof createSupabaseAdmin>,
  apply: boolean,
): Promise<void> {
  const now = new Date().toISOString()
  const { data: settlement } = await admin
    .from("invoice_stripe_settlements")
    .select("id,invoice_id,phase,ledger_transaction_id,business_id")
    .eq("id", HEAL_SETTLEMENT_ID)
    .maybeSingle()
  const { data: easnerRow } = await admin
    .from("transactions")
    .select("id,metadata,hidden_from_feed,easner_transaction_id")
    .eq("id", HEAL_EASNER_LEDGER_ID)
    .maybeSingle()
  const { data: stripeRow } = await admin
    .from("transactions")
    .select("id,metadata,status,easner_transaction_id")
    .eq("id", HEAL_STRIPE_LEDGER_ID)
    .maybeSingle()
  const { data: bridgeRow } = await admin
    .from("transactions")
    .select("id,hidden_from_feed,easner_transaction_id")
    .eq("id", HEAL_BRIDGE_LEDGER_ID)
    .maybeSingle()

  console.log("=== heal EASNER Connect inbound (Aug 2026) ===")
  console.log(
    JSON.stringify({
      apply,
      settlement_phase: settlement?.phase ?? null,
      stripe_etid: stripeRow?.easner_transaction_id ?? null,
      stripe_status: stripeRow?.status ?? null,
      easner_etid: easnerRow?.easner_transaction_id ?? null,
      easner_hidden: easnerRow?.hidden_from_feed ?? null,
      bridge_etid: bridgeRow?.easner_transaction_id ?? null,
      bridge_hidden: bridgeRow?.hidden_from_feed ?? null,
    }),
  )

  if (!apply) {
    console.log("pass --heal to credit ETID94909659 from EASNER ETID97792716 (no wallet delta)")
    return
  }
  if (!settlement?.id || !stripeRow?.id) {
    console.log("heal skipped: missing settlement or stripe ledger rows")
    return
  }
  if (settlement.business_id !== HEAL_BUSINESS_ID) {
    throw new Error("heal aborted: unexpected business_id")
  }

  const stripeMeta =
    stripeRow.metadata && typeof stripeRow.metadata === "object"
      ? { ...(stripeRow.metadata as Record<string, unknown>) }
      : {}
  if (settlement.phase !== "credited") {
    await admin
      .from("invoice_stripe_settlements")
      .update({ phase: "credited", credited_at: now, updated_at: now })
      .eq("id", HEAL_SETTLEMENT_ID)
  }

  await admin
    .from("transactions")
    .update({
      status: "settled",
      settled_at: now,
      metadata: {
        ...stripeMeta,
        settlement_phase: "credited",
        credited_at: now,
        grid_transaction_id: HEAL_EASNER_GRID_TX,
        stripe_connect_va_originator: "EASNER",
      },
    })
    .eq("id", HEAL_STRIPE_LEDGER_ID)

  const { error: deleteError } = await admin
    .from("transactions")
    .delete()
    .eq("id", HEAL_EASNER_LEDGER_ID)
  if (deleteError) throw deleteError

  if (settlement.invoice_id) {
    const { data: inv } = await admin
      .from("invoices")
      .select("metadata")
      .eq("id", settlement.invoice_id)
      .maybeSingle()
    if (inv?.metadata && typeof inv.metadata === "object") {
      const meta = { ...(inv.metadata as Record<string, unknown>) }
      const paymentInfo = (meta.paymentInfo ?? {}) as Record<string, unknown>
      const stripeInfo = (paymentInfo.stripe ?? {}) as Record<string, unknown>
      meta.paymentInfo = {
        ...paymentInfo,
        stripe: { ...stripeInfo, settlementPhase: "credited" },
      }
      await admin.from("invoices").update({ metadata: meta }).eq("id", settlement.invoice_id)
    }
  }

  console.log(
    JSON.stringify({
      healed: true,
      credited_settlement: HEAL_SETTLEMENT_ID,
      credited_stripe_ledger: HEAL_STRIPE_LEDGER_ID,
      deleted_easner_deposit: HEAL_EASNER_LEDGER_ID,
      left_bridge_building: HEAL_BRIDGE_LEDGER_ID,
      wallet_delta: false,
    }),
  )
}

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

  await healEasnerConnectInbound(admin, process.argv.includes("--heal"))

  console.log("=== done ===")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
