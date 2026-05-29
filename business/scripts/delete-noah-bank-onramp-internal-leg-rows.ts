/**
 * Remove internal bank-on-ramp legs that should never have been persisted:
 * - Noah orchestration Out (Solana send to wallet)
 * - Turnkey inbound mirrors of the same settlement
 *
 * User-facing record is the Noah fiat pay-in (OffNetwork + FiatPayment) only.
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/delete-noah-bank-onramp-internal-leg-rows.ts --dry-run
 *   cd business && node --env-file=.env.local --import tsx scripts/delete-noah-bank-onramp-internal-leg-rows.ts
 */
import { createSupabaseAdmin } from "../lib/supabase/admin"
import { applyWalletBalanceDelta } from "../lib/wallet/wallet-balances-db"
import { isNoahBankOnrampOrchestrationOutLeg } from "../lib/noah/bank-onramp-tx"
import { pickNoahOnChainTxHashFromLedgerRow } from "../lib/noah/noah-on-chain-tx-hash"

const dryRun = process.argv.includes("--dry-run")

async function main() {
  const admin = createSupabaseAdmin()

  const { data: noahRows, error: noahErr } = await admin
    .from("transactions")
    .select("id, metadata, payload, direction, provider")
    .eq("provider", "noah")
    .eq("direction", "out")
  if (noahErr) throw noahErr

  const noahDeleteIds: string[] = []
  for (const row of noahRows ?? []) {
    const payload = (row.payload as Record<string, unknown> | undefined) ?? {}
    const meta = (row.metadata as Record<string, unknown> | undefined) ?? {}
    if (
      meta.noah_orchestration_settlement_leg === true ||
      meta.flow === "bank_onramp" ||
      isNoahBankOnrampOrchestrationOutLeg(payload)
    ) {
      noahDeleteIds.push(String(row.id))
    }
  }

  const payInHashes = new Set<string>()
  const { data: payIns } = await admin
    .from("transactions")
    .select("tx_hash, metadata, payload")
    .eq("provider", "noah")
    .eq("direction", "in")
  for (const row of payIns ?? []) {
    const h = pickNoahOnChainTxHashFromLedgerRow(row)
    if (h) payInHashes.add(h)
  }

  const { data: tkRows, error: tkErr } = await admin
    .from("transactions")
    .select("id, tx_hash, user_id, business_id, metadata, amount, currency, direction, provider")
    .eq("provider", "turnkey")
    .eq("direction", "in")
  if (tkErr) throw tkErr

  const turnkeyDeleteIds: string[] = []
  for (const row of tkRows ?? []) {
    const meta = (row.metadata as Record<string, unknown> | undefined) ?? {}
    const h = String(row.tx_hash ?? "").trim()
    const mirror =
      meta.noah_bank_onramp_chain_mirror === true ||
      meta.suppress_in_feed === true ||
      (h && payInHashes.has(h))
    if (!mirror) continue
    turnkeyDeleteIds.push(String(row.id))

    const reverseBalance =
      meta.balance_delta_applied === true && !meta.noah_bank_onramp_mirror_reversed
    const amount = Number(row.amount ?? 0)
    if (!dryRun && reverseBalance && Number.isFinite(amount) && amount > 0) {
      await applyWalletBalanceDelta(admin, {
        businessId: row.business_id != null ? String(row.business_id) : null,
        userId: row.business_id != null ? null : String(row.user_id),
        currency: String(row.currency ?? "USD"),
        delta: -amount,
      })
    }
  }

  console.log(
    `${dryRun ? "[dry-run] " : ""}delete ${noahDeleteIds.length} Noah orchestration Out row(s): ${noahDeleteIds.join(", ") || "—"}`,
  )
  console.log(
    `${dryRun ? "[dry-run] " : ""}delete ${turnkeyDeleteIds.length} Turnkey mirror row(s): ${turnkeyDeleteIds.join(", ") || "—"}`,
  )

  if (!dryRun) {
    if (noahDeleteIds.length) {
      await admin.from("transactions").delete().in("id", noahDeleteIds)
    }
    if (turnkeyDeleteIds.length) {
      await admin.from("transactions").delete().in("id", turnkeyDeleteIds)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
