/**
 * Dual-write cutover: copy invoice checkout sessions/settlements into the unified
 * Collections tables. Safe to re-run (skips rows that already exist).
 *
 * Usage (from business/):
 *   npx tsx --env-file=.env.local scripts/backfill-online-checkout-sessions.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/backfill-online-checkout-sessions.ts --apply
 */
import { createSupabaseAdmin } from "../lib/supabase/admin"

function parseArgs(argv: string[]) {
  const apply = argv.includes("--apply")
  let limit = 200
  for (const arg of argv) {
    const m = /^--limit=(\d+)$/.exec(arg)
    if (m) limit = Math.max(1, Math.min(1000, Number(m[1])))
  }
  return { apply, limit }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const admin = createSupabaseAdmin()
  console.log(JSON.stringify({ mode: args.apply ? "apply" : "dry-run", limit: args.limit }))

  const { data: sessions, error: sessionError } = await admin
    .from("invoice_checkout_sessions")
    .select(
      "id, invoice_id, business_id, easner_settlement_id, status, gross_cents, listed_amount_cents, application_fee_cents, fee_cents, net_cents, fee_mode, currency, customer_email, idempotency_key, stripe_connected_account_id, stripe_checkout_session_id, stripe_payment_intent_id, payment_method_type, completed_at, created_at",
    )
    .order("created_at", { ascending: true })
    .limit(args.limit)
  if (sessionError) throw sessionError

  let sessionCopied = 0
  let sessionSkipped = 0
  for (const row of sessions ?? []) {
    const settlementId = String(row.easner_settlement_id ?? "")
    if (!settlementId) {
      sessionSkipped += 1
      continue
    }
    const { data: existing } = await admin
      .from("online_checkout_sessions")
      .select("id")
      .eq("easner_settlement_id", settlementId)
      .maybeSingle()
    if (existing?.id) {
      sessionSkipped += 1
      continue
    }
    if (!args.apply) {
      console.log(JSON.stringify({ action: "copy_session", dry_run: true, settlementId }))
      sessionCopied += 1
      continue
    }
    const { error } = await admin.from("online_checkout_sessions").insert({
      id: row.id,
      business_id: row.business_id,
      source: "invoice",
      invoice_id: row.invoice_id,
      mode: "payment",
      status: row.status,
      fee_mode: row.fee_mode,
      easner_settlement_id: settlementId,
      idempotency_key: row.idempotency_key,
      listed_amount_cents: row.listed_amount_cents,
      gross_cents: row.gross_cents,
      application_fee_cents: row.application_fee_cents,
      fee_cents: row.fee_cents,
      net_cents: row.net_cents,
      currency: row.currency,
      customer_email: row.customer_email,
      stripe_connected_account_id: row.stripe_connected_account_id,
      stripe_checkout_session_id: row.stripe_checkout_session_id,
      stripe_payment_intent_id: row.stripe_payment_intent_id,
      payment_method_type: row.payment_method_type,
      livemode: true,
      metadata: {},
      completed_at: row.completed_at,
      created_at: row.created_at,
    })
    if (error) {
      console.error(JSON.stringify({ action: "copy_session", error: error.message, settlementId }))
      continue
    }
    sessionCopied += 1
  }

  const { data: settlements, error: settlementError } = await admin
    .from("invoice_stripe_settlements")
    .select(
      "id, invoice_id, business_id, stripe_payment_intent_id, stripe_charge_id, stripe_connected_account_id, stripe_transfer_id, gross_cents, fee_cents, net_cents, currency, phase, ledger_transaction_id, stripe_event_ids, created_at, updated_at",
    )
    .order("created_at", { ascending: true })
    .limit(args.limit)
  if (settlementError) throw settlementError

  let settlementCopied = 0
  let settlementSkipped = 0
  for (const row of settlements ?? []) {
    const { data: existing } = await admin
      .from("checkout_stripe_settlements")
      .select("id")
      .eq("id", row.id)
      .maybeSingle()
    if (existing?.id) {
      settlementSkipped += 1
      continue
    }
    if (!args.apply) {
      console.log(JSON.stringify({ action: "copy_settlement", dry_run: true, id: row.id }))
      settlementCopied += 1
      continue
    }
    const { error } = await admin.from("checkout_stripe_settlements").insert({
      id: row.id,
      business_id: row.business_id,
      invoice_id: row.invoice_id,
      source: "invoice",
      stripe_payment_intent_id: row.stripe_payment_intent_id,
      stripe_charge_id: row.stripe_charge_id,
      stripe_connected_account_id: row.stripe_connected_account_id,
      stripe_transfer_id: row.stripe_transfer_id,
      gross_cents: row.gross_cents,
      fee_cents: row.fee_cents,
      net_cents: row.net_cents,
      currency: row.currency,
      phase: row.phase,
      ledger_transaction_id: row.ledger_transaction_id,
      stripe_event_ids: row.stripe_event_ids ?? [],
      created_at: row.created_at,
      updated_at: row.updated_at,
    })
    if (error) {
      console.error(JSON.stringify({ action: "copy_settlement", error: error.message, id: row.id }))
      continue
    }
    settlementCopied += 1
  }

  console.log(
    JSON.stringify({
      sessions: { copied: sessionCopied, skipped: sessionSkipped },
      settlements: { copied: settlementCopied, skipped: settlementSkipped },
    }),
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
