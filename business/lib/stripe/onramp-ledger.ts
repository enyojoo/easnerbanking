import type { SupabaseClient } from "@supabase/supabase-js"
import { applyWalletBalanceDelta } from "@/lib/wallet/wallet-balances-db"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { readEasnerTransactionId } from "@/lib/easner-transaction-id"
import { buildWalletReportingSnapshot } from "@/lib/transactions/reporting-snapshot"
import { buildStripeOnrampCreditKey } from "@/lib/stripe/onramp-credit-key"

export { buildStripeOnrampCreditKey }

function asMeta(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
}

function sessionStatus(raw: unknown): string {
  return String(raw ?? "").toLowerCase()
}

function isFulfilledStatus(status: string): boolean {
  return (
    status === "fulfillment_complete" ||
    status === "fulfilled" ||
    status === "complete" ||
    status.includes("fulfillment_complete")
  )
}

function readUsdCredit(session: Record<string, unknown>): number {
  const dest =
    Number(session.destination_amount ?? session.crypto_amount ?? 0) ||
    Number(asMeta(session.transaction_details).destination_amount ?? 0)
  const source = Number(session.source_amount ?? 0)
  const n = dest > 0 ? dest : source
  return Number.isFinite(n) ? n : 0
}

function readTxHash(session: Record<string, unknown>): string | null {
  const hash = String(
    session.transaction_hash ??
      session.destination_transaction_hash ??
      asMeta(session.transaction_details).transaction_hash ??
      "",
  ).trim()
  return hash || null
}

export async function insertPendingOnrampSession(
  admin: SupabaseClient,
  input: {
    userId: string
    businessId: string | null
    stripeSessionId: string
    cryptoCustomerId: string
    usdCredit: number | null
    sourceAmount?: number | null
    sourceCurrency?: string | null
    paymentMethod: string
    walletAddress: string
  },
): Promise<string | null> {
  const now = new Date().toISOString()
  await admin.from("stripe_onramp_sessions").upsert(
    {
      user_id: input.userId,
      business_id: input.businessId,
      stripe_session_id: input.stripeSessionId,
      crypto_customer_id: input.cryptoCustomerId,
      status: "created",
      payment_method: input.paymentMethod,
      usd_credit: input.usdCredit,
      source_amount: input.sourceAmount ?? null,
      wallet_address: input.walletAddress,
      metadata: {
        flow: "express_deposits",
        source_currency: input.sourceCurrency ?? "usd",
        payment_method: input.paymentMethod,
      },
      updated_at: now,
    },
    { onConflict: "stripe_session_id" },
  )
  if (input.usdCredit && input.usdCredit > 0) {
    const upserted = await upsertLedgerTransaction(admin, {
      userId: input.userId,
      businessId: input.businessId,
      provider: "stripe",
      providerTransactionId: input.stripeSessionId,
      status: "processing",
      amount: input.usdCredit,
      currency: "USD",
      direction: "in",
      metadata: {
        flow: "express_deposits",
        source_type: "express_deposits",
        processing_at: now,
        deposit_review: {
          you_get: input.usdCredit,
          you_get_currency: "USD",
          you_pay: input.sourceAmount ?? input.usdCredit,
          you_pay_currency: String(input.sourceCurrency || "usd").toUpperCase(),
          payment_method: input.paymentMethod,
        },
        usd_credit: input.usdCredit,
        payment_method: input.paymentMethod,
      },
      occurredAt: now,
      baseCurrency: "USD",
    })
    const { data: row } = await admin
      .from("transactions")
      .select("easner_transaction_id, metadata")
      .eq("id", upserted.transactionId)
      .maybeSingle()
    return (
      String(row?.easner_transaction_id || "").trim() ||
      readEasnerTransactionId(row?.metadata) ||
      null
    )
  }
  return null
}

export async function markOnrampSessionFailed(
  admin: SupabaseClient,
  input: { stripeSessionId: string; reason: string },
): Promise<void> {
  const { data: row } = await admin
    .from("stripe_onramp_sessions")
    .select("*")
    .eq("stripe_session_id", input.stripeSessionId)
    .maybeSingle()
  if (!row) return
  const now = new Date().toISOString()
  await admin
    .from("stripe_onramp_sessions")
    .update({ status: "failed", updated_at: now })
    .eq("id", row.id)
  const usdCredit = Number(row.usd_credit) || 0
  await upsertLedgerTransaction(admin, {
    userId: String(row.user_id),
    businessId: row.business_id ? String(row.business_id) : null,
    provider: "stripe",
    providerTransactionId: input.stripeSessionId,
    status: "failed",
    amount: usdCredit,
    currency: "USD",
    direction: "in",
    metadata: {
      ...asMeta(row.metadata),
      flow: "express_deposits",
      source_type: "express_deposits",
      failure_reason: input.reason,
      failed_at: now,
      payment_method: row.payment_method,
    },
    occurredAt: now,
    baseCurrency: "USD",
  })
}

export async function findStripeOnrampChainSettlementForSuppression(
  admin: SupabaseClient,
  input: { txHash: string | null; userId: string; businessId: string | null },
): Promise<boolean> {
  const txHash = String(input.txHash || "").trim()
  if (!txHash) return false

  let q = admin.from("stripe_onramp_sessions").select("id").eq("chain_tx_hash", txHash)
  if (input.businessId) q = q.eq("business_id", input.businessId)
  else q = q.eq("user_id", input.userId).is("business_id", null)
  const { data } = await q.maybeSingle()
  if (data?.id) return true

  let txQ = admin
    .from("transactions")
    .select("id, metadata")
    .eq("provider", "stripe")
    .eq("tx_hash", txHash)
    .eq("direction", "in")
  if (input.businessId) txQ = txQ.eq("business_id", input.businessId)
  else txQ = txQ.eq("user_id", input.userId).is("business_id", null)
  const { data: txRow } = await txQ.maybeSingle()
  if (!txRow?.id) return false
  const meta = asMeta(txRow.metadata)
  return meta.flow === "express_deposits" || meta.flow === "bank_onramp"
}

export async function creditOnrampSessionIfFulfilled(
  admin: SupabaseClient,
  input: { stripeSession: Record<string, unknown> },
): Promise<{ credited: boolean }> {
  const session = input.stripeSession
  const stripeSessionId = String(session.id || "").trim()
  if (!stripeSessionId) return { credited: false }
  const status = sessionStatus(session.status)
  if (!isFulfilledStatus(status)) {
    if (status.includes("fail") || status.includes("expired") || status.includes("cancel")) {
      await markOnrampSessionFailed(admin, {
        stripeSessionId,
        reason: "Payment could not be completed.",
      })
    } else {
      await admin
        .from("stripe_onramp_sessions")
        .update({ status, updated_at: new Date().toISOString(), metadata: session })
        .eq("stripe_session_id", stripeSessionId)
    }
    return { credited: false }
  }

  const { data: row } = await admin
    .from("stripe_onramp_sessions")
    .select("*")
    .eq("stripe_session_id", stripeSessionId)
    .maybeSingle()
  if (!row) return { credited: false }
  if (row.ledger_transaction_id) return { credited: false }

  const usdCredit = Number(row.usd_credit) > 0 ? Number(row.usd_credit) : readUsdCredit(session)
  if (!(usdCredit > 0)) return { credited: false }

  const creditKey = buildStripeOnrampCreditKey(stripeSessionId)
  const txHash = readTxHash(session)
  const now = new Date().toISOString()
  const userId = String(row.user_id)
  const businessId = row.business_id ? String(row.business_id) : null

  const { data: existing } = await admin
    .from("transactions")
    .select("id, metadata")
    .eq("provider", "stripe")
    .eq("provider_transaction_id", stripeSessionId)
    .maybeSingle()
  const prior = asMeta(existing?.metadata)
  if (prior.wallet_balance_credit_key === creditKey) {
    return { credited: false }
  }

  await applyWalletBalanceDelta(admin, {
    userId: businessId ? null : userId,
    businessId,
    currency: "USD",
    delta: usdCredit,
  })

  const upserted = await upsertLedgerTransaction(admin, {
    userId,
    businessId,
    provider: "stripe",
    providerTransactionId: stripeSessionId,
    status: "settled",
    amount: usdCredit,
    currency: "USD",
    direction: "in",
    payload: session,
    metadata: {
      ...prior,
      flow: "express_deposits",
      source_type: "express_deposits",
      completed_at: now,
      deposit_review:
        prior.deposit_review && typeof prior.deposit_review === "object"
          ? prior.deposit_review
          : {
              you_get: usdCredit,
              you_get_currency: "USD",
              you_pay: usdCredit,
              you_pay_currency: "USD",
              payment_method: row.payment_method,
            },
      usd_credit: usdCredit,
      payment_method: row.payment_method,
      wallet_balance_credit_key: creditKey,
      balance_delta_applied: true,
      stripe_onramp_session_id: stripeSessionId,
      ...buildWalletReportingSnapshot({ amount: usdCredit, currency: "USD", fxRates: [] }),
    },
    txHash,
    occurredAt: now,
    settledAt: now,
    baseCurrency: "USD",
  })

  await admin
    .from("stripe_onramp_sessions")
    .update({
      status: "fulfillment_complete",
      usd_credit: usdCredit,
      chain_tx_hash: txHash,
      ledger_transaction_id: upserted.transactionId,
      metadata: { ...asMeta(row.metadata), stripe: session },
      updated_at: now,
    })
    .eq("id", row.id)

  if (txHash) {
    let mirrorQ = admin
      .from("transactions")
      .select("id, metadata")
      .eq("provider", "turnkey")
      .eq("direction", "in")
      .eq("tx_hash", txHash)
    if (businessId) mirrorQ = mirrorQ.eq("business_id", businessId)
    else mirrorQ = mirrorQ.eq("user_id", userId).is("business_id", null)
    const { data: mirror } = await mirrorQ.maybeSingle()
    if (mirror?.id) {
      await admin
        .from("transactions")
        .update({
          hidden_from_feed: true,
          metadata: {
            ...asMeta(mirror.metadata),
            suppress_in_feed: true,
            stripe_onramp_chain_mirror: true,
            stripe_onramp_session_id: stripeSessionId,
          },
          updated_at: now,
        })
        .eq("id", mirror.id)
    }
  }

  return { credited: true }
}
