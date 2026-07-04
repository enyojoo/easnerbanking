/**
 * Live Noah prepare + Easner payout pricing for NGN ticket sizes.
 *
 *   cd business && node --env-file=.env.local --import tsx scripts/probe-ngn-payout-tickets.ts
 *
 * Optional env:
 *   PROBE_NOAH_CUSTOMER_ID (default: user's individual eind)
 *   PROBE_USER_ID
 *   PROBE_NOAH_RECIPIENT_ID — NGN recipient uuid; else first NGN recipient for user
 */

import { computeDisplayProcessingFee } from "@easner/shared"
import { buildPayoutQuote } from "@/lib/noah/payout-quote"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

const DEFAULT_USER_ID = "c7ace38e-be38-43e7-86e1-6e66b90d4243"
const DEFAULT_NOAH_CUSTOMER_ID = "eind_c7ace38ebe3843e786e16e66b90d4243"
const TICKETS = [50_000, 100_000, 500_000] as const

async function main() {
  const userId = process.env.PROBE_USER_ID?.trim() || DEFAULT_USER_ID
  const noahCustomerId = process.env.PROBE_NOAH_CUSTOMER_ID?.trim() || DEFAULT_NOAH_CUSTOMER_ID
  const admin = createSupabaseAdmin()

  let recipientId = process.env.PROBE_NOAH_RECIPIENT_ID?.trim() || ""
  if (!recipientId) {
    const { data, error } = await admin
      .from("recipients")
      .select("id, bank_name, account_number, country_code")
      .eq("user_id", userId)
      .eq("currency", "NGN")
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data?.id) throw new Error(`No NGN recipient for user ${userId}`)
    recipientId = String(data.id)
    console.error("Using recipient:", data)
  }

  const rows = []
  for (const ticket of TICKETS) {
    const q = await buildPayoutQuote({
      userId,
      noahCustomerId,
      recipientId,
      receiveFiatAmount: ticket,
      sourceBalanceCurrency: "USD",
      amountEntryMode: "receive",
    })
    const displayProcessingFee = computeDisplayProcessingFee({
      processingFee: q.processingFee,
      exchangeFee: q.displayChannelCost,
    })
    rows.push({
      receive_NGN: ticket,
      sending_USD: round(q.customerPrincipal),
      processingFee_1pct_USD: round(q.processingFee),
      displayChannelCost_USD: round(q.displayChannelCost),
      processingFee_UI_USD: round(displayProcessingFee),
      totalDebited_USD: round(q.totalDebited),
      recipientGets_NGN: q.receiveAmount,
      noahFloor_USDC: round(Number(q.noah.noahFloor)),
      marginAmount_FX_in_rate: round(q.marginAmount),
      channelCost_ops: round(q.channelCost),
      noahSendAmount_USDC: round(Number(q.noah.noahSendAmount)),
      feeWalletLeg_USDC: round(q.processingFee),
      customerRate_NGN_per_USD: q.noah.rate,
      ticketNoahMid: q.noah.quoteNoahMid ?? null,
      dbNoahMid: q.noah.noahMid ?? null,
      prepareChannelFee: q.noah.prepareChannelFee ?? null,
      prepareRemaining: q.noah.prepareRemaining ?? null,
      effectiveRate_allIn_NGN_per_USD: round(q.noah.effectiveRate ?? 0, 2),
      footing_check: round(q.customerPrincipal + displayProcessingFee),
    })
  }

  console.log(JSON.stringify({ probedAt: new Date().toISOString(), userId, recipientId, rows }, null, 2))
}

function round(n: number, d = 4): number {
  if (!Number.isFinite(n)) return 0
  const m = 10 ** d
  return Math.round(n * m) / m
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
