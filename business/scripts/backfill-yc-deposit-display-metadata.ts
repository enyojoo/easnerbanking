/**
 * Backfill deposit_review + display titles for legacy YC fund_balance transactions.
 *
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/backfill-yc-deposit-display-metadata.ts
 *   --dry-run   print rows only
 */
import { createClient } from "@supabase/supabase-js"
import {
  buildYcFundBalanceDepositReviewSnapshot,
  reconstructYcFundBalanceDepositReview,
  resolveYcFundBalanceDepositTitle,
} from "@easner/shared"

function asMeta(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
}

async function main() {
  const dryRun = process.argv.includes("--dry-run")
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
  if (!supabaseUrl || !serviceRoleKey) throw new Error("supabase_not_configured")

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: rows, error } = await admin
    .from("transactions")
    .select("id, metadata, easner_transaction_id")
    .eq("provider", "yellowcard")
    .filter("metadata->>yc_mode", "eq", "fund_balance")
    .is("metadata->deposit_review", null)

  if (error) throw error

  let updated = 0
  for (const row of rows ?? []) {
    const meta = asMeta(row.metadata)
    const { data: transfer } = await admin
      .from("yc_transfers")
      .select("customer_rate, pay_in_currency, quoted_pay_in, metadata")
      .eq("transaction_id", row.id)
      .eq("mode", "fund_balance")
      .maybeSingle()

    const customerRate =
      transfer?.customer_rate != null
        ? Number(transfer.customer_rate)
        : typeof meta.customer_rate === "number"
          ? meta.customer_rate
          : Number(meta.customer_rate)

    const review =
      reconstructYcFundBalanceDepositReview(meta, customerRate) ??
      buildYcFundBalanceDepositReviewSnapshot({
        localPayIn: Number(meta.local_pay_in ?? transfer?.quoted_pay_in ?? 0),
        localCurrency: String(meta.local_currency ?? transfer?.pay_in_currency ?? "NGN"),
        usdCredit: Number(meta.usd_credit ?? 0),
        processingFee: Number(meta.processing_fee ?? 0),
        exchangeRate: Number.isFinite(customerRate) ? customerRate : 0,
        residenceCountry: String(meta.residence_country ?? ""),
        payInRail:
          String(meta.pay_in_rail ?? "").trim().toLowerCase() === "mobile_money"
            ? "mobile_money"
            : "bank_transfer",
      })

    const depositDisplayTitle = resolveYcFundBalanceDepositTitle({
      residenceCountry: review.residence_country,
      payInRail: review.pay_in_rail,
      localCurrency: review.local_currency,
    })

    const patch = {
      ...meta,
      deposit_review: review,
      deposit_display_title: depositDisplayTitle,
      display_hero_title: depositDisplayTitle,
      residence_country: review.residence_country || meta.residence_country,
      pay_in_rail: review.pay_in_rail,
      customer_rate: review.exchange_rate || customerRate || meta.customer_rate,
    }

    if (dryRun) {
      console.log(
        JSON.stringify({
          id: row.id,
          easner_transaction_id: row.easner_transaction_id,
          deposit_display_title: depositDisplayTitle,
        }),
      )
      continue
    }

    const { error: upErr } = await admin
      .from("transactions")
      .update({ metadata: patch, updated_at: new Date().toISOString() })
      .eq("id", row.id)
    if (upErr) throw upErr
    updated += 1
  }

  console.log(JSON.stringify({ ok: true, dryRun, candidates: rows?.length ?? 0, updated }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
