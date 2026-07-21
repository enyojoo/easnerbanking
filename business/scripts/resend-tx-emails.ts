/**
 * Resend ledger transaction emails (no push) for specific tx IDs.
 *
 *   cd business && LEDGER_TRANSACTION_EMAIL_ENABLED=true \
 *     node --env-file=.env.local --import ./scripts/register-server-only-stub.mjs --import tsx \
 *     scripts/resend-tx-emails.ts
 */
import { createClient } from "@supabase/supabase-js"
import {
  buildTransactionEmailDetailRows,
  deriveTransactionNotification,
  formatMaskedSenderDisplay,
  isYcFundBalanceDepositMetadata,
  normalizeYcFundBalanceDepositReview,
  parseCommunicationPreferences,
  personalMobileTransactionUrl,
  reconstructYcFundBalanceDepositReview,
  resolveInboundReceiveDetail,
  resolvePayoutReviewFlow,
  type GlobalPayoutReviewSnapshot,
} from "@easner/shared"
import { emailService, type TransactionEmailData } from "@easner/server"
import { isLedgerTransactionEmailEnabled } from "../lib/notifications/email-rollout"
import { resolveEmailAudience } from "../lib/notifications/resolve-email-audience"
import { fetchUserEmailContact } from "../lib/notifications/user-contact"
import {
  isEasetagChainSettlementTransaction,
  isNoahInternalSettlementTransaction,
  isTurnkeyEasetagP2pChainMirror,
} from "../lib/transactions/transaction-feed-filters"

const IDS = [
  "683b2334-bd36-4033-94df-68aafc880313",
  "b8cf8a5e-9291-4f9a-b7bd-4095b8c0f8e2",
  "22919daa-031b-412a-83ed-65b17af08b85",
  "0485cba9-30bd-48a6-843d-3007f8cf305a",
  "4b624a4f-bded-46c8-a6c6-03b9aa5f58ce",
  "9b9bc22c-faaa-458f-b473-708d4e925a70",
  "09b1eecd-a8cd-43ae-92f6-cf6553452eff",
  "02cc0cac-87a7-41b8-a46d-bf344a7a9833",
  "addd48d9-5468-4a89-84af-e2f96e9c5de9",
  "fdecec34-66c3-4612-ac78-a746951dcf04",
  "86869801-e35c-431b-beb9-2658fc55b750",
  "7401275a-0c82-4736-8bc0-4e318b6b1596",
]

function shouldSkip(meta: Record<string, unknown>): boolean {
  return (
    isEasetagChainSettlementTransaction(meta) ||
    isTurnkeyEasetagP2pChainMirror(meta) ||
    isNoahInternalSettlementTransaction(meta)
  )
}

function firstString(values: readonly unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim()
    if (typeof v === "number" && Number.isFinite(v)) return String(v)
  }
  return undefined
}

function readValidPayoutReview(raw: unknown): GlobalPayoutReviewSnapshot | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const receiveAmount = Number(o.receive_amount)
  const totalDebited = Number(o.total_debited)
  if (!Number.isFinite(receiveAmount) || receiveAmount <= 0) return null
  if (!Number.isFinite(totalDebited) || totalDebited <= 0) return null
  return raw as GlobalPayoutReviewSnapshot
}

function buildEmailDetailRows(
  descriptor: ReturnType<typeof deriveTransactionNotification>,
  input: {
    provider: string
    direction: "in" | "out" | null
    amount: number
    currency: string
    metadata: Record<string, unknown>
    payload: Record<string, unknown> | null
    transactionId: string
    easnerTransactionId?: string
  },
) {
  const meta = input.metadata ?? {}
  const direction = descriptor.direction
  const payoutReview = readValidPayoutReview(meta.payout_review)
  if (payoutReview) {
    const snap = meta.recipient_snapshot as Record<string, unknown> | undefined
    return buildTransactionEmailDetailRows({
      direction,
      payoutReview,
      payoutReviewFlow: resolvePayoutReviewFlow(meta),
      receiveNetwork: firstString([meta.receive_network, meta.chain, meta.receive_asset_network]),
      recipient: snap
        ? {
            fullName: firstString([snap.full_name]) ?? descriptor.counterpartyName ?? null,
            bankName: firstString([snap.bank_name]) ?? null,
            accountNumber: firstString([snap.account_number]) ?? null,
            phone: firstString([snap.phone]) ?? null,
            mobileProvider: firstString([snap.mobile_provider]) ?? null,
            walletNetwork:
              firstString([meta.receive_network, meta.chain, snap.wallet_network]) ?? null,
          }
        : descriptor.counterpartyName
          ? { fullName: descriptor.counterpartyName }
          : null,
    })
  }

  if (direction === "in") {
    const inboundReceive = resolveInboundReceiveDetail({
      provider: input.provider,
      direction: input.direction,
      metadata: meta,
      payload: input.payload ?? null,
      source_type: firstString([meta.source_type]),
      chain: firstString([meta.chain, meta.receive_network]),
      currency: input.currency,
      amount: input.amount,
      deposit_review: normalizeYcFundBalanceDepositReview(meta.deposit_review),
      sender_display_name: firstString([meta.sender_display_name, meta.sender_name]),
      source_payment_rail: firstString([meta.source_payment_rail, meta.payment_rail]),
      reference: firstString([meta.reference, meta.narration]),
      fee_amount: Number(meta.fee_amount ?? meta.fee ?? 0) || null,
      posted_amount: Number(meta.posted_amount ?? meta.settled_amount ?? 0) || null,
      posted_currency: firstString([meta.posted_currency, meta.settled_currency, meta.currency]),
      settled_amount: Number(meta.settled_amount ?? 0) || null,
      settled_currency: firstString([meta.settled_currency, meta.currency]),
      created_at: firstString([meta.created_at]),
      ledger_created_at: firstString([meta.ledger_created_at, meta.created_at]),
      easner_transaction_id: input.easnerTransactionId ?? input.transactionId,
      send_note: firstString([meta.send_note, meta.note]),
    })
    if (inboundReceive) {
      return buildTransactionEmailDetailRows({ direction, inboundReceive })
    }
    if (isYcFundBalanceDepositMetadata(meta)) {
      const depositReview =
        normalizeYcFundBalanceDepositReview(meta.deposit_review) ??
        reconstructYcFundBalanceDepositReview(
          meta,
          typeof meta.customer_rate === "number" ? meta.customer_rate : Number(meta.customer_rate),
        )
      if (depositReview) {
        return buildTransactionEmailDetailRows({ direction, depositReview })
      }
    }
    const senderDisplay =
      descriptor.counterpartyName ||
      formatMaskedSenderDisplay({
        senderName: firstString([meta.sender_name, meta.sender_display_name]),
        counterpartyAddress: firstString([meta.counterparty_address, meta.from_address]),
      }) ||
      null
    return buildTransactionEmailDetailRows({
      direction,
      deposit: {
        scheme: firstString([
          meta.payment_scheme,
          meta.deposit_scheme_label,
          meta.source_payment_rail,
        ]),
        senderDisplay,
        feeAmount: Number(meta.fee_amount ?? meta.fee ?? 0) || null,
        feeCurrency: firstString([meta.currency, meta.settled_currency]),
        postedAmount: Number(meta.posted_amount ?? meta.settled_amount ?? 0) || null,
        postedCurrency: firstString([meta.posted_currency, meta.settled_currency, meta.currency]),
        narration: firstString([meta.narration, meta.reference]),
      },
    })
  }
  return []
}

async function main() {
  console.log("ledger email enabled:", isLedgerTransactionEmailEnabled())
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    { auth: { persistSession: false } },
  )

  const { data: txs, error } = await admin.from("transactions").select("*").in("id", IDS)
  if (error) throw error
  const byId = new Map((txs || []).map((t) => [t.id, t]))

  for (const id of IDS) {
    const t = byId.get(id)
    if (!t) {
      console.log("MISSING", id)
      continue
    }
    const meta = (t.metadata || {}) as Record<string, unknown>
    const status = String(t.status || "").toLowerCase()
    const outcome = status === "failed" || status === "cancelled" ? "failed" : "success"

    if (shouldSkip(meta)) {
      console.log(
        "SKIP mirror/internal",
        id.slice(0, 8),
        String(meta.source || meta.yc_fund_balance_chain_mirror || ""),
      )
      continue
    }
    if (outcome === "success" && status !== "settled") {
      console.log("SKIP not settled", id.slice(0, 8), status)
      continue
    }

    const etid =
      typeof meta.easner_transaction_id === "string" ? meta.easner_transaction_id.trim() : undefined
    const direction =
      t.direction === "in" || t.direction === "out" ? (t.direction as "in" | "out") : null
    const amount = typeof t.amount === "number" ? t.amount : Number(t.amount) || 0
    const currency = String(t.currency ?? "USD")

    const prefsRaw = (
      await admin
        .from("user_preferences")
        .select("communication_preferences")
        .eq("user_id", t.user_id)
        .maybeSingle()
    ).data?.communication_preferences
    const parsed = parseCommunicationPreferences(prefsRaw)
    const audience = await resolveEmailAudience(admin, t.user_id)
    const contact = await fetchUserEmailContact(admin, t.user_id)

    const descriptor = deriveTransactionNotification({
      provider: String(t.provider),
      direction,
      amount,
      currency,
      metadata: meta,
      payload: t.payload,
      outcome,
      failureReason:
        typeof meta.failure_reason === "string" ? meta.failure_reason : undefined,
    })

    if (!descriptor.emailEnabled || !isLedgerTransactionEmailEnabled()) {
      console.log("SKIP flag/disabled", id.slice(0, 8))
      continue
    }
    if (!parsed.channels.email) {
      console.log("SKIP channels.email off", id.slice(0, 8))
      continue
    }
    if (!contact.email) {
      console.log("SKIP no email", id.slice(0, 8), t.user_id)
      continue
    }

    const rows = buildEmailDetailRows(descriptor, {
      provider: String(t.provider),
      direction,
      amount,
      currency,
      metadata: meta,
      payload: (t.payload as Record<string, unknown> | null) ?? null,
      transactionId: t.id,
      easnerTransactionId: etid,
    })

    const businessBase =
      process.env.NEXT_PUBLIC_BUSINESS_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://business.easner.com"
    const linkId = etid || t.id

    const emailData: TransactionEmailData = {
      transactionId: t.id,
      easnerTransactionId: etid,
      title: descriptor.title,
      emailSubject: descriptor.emailSubject,
      body: descriptor.body,
      amountDisplay: descriptor.amountDisplay,
      counterpartyLabel: descriptor.counterpartyLabel,
      counterpartyName: descriptor.counterpartyName,
      direction: descriptor.direction ?? undefined,
      provider: descriptor.provider,
      paymentRail: descriptor.paymentRail,
      category: descriptor.category,
      status: outcome === "success" ? "settled" : "failed",
      outcome: descriptor.outcome,
      failureReason: descriptor.failureReason,
      detailUrl:
        audience === "business"
          ? `${businessBase}/transactions/${encodeURIComponent(linkId)}`
          : personalMobileTransactionUrl(linkId, process.env.NEXT_PUBLIC_MOBILE_APP_URL),
      detailRows: rows.length ? rows : undefined,
      firstName: contact.firstName,
      audience,
    }

    const result = await emailService.sendTransactionSettledEmail(
      contact.email,
      emailData,
      prefsRaw,
    )
    console.log(
      result.success ? "OK" : "FAIL",
      id.slice(0, 8),
      audience,
      `Hey ${contact.firstName || "there"}`,
      "→",
      contact.email,
      descriptor.emailSubject,
      rows.map((r) => r.label).join(" | "),
      result.messageId || result.error,
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
