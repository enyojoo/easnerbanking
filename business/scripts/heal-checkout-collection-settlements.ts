/**
 * Backfill checkout (payment link / embed) ledger rows from Stripe:
 * payer email/name and Connect application fee (merchant net).
 *
 * Usage (from business/):
 *   npx tsx --env-file=.env.local scripts/heal-checkout-collection-settlements.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/heal-checkout-collection-settlements.ts --apply
 *   npx tsx --env-file=.env.local scripts/heal-checkout-collection-settlements.ts --apply --pi=pi_xxx,pi_yyy
 */
import { createSupabaseAdmin } from "../lib/supabase/admin"
import { healCheckoutCollectionMetadata } from "../lib/stripe/heal-checkout-collection-metadata"

function parseArgs(argv: string[]) {
  const apply = argv.includes("--apply")
  const piArg = argv.find((a) => a.startsWith("--pi="))
  const pis = piArg
    ? piArg
        .slice("--pi=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : []
  let limit = 50
  for (const arg of argv) {
    const m = /^--limit=(\d+)$/.exec(arg)
    if (m) limit = Math.max(1, Math.min(200, Number(m[1])))
  }
  return { apply, pis, limit }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const admin = createSupabaseAdmin()
  console.log(
    JSON.stringify({
      mode: args.apply ? "apply" : "dry-run",
      pis: args.pis,
      limit: args.limit,
    }),
  )

  let q = admin
    .from("transactions")
    .select("id,easner_transaction_id,amount,metadata,provider_transaction_id")
    .eq("provider", "stripe")
    .filter("metadata->>source", "eq", "checkout_stripe")
    .order("created_at", { ascending: false })
    .limit(args.limit)

  if (args.pis.length === 1) {
    q = q.eq("provider_transaction_id", args.pis[0])
  } else if (args.pis.length > 1) {
    q = q.in("provider_transaction_id", args.pis)
  }

  const { data, error } = await q
  if (error) throw error

  let healed = 0
  let skipped = 0
  let errors = 0

  for (const row of data ?? []) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>
    const piId = String(row.provider_transaction_id ?? meta.stripe_payment_intent_id ?? "")
    const etid = String(row.easner_transaction_id ?? row.id)

    if (!args.apply) {
      console.log(
        JSON.stringify({
          action: "heal_checkout",
          dry_run: true,
          etid,
          pi: piId,
          has_email: Boolean(meta.customer_email),
          fee_cents: meta.fee_cents ?? null,
          net_cents: meta.net_cents ?? null,
          amount: row.amount,
        }),
      )
      healed += 1
      continue
    }

    try {
      const result = await healCheckoutCollectionMetadata(admin, {
        ledgerRowId: String(row.id),
        metadata: meta,
      })
      if (result.healed) {
        healed += 1
        console.log(
          JSON.stringify({
            action: "heal_checkout",
            etid,
            pi: piId,
            customer_email: result.metadata.customer_email ?? null,
            fee_cents: result.metadata.fee_cents ?? null,
            net_cents: result.metadata.net_cents ?? null,
          }),
        )
      } else {
        skipped += 1
        console.log(JSON.stringify({ action: "heal_checkout_noop", etid, pi: piId }))
      }
      await sleep(150)
    } catch (e) {
      errors += 1
      console.error(
        JSON.stringify({
          action: "heal_checkout_error",
          etid,
          error: e instanceof Error ? e.message : String(e),
        }),
      )
    }
  }

  console.log(JSON.stringify({ healed, skipped, errors, scanned: data?.length ?? 0 }))
  if (!args.apply) console.log("Re-run with --apply to write changes.")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
