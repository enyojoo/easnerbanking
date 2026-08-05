/**
 * One-shot historical backfill for Stripe invoice payments:
 * - payment_method brand/last4 (+ customer name/email) on ledger + invoice paymentInfo
 * - stripe_transfer_id on settlements (+ ledger metadata) when charge already has a transfer
 *
 * Usage (from business/):
 *   npx tsx --env-file=.env.local scripts/stripe-invoice-payment-backfill.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/stripe-invoice-payment-backfill.ts --limit=50
 *   npx tsx --env-file=.env.local scripts/stripe-invoice-payment-backfill.ts --apply
 *
 * Default is dry-run. Pass --apply to write.
 */
import { createSupabaseAdmin } from "../lib/supabase/admin"
import { getStripe } from "../lib/stripe/client"
import {
  healStripeInvoicePaymentMetadata,
  stripeInvoiceMetadataNeedsHeal,
} from "../lib/stripe/heal-invoice-payment-metadata"

function parseArgs(argv: string[]) {
  const apply = argv.includes("--apply")
  let limit = 100
  for (const arg of argv) {
    const m = /^--limit=(\d+)$/.exec(arg)
    if (m) limit = Math.max(1, Math.min(500, Number(m[1])))
  }
  return { apply, limit }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function backfillPaymentMethodMetadata(opts: {
  dryRun: boolean
  limit: number
}): Promise<{ scanned: number; candidates: number; healed: number; skipped: number; errors: number }> {
  const admin = createSupabaseAdmin()
  let scanned = 0
  let candidates = 0
  let healed = 0
  let skipped = 0
  let errors = 0
  let cursor: string | null = null
  const pageSize = 50

  while (candidates < opts.limit) {
    let q = admin
      .from("transactions")
      .select("id,easner_transaction_id,metadata,created_at")
      .eq("provider", "stripe")
      .filter("metadata->>source", "eq", "invoice_stripe")
      .order("created_at", { ascending: true })
      .limit(pageSize)

    if (cursor) {
      q = q.gt("created_at", cursor)
    }

    const { data, error } = await q
    if (error) throw error
    if (!data?.length) break

    for (const row of data) {
      scanned += 1
      cursor = typeof row.created_at === "string" ? row.created_at : cursor
      const meta = (row.metadata ?? {}) as Record<string, unknown>
      if (!stripeInvoiceMetadataNeedsHeal(meta)) {
        skipped += 1
        continue
      }

      candidates += 1
      const etid =
        typeof row.easner_transaction_id === "string" ? row.easner_transaction_id : row.id
      const invoiceId =
        typeof meta.invoice_id === "string" ? meta.invoice_id : null

      if (opts.dryRun) {
        console.log(
          JSON.stringify({
            action: "heal_payment_method",
            dry_run: true,
            ledger_id: row.id,
            etid,
            invoice_id: invoiceId,
            has_pm_object: Boolean(meta.payment_method),
            payment_method_type: meta.payment_method_type ?? null,
            has_customer_email: Boolean(meta.customer_email),
            has_customer_name: Boolean(meta.customer_name),
          }),
        )
        healed += 1
        if (candidates >= opts.limit) break
        continue
      }

      try {
        const result = await healStripeInvoicePaymentMetadata(admin, {
          ledgerRowId: String(row.id),
          metadata: meta,
          invoiceId,
        })
        if (result.healed) {
          healed += 1
          console.log(
            JSON.stringify({
              action: "heal_payment_method",
              dry_run: false,
              ledger_id: row.id,
              etid,
              invoice_id: invoiceId,
              payment_method: result.metadata.payment_method ?? null,
              customer_email: result.metadata.customer_email ?? null,
              customer_name: result.metadata.customer_name ?? null,
            }),
          )
        } else {
          console.log(
            JSON.stringify({
              action: "heal_payment_method_noop",
              ledger_id: row.id,
              etid,
            }),
          )
        }
        await sleep(150)
      } catch (e) {
        errors += 1
        console.error(
          JSON.stringify({
            action: "heal_payment_method_error",
            ledger_id: row.id,
            error: e instanceof Error ? e.message : String(e),
          }),
        )
      }

      if (candidates >= opts.limit) break
    }

    if (data.length < pageSize) break
  }

  return { scanned, candidates, healed, skipped, errors }
}

async function backfillMissingTransferIds(opts: {
  dryRun: boolean
  limit: number
}): Promise<{ scanned: number; patched: number; skipped: number; errors: number }> {
  const admin = createSupabaseAdmin()
  const stripe = getStripe()
  let scanned = 0
  let patched = 0
  let skipped = 0
  let errors = 0

  const { data, error } = await admin
    .from("invoice_stripe_settlements")
    .select(
      "id,invoice_id,stripe_charge_id,stripe_payment_intent_id,stripe_transfer_id,ledger_transaction_id,created_at",
    )
    .is("stripe_transfer_id", null)
    .not("stripe_charge_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(opts.limit)

  if (error) throw error

  for (const row of data ?? []) {
    scanned += 1
    const chargeId =
      typeof row.stripe_charge_id === "string" && row.stripe_charge_id.trim()
        ? row.stripe_charge_id.trim()
        : null
    if (!chargeId) {
      skipped += 1
      continue
    }

    try {
      const charge = await stripe.charges.retrieve(chargeId, {
        expand: ["transfer"],
      })
      let transferId: string | null = null
      if (typeof charge.transfer === "string") {
        transferId = charge.transfer
      } else if (charge.transfer && typeof charge.transfer === "object") {
        transferId = charge.transfer.id
      }

      if (!transferId) {
        skipped += 1
        console.log(
          JSON.stringify({
            action: "backfill_transfer_skip",
            settlement_id: row.id,
            charge_id: chargeId,
            reason: "no_transfer_on_charge",
          }),
        )
        await sleep(100)
        continue
      }

      if (opts.dryRun) {
        patched += 1
        console.log(
          JSON.stringify({
            action: "backfill_transfer",
            dry_run: true,
            settlement_id: row.id,
            charge_id: chargeId,
            stripe_transfer_id: transferId,
            ledger_transaction_id: row.ledger_transaction_id,
          }),
        )
        await sleep(100)
        continue
      }

      await admin
        .from("invoice_stripe_settlements")
        .update({
          stripe_transfer_id: transferId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)

      if (row.ledger_transaction_id) {
        const { data: ledgerRow } = await admin
          .from("transactions")
          .select("id,metadata")
          .eq("id", row.ledger_transaction_id)
          .maybeSingle()
        if (ledgerRow?.id && ledgerRow.metadata && typeof ledgerRow.metadata === "object") {
          const meta = { ...(ledgerRow.metadata as Record<string, unknown>) }
          if (!meta.stripe_transfer_id) {
            meta.stripe_transfer_id = transferId
            await admin.from("transactions").update({ metadata: meta }).eq("id", ledgerRow.id)
          }
        }
      }

      patched += 1
      console.log(
        JSON.stringify({
          action: "backfill_transfer",
          dry_run: false,
          settlement_id: row.id,
          charge_id: chargeId,
          stripe_transfer_id: transferId,
          ledger_transaction_id: row.ledger_transaction_id,
        }),
      )
      await sleep(150)
    } catch (e) {
      errors += 1
      console.error(
        JSON.stringify({
          action: "backfill_transfer_error",
          settlement_id: row.id,
          charge_id: chargeId,
          error: e instanceof Error ? e.message : String(e),
        }),
      )
    }
  }

  return { scanned, patched, skipped, errors }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  console.log("=== Stripe invoice payment historical backfill ===")
  console.log(
    JSON.stringify({
      mode: args.apply ? "apply" : "dry-run",
      limit: args.limit,
    }),
  )

  const pm = await backfillPaymentMethodMetadata({
    dryRun: !args.apply,
    limit: args.limit,
  })
  console.log(JSON.stringify({ phase: "payment_method", ...pm }))

  const transfers = await backfillMissingTransferIds({
    dryRun: !args.apply,
    limit: args.limit,
  })
  console.log(JSON.stringify({ phase: "transfer_id", ...transfers }))

  console.log("=== done ===")
  if (!args.apply) {
    console.log("Re-run with --apply to write changes.")
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
