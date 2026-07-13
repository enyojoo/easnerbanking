/**
 * Tag (or delete) Turnkey inbound rows that mirror Noah global-payout failure refunds;
 * reverse duplicate ledger credits and restore payout debit on failed rows.
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/suppress-global-payout-refund-turnkey-rows.ts --dry-run
 *   cd business && node --env-file=.env.local --import tsx scripts/suppress-global-payout-refund-turnkey-rows.ts
 *   cd business && node --env-file=.env.local --import tsx scripts/suppress-global-payout-refund-turnkey-rows.ts --delete
 */
import { createSupabaseAdmin } from "../lib/supabase/admin"
import { applyWalletBalanceDelta } from "../lib/wallet/wallet-balances-db"
import {
  inboundMatchesGlobalPayoutRefundAmount,
  reverseGlobalPayoutWalletDebitForEasnerPayoutId,
} from "../lib/noah/global-payout-ledger"

const dryRun = process.argv.includes("--dry-run")
const deleteMirrors = process.argv.includes("--delete")

function amountsRoughlyEqual(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return false
  return Math.abs(a - b) <= Math.max(0.02, a * 0.002)
}

function pickRefundMatchAmount(meta: Record<string, unknown>, rowAmount: number): number | null {
  const total = Number(meta.total_debited ?? 0)
  const refund = Number(meta.noah_send_amount ?? meta.noah_refund_amount ?? 0)
  if (Number.isFinite(refund) && refund > 0) return refund
  if (Number.isFinite(total) && total > 0) return total
  const crypto = Number(meta.crypto_authorized_amount ?? 0)
  if (Number.isFinite(crypto) && crypto > 0) return crypto
  if (Number.isFinite(rowAmount) && rowAmount > 0) return rowAmount
  return null
}

function isGlobalPayoutFailedRow(meta: Record<string, unknown>): boolean {
  return meta.payout_type === "global_fiat" || meta.flow === "global_fiat_offramp"
}

function scopeMatches(
  row: { user_id: string | null; business_id: string | null },
  scope: { userId: string | null; businessId: string | null },
): boolean {
  if (scope.businessId) return row.business_id === scope.businessId
  return row.user_id === scope.userId
}

async function main() {
  const admin = createSupabaseAdmin()

  const { data: failedPayouts, error: payoutErr } = await admin
    .from("transactions")
    .select("id, user_id, business_id, amount, currency, metadata, status, tx_hash")
    .eq("provider", "noah")
    .eq("direction", "out")
    .in("status", ["failed", "cancelled"])
    .or("metadata->>payout_type.eq.global_fiat,metadata->>flow.eq.global_fiat_offramp")
    .limit(500)

  if (payoutErr) throw payoutErr

  const refundHashToScope = new Map<
    string,
    { userId: string | null; businessId: string | null; payoutRowId: string }
  >()
  const amountScopes: Array<{
    userId: string | null
    businessId: string | null
    debitAmount: number
    outboundTxHash: string
    payoutRowId: string
    payoutMeta: Record<string, unknown>
  }> = []

  for (const row of failedPayouts ?? []) {
    const meta = (row.metadata as Record<string, unknown> | undefined) ?? {}
    if (!isGlobalPayoutFailedRow(meta)) continue

    const easnerPayoutId =
      typeof meta.easner_payout_id === "string" && meta.easner_payout_id.trim()
        ? meta.easner_payout_id.trim()
        : null
    const userId = row.user_id != null ? String(row.user_id) : null
    const businessId = row.business_id != null ? String(row.business_id) : null
    const payoutRowId = String(row.id)

    if (easnerPayoutId && meta.balance_delta_reversed !== true) {
      console.log(
        `${dryRun ? "[dry-run] " : ""}reverse payout debit easner_payout_id=${easnerPayoutId} row=${payoutRowId}`,
      )
      if (!dryRun) {
        await reverseGlobalPayoutWalletDebitForEasnerPayoutId(admin, { easnerPayoutId })
      }
    }

    if (!dryRun && easnerPayoutId) {
      const { data: freshPayout } = await admin
        .from("transactions")
        .select("metadata, currency")
        .eq("id", payoutRowId)
        .maybeSingle()
      const feeMeta = (freshPayout?.metadata as Record<string, unknown> | undefined) ?? meta
      if (feeMeta.balance_delta_reversed === true) {
        const processingFee = Number(feeMeta.processing_fee ?? 0)
        const feeSent = String(feeMeta.processing_fee_turnkey_send_id ?? "").trim()
        const alreadyWrittenOff = feeMeta.stranded_processing_fee_written_off === true
        if (
          feeSent &&
          !alreadyWrittenOff &&
          Number.isFinite(processingFee) &&
          processingFee > 0
        ) {
          console.log(
            `${dryRun ? "[dry-run] " : ""}write off stranded processing fee ${processingFee} easner_payout_id=${easnerPayoutId}`,
          )
          await applyWalletBalanceDelta(admin, {
            businessId,
            userId: businessId ? null : userId,
            currency: String(freshPayout?.currency ?? row.currency ?? "USD"),
            delta: -processingFee,
          })
          await admin
            .from("transactions")
            .update({
              metadata: {
                ...feeMeta,
                stranded_processing_fee_written_off: true,
                stranded_processing_fee_amount: processingFee,
              },
              updated_at: new Date().toISOString(),
            })
            .eq("id", payoutRowId)
        }
      }
    }

    const refundHash = String(meta.noah_refund_tx_hash ?? "").trim()
    if (refundHash) {
      refundHashToScope.set(refundHash, { userId, businessId, payoutRowId })
    }

    const debit = pickRefundMatchAmount(meta, Number(row.amount ?? 0))
    if (debit == null) continue

    const outboundTxHash = String(
      meta.turnkey_tx_hash ?? meta.noah_on_chain_tx_hash ?? row.tx_hash ?? "",
    ).trim()

    amountScopes.push({
      userId,
      businessId,
      debitAmount: debit,
      outboundTxHash,
      payoutRowId,
      payoutMeta: meta,
    })
  }

  const { data: turnkeyRows, error: tkErr } = await admin
    .from("transactions")
    .select("id, tx_hash, user_id, business_id, metadata, amount, currency")
    .eq("provider", "turnkey")
    .eq("direction", "in")
    .contains("metadata", { source: "turnkey_balance_webhook" })
    .not("tx_hash", "is", null)
    .limit(5000)

  if (tkErr) throw tkErr

  let updated = 0
  for (const row of turnkeyRows ?? []) {
    const prior = (row.metadata as Record<string, unknown> | undefined) ?? {}
    if (prior.global_payout_refund_mirror === true && prior.suppress_in_feed === true && !deleteMirrors) {
      continue
    }

    const h = String(row.tx_hash ?? "").trim()
    const userId = row.user_id != null ? String(row.user_id) : null
    const businessId = row.business_id != null ? String(row.business_id) : null
    const amount = Number(row.amount ?? 0)

    let mirror = false
    let linkedPayoutRowId: string | null = null
    let linkedPayoutMeta: Record<string, unknown> | null = null

    if (h && refundHashToScope.has(h)) {
      const scope = refundHashToScope.get(h)!
      if (scopeMatches({ user_id: userId, business_id: businessId }, scope)) {
        mirror = true
        linkedPayoutRowId = scope.payoutRowId
      }
    }

    if (!mirror && Number.isFinite(amount) && amount > 0) {
      for (const scope of amountScopes) {
        if (!scopeMatches({ user_id: userId, business_id: businessId }, scope)) continue
        if (h && scope.outboundTxHash && h === scope.outboundTxHash) continue
        if (!amountsRoughlyEqual(amount, scope.debitAmount) &&
            !inboundMatchesGlobalPayoutRefundAmount(amount, scope.payoutMeta, scope.debitAmount)) continue
        mirror = true
        linkedPayoutRowId = scope.payoutRowId
        linkedPayoutMeta = scope.payoutMeta
        break
      }
    }

    if (!mirror) continue

    if (!dryRun && h && linkedPayoutRowId) {
      const { data: payoutRow } = await admin
        .from("transactions")
        .select("metadata")
        .eq("id", linkedPayoutRowId)
        .maybeSingle()
      const payoutMeta = (payoutRow?.metadata as Record<string, unknown> | undefined) ?? linkedPayoutMeta ?? {}
      if (!String(payoutMeta.noah_refund_tx_hash ?? "").trim()) {
        await admin
          .from("transactions")
          .update({
            metadata: {
              ...payoutMeta,
              noah_refund_tx_hash: h,
              noah_refund_expected: true,
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", linkedPayoutRowId)
      }
    }

    const reverseBalance =
      prior.balance_delta_applied === true && prior.global_payout_refund_mirror_reversed !== true

    console.log(
      `${dryRun ? "[dry-run] " : ""}${deleteMirrors ? "delete" : "suppress"} global payout refund mirror id=${row.id} tx=${h.slice(0, 12)}…` +
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
      }

      if (deleteMirrors) {
        await admin.from("transactions").delete().eq("id", row.id)
      } else {
        await admin
          .from("transactions")
          .update({
            metadata: {
              ...prior,
              suppress_in_feed: true,
              global_payout_refund_mirror: true,
              ...(reverseBalance ? { global_payout_refund_mirror_reversed: true } : {}),
            },
            hidden_from_feed: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id)
      }
    }
    updated += 1
  }

  console.log(
    `Done. ${updated} Turnkey refund mirror row(s) ${dryRun ? "would be " : ""}` +
      `${deleteMirrors ? "deleted" : "tagged"}.`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
