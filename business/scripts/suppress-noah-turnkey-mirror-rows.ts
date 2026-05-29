/**
 * One-time cleanup: tag Turnkey inbound rows that duplicate Noah bank on-ramp settlement hashes.
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/suppress-noah-turnkey-mirror-rows.ts --dry-run
 *   cd business && node --env-file=.env.local --import tsx scripts/suppress-noah-turnkey-mirror-rows.ts
 */
import { createSupabaseAdmin } from "../lib/supabase/admin"
import { applyWalletBalanceDelta } from "../lib/wallet/wallet-balances-db"
import {
  extractNoahBankPayInEnrichment,
  isNoahBankOnrampLedgerPayload,
} from "../lib/noah/bank-onramp-tx"
import { pickNoahOnChainTxHashFromLedgerRow } from "../lib/noah/noah-on-chain-tx-hash"

const dryRun = process.argv.includes("--dry-run")

function amountsRoughlyEqual(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return false
  return Math.abs(a - b) <= Math.max(0.02, a * 0.002)
}

function noahSettledStablecoinAmount(payload: Record<string, unknown>): number | null {
  const enrichment = extractNoahBankPayInEnrichment(payload)
  if (enrichment?.settledStablecoinAmount != null) {
    return enrichment.settledStablecoinAmount
  }
  const raw = Number(payload.Amount ?? 0)
  return Number.isFinite(raw) && raw > 0 ? raw : null
}

async function main() {
  const admin = createSupabaseAdmin()

  const { data: noahRows, error: noahErr } = await admin
    .from("transactions")
    .select("id, tx_hash, user_id, business_id, direction, metadata, payload, amount")
    .eq("provider", "noah")
    .limit(5000)

  if (noahErr) throw noahErr

  const hashToNoah = new Map<string, { userId: string | null; businessId: string | null }>()
  const amountScopes: Array<{
    userId: string | null
    businessId: string | null
    stablecoinAmount: number
  }> = []

  for (const row of noahRows ?? []) {
    const payload = (row.payload as Record<string, unknown> | undefined) ?? {}
    if (!isNoahBankOnrampLedgerPayload(payload)) continue

    const h = pickNoahOnChainTxHashFromLedgerRow(row)
    if (h) {
      hashToNoah.set(h, {
        userId: row.user_id != null ? String(row.user_id) : null,
        businessId: row.business_id != null ? String(row.business_id) : null,
      })
    }

    if (String(row.direction ?? "").toLowerCase() === "in") {
      const stable = noahSettledStablecoinAmount(payload)
      if (stable != null) {
        amountScopes.push({
          userId: row.user_id != null ? String(row.user_id) : null,
          businessId: row.business_id != null ? String(row.business_id) : null,
          stablecoinAmount: stable,
        })
      }
    }
  }

  const { data: turnkeyRows, error: tkErr } = await admin
    .from("transactions")
    .select("id, tx_hash, user_id, business_id, metadata, amount, currency")
    .eq("provider", "turnkey")
    .eq("direction", "in")
    .not("tx_hash", "is", null)
    .limit(5000)

  if (tkErr) throw tkErr

  let updated = 0
  for (const row of turnkeyRows ?? []) {
    const prior = (row.metadata as Record<string, unknown> | undefined) ?? {}
    if (prior.suppress_in_feed === true && prior.noah_bank_onramp_chain_mirror === true) continue

    const h = String(row.tx_hash ?? "").trim()
    const userId = row.user_id != null ? String(row.user_id) : null
    const businessId = row.business_id != null ? String(row.business_id) : null
    const amount = Number(row.amount ?? 0)

    let mirror = false

    if (h && hashToNoah.has(h)) {
      const scope = hashToNoah.get(h)!
      if (scope.businessId) {
        mirror = businessId === scope.businessId
      } else {
        mirror = userId === scope.userId
      }
    }

    if (!mirror && Number.isFinite(amount) && amount > 0) {
      for (const scope of amountScopes) {
        if (scope.businessId) {
          if (businessId !== scope.businessId) continue
        } else if (userId !== scope.userId) {
          continue
        }
        if (amountsRoughlyEqual(amount, scope.stablecoinAmount)) {
          mirror = true
          break
        }
      }
    }

    if (!mirror) continue

    const meta = {
      ...prior,
      suppress_in_feed: true,
      noah_bank_onramp_chain_mirror: true,
    }

    const reverseBalance =
      prior.balance_delta_applied === true && !prior.noah_bank_onramp_mirror_reversed

    console.log(
      `${dryRun ? "[dry-run] " : ""}suppress turnkey mirror id=${row.id} tx=${h.slice(0, 12)}…` +
        (reverseBalance ? " (reverse balance delta)" : ""),
    )
    if (!dryRun) {
      if (reverseBalance && Number.isFinite(amount) && amount > 0) {
        await applyWalletBalanceDelta(admin, {
          businessId,
          userId: businessId ? null : userId,
          currency: String(row.currency ?? "USD"),
          delta: -amount,
        })
        meta.noah_bank_onramp_mirror_reversed = true
      }
      await admin
        .from("transactions")
        .update({ metadata: meta, updated_at: new Date().toISOString() })
        .eq("id", row.id)
    }
    updated += 1
  }

  console.log(`Done. ${updated} Turnkey mirror row(s) ${dryRun ? "would be " : ""}tagged.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
