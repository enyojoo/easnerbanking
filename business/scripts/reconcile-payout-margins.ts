/**
 * Backfill margin reconciliation metadata on recent global payout OUT rows.
 * Usage: npx tsx business/scripts/reconcile-payout-margins.ts [--days=7]
 */
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  buildGlobalPayoutMarginReconciliationPatch,
  pickNoahBreakdownAmount,
} from "@/lib/noah/reconcile-payout-margin"

async function main() {
  const daysArg = process.argv.find((a) => a.startsWith("--days="))
  const days = daysArg ? Number.parseInt(daysArg.split("=")[1] ?? "7", 10) : 7
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const admin = createSupabaseAdmin()
  const { data: rows, error } = await admin
    .from("transactions")
    .select("id, metadata, payload, status")
    .eq("provider", "noah")
    .eq("direction", "out")
    .eq("status", "settled")
    .gte("occurred_at", since)
    .filter("metadata->>payout_type", "eq", "global_fiat")

  if (error) throw error

  let patched = 0
  for (const row of rows ?? []) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>
    if (meta.margin_reconciled === true) continue
    const payload = (row.payload ?? {}) as Record<string, unknown>
    const businessFee = pickNoahBreakdownAmount(payload, "BusinessFee")
    if (businessFee == null) continue

    const { patch } = buildGlobalPayoutMarginReconciliationPatch({
      transactionId: row.id,
      priorMetadata: meta,
      txData: payload,
    })
    if (!Object.keys(patch).length) continue

    await admin
      .from("transactions")
      .update({ metadata: { ...meta, ...patch } })
      .eq("id", row.id)
    patched += 1
  }

  console.info("[reconcile-payout-margins]", { scanned: rows?.length ?? 0, patched, since })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
