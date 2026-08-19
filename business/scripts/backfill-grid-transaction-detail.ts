/**
 * Backfill Grid payout_review + VA inbound shared metadata.
 * Metadata only. Does not reverse wallet credits or resend emails.
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/backfill-grid-transaction-detail.ts --dry-run
 *   cd business && node --env-file=.env.local --import tsx scripts/backfill-grid-transaction-detail.ts
 */
import {
  classifyVerificationDepositFromFiatDeposit,
  isStripeCollectionSettlementMetadata,
  rawPayoutReviewFromMetadata,
} from "@easner/shared"
import { createSupabaseAdmin } from "../lib/supabase/admin"
import { extractGridVaInboundSharedFields } from "../lib/grid/grid-va-inbound-fields"
import { gridMoneyToMajor } from "../lib/grid/webhook-amount"

const dryRun = process.argv.includes("--dry-run")

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function reconstructPayoutReview(meta: Record<string, unknown>): Record<string, unknown> | null {
  const nested = rawPayoutReviewFromMetadata(meta)
  if (nested && typeof nested === "object") return nested as Record<string, unknown>
  const receiveAmount = Number(meta.receive_amount ?? meta.fiat_amount)
  const totalDebited = Number(meta.total_debited)
  if (!Number.isFinite(receiveAmount) || receiveAmount <= 0) return null
  if (!Number.isFinite(totalDebited) || totalDebited <= 0) return null
  const youSend = Number(meta.customer_principal ?? meta.you_send_amount ?? totalDebited)
  return {
    you_send_amount: Number.isFinite(youSend) && youSend > 0 ? youSend : totalDebited,
    total_debited: totalDebited,
    receive_amount: receiveAmount,
    receive_currency: String(meta.receive_currency ?? meta.fiat_currency ?? "").toUpperCase(),
    send_currency: String(meta.send_currency ?? "USD").toUpperCase(),
    exchange_fee: Number(meta.channel_cost ?? meta.exchange_fee ?? 0) || 0,
    processing_fee: Number(meta.processing_fee ?? 0) || 0,
    exchange_rate: Number(meta.customer_rate ?? meta.exchange_rate ?? 1) || 1,
    transfer_method: String(meta.transfer_method ?? "Bank transfer"),
  }
}

function readFiatAmount(meta: Record<string, unknown>, payload: Record<string, unknown>): number {
  const fromMeta = Number(meta.fiat_deposit_amount ?? meta.posted_amount)
  if (Number.isFinite(fromMeta) && fromMeta > 0) return fromMeta
  const received = gridMoneyToMajor(payload.receivedAmount)
  if (received && received.amount > 0) return received.amount
  return 0
}

async function main() {
  const admin = createSupabaseAdmin()
  let payoutPatched = 0
  let vaPatched = 0
  let creditedVerificationLogged = 0

  const { data: payouts, error: payoutErr } = await admin
    .from("transactions")
    .select("id, metadata")
    .eq("provider", "grid")
    .eq("direction", "out")

  if (payoutErr) {
    console.error(payoutErr.message)
    process.exit(1)
  }

  for (const row of payouts ?? []) {
    const meta = asRecord(row.metadata)
    const isBalancePayout =
      String(meta.payout_type ?? "").toLowerCase() === "global_fiat" ||
      String(meta.flow ?? "").toLowerCase() === "global_fiat_offramp" ||
      String(meta.grid_mode ?? "").toLowerCase() === "balance_payout"
    if (!isBalancePayout) continue
    if (meta.payout_review && typeof meta.payout_review === "object") continue
    const review = reconstructPayoutReview(meta)
    if (!review) continue
    payoutPatched += 1
    if (dryRun) {
      console.log(`[dry-run] payout ${row.id} payout_review`)
      continue
    }
    const { error } = await admin
      .from("transactions")
      .update({
        metadata: { ...meta, payout_review: review, review_snapshot: meta.review_snapshot ?? review },
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
    if (error) console.error(`payout ${row.id}: ${error.message}`)
  }

  const { data: inbound, error: inboundErr } = await admin
    .from("transactions")
    .select("id, metadata, payload")
    .eq("provider", "grid")
    .eq("direction", "in")
    .filter("metadata->>grid_va_inbound", "eq", "true")

  if (inboundErr) {
    console.error(inboundErr.message)
    process.exit(1)
  }

  for (const row of inbound ?? []) {
    const meta = asRecord(row.metadata)
    const payload = asRecord(row.payload)
    if (isStripeCollectionSettlementMetadata(meta)) continue
    const fields = extractGridVaInboundSharedFields(payload)
    const fiatAmount = readFiatAmount(meta, payload)
    const kind = classifyVerificationDepositFromFiatDeposit({ fiatAmount })
    const next: Record<string, unknown> = {
      ...meta,
      sender_name: meta.sender_name || fields.senderName || undefined,
      source_payment_rail: meta.source_payment_rail || fields.sourcePaymentRail,
      deposit_scheme_label: meta.deposit_scheme_label || fields.depositSchemeLabel,
      fee_amount: meta.fee_amount ?? fields.feeAmount,
      posted_amount: meta.posted_amount ?? fiatAmount,
      posted_currency: meta.posted_currency ?? meta.fiat_deposit_currency,
    }
    if (kind === "verification") {
      next.deposit_kind = "verification"
      if (!next.verification_bank_name && fields.senderName) {
        next.verification_bank_name = fields.senderName
      }
      if (meta.wallet_balance_credit_key) {
        creditedVerificationLogged += 1
        console.warn(
          `[no-reverse] verification row ${row.id} already has wallet_balance_credit_key=${meta.wallet_balance_credit_key}`,
        )
      }
    } else if (!next.deposit_kind) {
      next.deposit_kind = "funding"
    }

    const changed = JSON.stringify(next) !== JSON.stringify(meta)
    if (!changed) continue
    vaPatched += 1
    if (dryRun) {
      console.log(`[dry-run] va ${row.id} kind=${next.deposit_kind}`)
      continue
    }
    const { error } = await admin
      .from("transactions")
      .update({ metadata: next, updated_at: new Date().toISOString() })
      .eq("id", row.id)
    if (error) console.error(`va ${row.id}: ${error.message}`)
  }

  console.log(
    JSON.stringify({
      dryRun,
      payoutPatched,
      vaPatched,
      creditedVerificationLogged,
    }),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
