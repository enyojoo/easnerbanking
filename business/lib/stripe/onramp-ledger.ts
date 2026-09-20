import type { SupabaseClient } from "@supabase/supabase-js"
import { applyWalletBalanceDelta } from "@/lib/wallet/wallet-balances-db"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { readEasnerTransactionId } from "@/lib/easner-transaction-id"
import { buildWalletReportingSnapshot } from "@/lib/transactions/reporting-snapshot"
import { buildStripeOnrampCreditKey } from "@/lib/stripe/onramp-credit-key"
import { readStripeOnrampTxHash } from "@/lib/stripe/onramp-session-tx-hash"
import {
  isStripeOnrampFailedStatus,
  isStripeOnrampFulfilledStatus,
  mapStripeOnrampSessionToLedgerStatus,
  normalizeStripeOnrampSessionStatus,
} from "@/lib/stripe/onramp-session-status"
import {
  findPendingStripeOnrampSessionForInbound,
  markStripeOnrampSessionChainTxHash,
  suppressTurnkeyStripeOnrampChainMirrorRow,
} from "@/lib/stripe/stripe-onramp-turnkey-mirror"

export { buildStripeOnrampCreditKey }

function asMeta(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
}

function sessionStatus(raw: unknown): string {
  return normalizeStripeOnrampSessionStatus(raw)
}

function isFulfilledStatus(status: string): boolean {
  return isStripeOnrampFulfilledStatus(status)
}

function pickIso(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (c == null) continue
    const s = String(c).trim()
    if (s) return s
  }
  return null
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
  return readStripeOnrampTxHash(session)
}

export { readStripeOnrampTxHash } from "@/lib/stripe/onramp-session-tx-hash"

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
    depositReview?: Record<string, unknown> | null
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
    await deleteStaleExpressDepositProcessingSessions(admin, {
      userId: input.userId,
      businessId: input.businessId,
      keepSessionId: input.stripeSessionId,
    })
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
        deposit_review: input.depositReview ?? {
          you_get: input.usdCredit,
          you_get_currency: "USD",
          you_pay: input.sourceAmount ?? input.usdCredit,
          you_pay_currency: String(input.sourceCurrency || "usd").toUpperCase(),
          payment_method: input.paymentMethod,
        },
        usd_credit: input.usdCredit,
        payment_method: input.paymentMethod,
        stripe_onramp_session_id: input.stripeSessionId,
      },
      occurredAt: now,
      baseCurrency: "USD",
    })
    await admin
      .from("stripe_onramp_sessions")
      .update({
        ledger_transaction_id: upserted.transactionId,
        updated_at: now,
      })
      .eq("stripe_session_id", input.stripeSessionId)
      .is("ledger_transaction_id", null)
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
  const priorMeta = asMeta(row.metadata)
  const { data: existing } = await admin
    .from("transactions")
    .select("metadata")
    .eq("provider", "stripe")
    .eq("provider_transaction_id", input.stripeSessionId)
    .maybeSingle()
  const ledgerPrior = asMeta(existing?.metadata)
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
      ...ledgerPrior,
      ...priorMeta,
      flow: "express_deposits",
      source_type: "express_deposits",
      processing_at: pickIso(ledgerPrior.processing_at, priorMeta.processing_at, row.created_at) ?? now,
      failure_reason: input.reason,
      failed_at: now,
      payment_method: row.payment_method,
      stripe_onramp_session_id: input.stripeSessionId,
    },
    occurredAt: pickIso(ledgerPrior.processing_at, priorMeta.processing_at, row.created_at) ?? now,
    baseCurrency: "USD",
  })
}

export type StripeOnrampChainSuppressionMatch = { kind: "hash" } | { kind: "amount" }

export async function findStripeOnrampChainSettlementForSuppression(
  admin: SupabaseClient,
  input: {
    txHash: string | null
    userId: string
    businessId: string | null
    walletAddress?: string | null
    amount?: number | null
  },
): Promise<StripeOnrampChainSuppressionMatch | null> {
  const txHash = String(input.txHash || "").trim()
  if (txHash) {
    let q = admin.from("stripe_onramp_sessions").select("id").eq("chain_tx_hash", txHash)
    if (input.businessId) q = q.eq("business_id", input.businessId)
    else q = q.eq("user_id", input.userId).is("business_id", null)
    const { data } = await q.maybeSingle()
    if (data?.id) return { kind: "hash" }

    let txQ = admin
      .from("transactions")
      .select("id, metadata")
      .eq("provider", "stripe")
      .eq("tx_hash", txHash)
      .eq("direction", "in")
    if (input.businessId) txQ = txQ.eq("business_id", input.businessId)
    else txQ = txQ.eq("user_id", input.userId).is("business_id", null)
    const { data: txRow } = await txQ.maybeSingle()
    if (txRow?.id) {
      const meta = asMeta(txRow.metadata)
      if (meta.flow === "express_deposits" || meta.flow === "bank_onramp") return { kind: "hash" }
    }
  }

  const walletAddress = String(input.walletAddress || "").trim()
  const amount = Number(input.amount ?? 0)
  if (walletAddress && amount > 0) {
    const pending = await findPendingStripeOnrampSessionForInbound(admin, {
      userId: input.userId,
      businessId: input.businessId,
      walletAddress,
      amount,
      txHash,
    })
    if (pending) return { kind: "amount" }
  }

  return null
}

async function deleteStaleExpressDepositProcessingSessions(
  admin: SupabaseClient,
  input: { userId: string; businessId: string | null; keepSessionId?: string | null },
): Promise<void> {
  const keepSessionId = String(input.keepSessionId || "").trim()
  let q = admin
    .from("transactions")
    .select("id, provider_transaction_id")
    .eq("provider", "stripe")
    .eq("direction", "in")
    .eq("status", "processing")
    .filter("metadata->>flow", "eq", "express_deposits")
  if (input.businessId) q = q.eq("business_id", input.businessId)
  else q = q.eq("user_id", input.userId).is("business_id", null)
  const { data: rows } = await q.limit(24)
  const now = new Date().toISOString()
  for (const row of rows ?? []) {
    const sessionId = String(row.provider_transaction_id || "").trim()
    if (keepSessionId && sessionId === keepSessionId) continue
    await admin.from("transactions").delete().eq("id", row.id)
    if (sessionId) {
      await admin
        .from("stripe_onramp_sessions")
        .update({ status: "failed", updated_at: now })
        .eq("stripe_session_id", sessionId)
        .neq("status", "fulfillment_complete")
    }
  }
}

/** Keep one express-deposit ledger row per Stripe session; update status as webhooks arrive. */
export async function syncExpressDepositLedgerFromOnrampWebhook(
  admin: SupabaseClient,
  input: { stripeSession: Record<string, unknown> },
): Promise<{ credited: boolean }> {
  const session = input.stripeSession
  const stripeSessionId = String(session.id || "").trim()
  if (!stripeSessionId) return { credited: false }

  const status = sessionStatus(session.status)
  if (isFulfilledStatus(status)) {
    return creditOnrampSessionIfFulfilled(admin, input)
  }
  if (isStripeOnrampFailedStatus(status)) {
    await markOnrampSessionFailed(admin, {
      stripeSessionId,
      reason: "Payment could not be completed.",
    })
    return { credited: false }
  }

  const { data: row } = await admin
    .from("stripe_onramp_sessions")
    .select("*")
    .eq("stripe_session_id", stripeSessionId)
    .maybeSingle()
  if (!row) return { credited: false }

  const now = new Date().toISOString()
  await admin
    .from("stripe_onramp_sessions")
    .update({
      status,
      updated_at: now,
      metadata: { ...asMeta(row.metadata), stripe: session },
    })
    .eq("stripe_session_id", stripeSessionId)

  const usdCredit = Number(row.usd_credit) > 0 ? Number(row.usd_credit) : readUsdCredit(session)
  if (!(usdCredit > 0)) return { credited: false }

  const userId = String(row.user_id)
  const businessId = row.business_id ? String(row.business_id) : null
  const { data: existing } = await admin
    .from("transactions")
    .select("id, metadata")
    .eq("provider", "stripe")
    .eq("provider_transaction_id", stripeSessionId)
    .maybeSingle()
  const prior = asMeta(existing?.metadata)
  const processingAt = pickIso(prior.processing_at, row.created_at) ?? now

  const upserted = await upsertLedgerTransaction(admin, {
    userId,
    businessId,
    provider: "stripe",
    providerTransactionId: stripeSessionId,
    status: mapStripeOnrampSessionToLedgerStatus(status),
    amount: usdCredit,
    currency: "USD",
    direction: "in",
    payload: session,
    metadata: {
      ...prior,
      flow: "express_deposits",
      source_type: "express_deposits",
      processing_at: processingAt,
      usd_credit: usdCredit,
      payment_method: row.payment_method,
      stripe_onramp_session_id: stripeSessionId,
      stripe_onramp_status: status,
    },
    occurredAt: processingAt,
    baseCurrency: "USD",
  })

  await admin
    .from("stripe_onramp_sessions")
    .update({
      ledger_transaction_id: upserted.transactionId,
      updated_at: now,
    })
    .eq("stripe_session_id", stripeSessionId)
    .is("ledger_transaction_id", null)

  return { credited: false }
}

export async function creditOnrampSessionIfFulfilled(
  admin: SupabaseClient,
  input: { stripeSession: Record<string, unknown> },
): Promise<{ credited: boolean }> {
  const session = input.stripeSession
  const stripeSessionId = String(session.id || "").trim()
  if (!stripeSessionId) return { credited: false }
  const { creditPlatformOnrampFromStripeSession } = await import("@/lib/platform/receive")
  if (await creditPlatformOnrampFromStripeSession(admin, session)) {
    return { credited: true }
  }
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

  const usdCredit = Number(row.usd_credit) > 0 ? Number(row.usd_credit) : readUsdCredit(session)
  if (!(usdCredit > 0)) return { credited: false }

  const creditKey = buildStripeOnrampCreditKey(stripeSessionId)
  const txHash = readTxHash(session)
  const userId = String(row.user_id)
  const businessId = row.business_id ? String(row.business_id) : null

  const { data: existing } = await admin
    .from("transactions")
    .select("id, metadata, status")
    .eq("provider", "stripe")
    .eq("provider_transaction_id", stripeSessionId)
    .maybeSingle()
  const prior = asMeta(existing?.metadata)
  if (prior.wallet_balance_credit_key === creditKey) {
    return { credited: false }
  }

  const processingAt = pickIso(prior.processing_at, row.created_at) ?? new Date().toISOString()
  const now = new Date().toISOString()
  const alreadyCredited = prior.balance_delta_applied === true

  if (!alreadyCredited) {
    await applyWalletBalanceDelta(admin, {
      userId: businessId ? null : userId,
      businessId,
      currency: "USD",
      delta: usdCredit,
    })
  }

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
      processing_at: processingAt,
      completed_at: pickIso(prior.completed_at) ?? now,
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
      stripe_onramp_status: status,
      ...buildWalletReportingSnapshot({ amount: usdCredit, currency: "USD", fxRates: [] }),
    },
    txHash,
    occurredAt: processingAt,
    settledAt: pickIso(prior.completed_at) ?? now,
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
    await suppressTurnkeyStripeOnrampChainMirrorRow(admin, {
      txHash,
      userId,
      businessId,
      stripeSessionId,
    })
    await markStripeOnrampSessionChainTxHash(admin, { stripeSessionId, txHash })
  }

  await deleteStaleExpressDepositProcessingSessions(admin, {
    userId,
    businessId,
    keepSessionId: stripeSessionId,
  })

  return { credited: !alreadyCredited }
}
