#!/usr/bin/env npx tsx
/**
 * Backfill frozen USD reporting amounts on historical user-visible ledger rows.
 *
 * Usage:
 *   cd business
 *   node --env-file=.env.local --import tsx scripts/backfill-reporting-usd-amount.ts [--days=365] [--dry-run]
 */
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { ensureExchangeRatesFresh } from "@/lib/fx/exchange-rates"
import {
  buildWalletReportingSnapshot,
  buildYcCrossBorderReportingSnapshot,
} from "@/lib/transactions/reporting-snapshot"
import { normalizeWalletReportingCurrency } from "@easner/shared"

function asMeta(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {}
}

async function main() {
  const daysArg = process.argv.find((arg) => arg.startsWith("--days="))
  const days = daysArg
    ? Number.parseInt(daysArg.split("=")[1] ?? "365", 10)
    : 365
  const dryRun = process.argv.includes("--dry-run")
  const since = new Date(
    Date.now() - days * 24 * 60 * 60 * 1000,
  ).toISOString()

  const admin = createSupabaseAdmin()
  const rates = await ensureExchangeRatesFresh(admin)
  const { data: rows, error } = await admin
    .from("transactions")
    .select(
      "id, amount, currency, base_amount, base_currency, metadata, hidden_from_feed",
    )
    .eq("hidden_from_feed", false)
    .gte("created_at", since)
    .limit(5000)
  if (error) throw error

  let scanned = 0
  let patched = 0
  let unavailable = 0

  for (const row of rows ?? []) {
    scanned += 1
    const meta = asMeta(row.metadata)
    if (Number(meta.reporting_usd_amount) > 0) continue

    let patch: Record<string, unknown>
    if (String(meta.yc_mode ?? "") === "cross_border_send") {
      const sourceRate = Number(
        meta.reporting_source_to_usd_rate ??
          meta.easner_sell_from ??
          meta.customer_sell_rate,
      )
      patch = buildYcCrossBorderReportingSnapshot({
        localPayIn: Number(meta.local_pay_in ?? row.amount ?? 0),
        payInCurrency: String(
          meta.local_currency ?? meta.send_currency ?? row.currency ?? "",
        ),
        easnerSellFrom: sourceRate,
        receiveCryptoUsd: Number(meta.receive_crypto_usd),
        sendCryptoUsd: Number(meta.send_crypto_usd),
      })
      if (patch.reporting_amount_unavailable === true) unavailable += 1
    } else if (
      String(row.base_currency ?? "").toUpperCase() === "USD" &&
      Number(row.base_amount) > 0
    ) {
      patch = {
        reporting_usd_amount: Number(row.base_amount),
        reporting_wallet_amount: Math.abs(Number(row.amount ?? 0)),
        reporting_wallet_currency: normalizeWalletReportingCurrency(
          row.currency ?? "USD",
        ),
        reporting_rate_source: "stored_base_amount",
      }
    } else {
      patch = buildWalletReportingSnapshot({
        amount: Number(row.amount ?? 0),
        currency: String(row.currency ?? ""),
        fxRates: rates,
      })
    }

    if (!Object.keys(patch).length) continue
    patched += 1
    if (dryRun) continue

    const { error: updateError } = await admin
      .from("transactions")
      .update({
        metadata: { ...meta, ...patch },
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
    if (updateError) throw updateError
  }

  console.info("[backfill-reporting-usd-amount]", {
    dryRun,
    since,
    scanned,
    patched,
    unavailable,
  })
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
