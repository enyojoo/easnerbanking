import type { SupabaseClient } from "@supabase/supabase-js"
import { GridHttpError, gridFetch } from "./http"
import { buildGridIdempotencyKey } from "./idempotency"
import {
  buildGridUsdcRefundSweepQuoteBody,
  loadGridCustomerInternalAccount,
  normalizeGridCustomerId,
  quantizeGridUsdcMajor,
} from "./quote-request"
import { gridMinorUnits } from "./external-account"
import { registerTurnkeyUsdcExternalAccount } from "./turnkey-external-account"
import { retrieveGridQuote } from "./quote-funding"
import { extractGridOnChainTxHash } from "./webhook-amount"
import { persistGlobalPayoutRefundTxHashOnOutRow } from "@/lib/noah/global-payout-ledger"
import type { GridQuote, GridWebhookEvent } from "./types"
import { gridWebhookQuoteId, gridWebhookTransactionId } from "./webhook-event-id"
import { classifyGridOutgoingPayoutWebhook } from "./webhook-status"

export const GRID_PAYOUT_REFUND_SWEEP_MODE = "payout_refund_turnkey_sweep" as const

const TERMINAL = new Set(["settled", "failed"])

type RefundSweepRow = {
  id: string
  user_id: string
  business_id: string | null
  transaction_id: string | null
  status: string
  grid_quote_id: string | null
  grid_transaction_id: string | null
  quoted_pay_in: number | string | null
  grid_customer_id: string | null
  metadata: Record<string, unknown>
}

function asMeta(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

function amountsRoughlyEqual(a: number, b: number): boolean {
  if (!(a > 0) || !(b > 0)) return false
  return Math.abs(a - b) <= Math.max(0.000002, a * 0.001)
}

function webhookData(event: GridWebhookEvent): Record<string, unknown> | undefined {
  return event.data && typeof event.data === "object"
    ? (event.data as Record<string, unknown>)
    : undefined
}

async function submitGridUsdcRefundQuote(input: {
  admin: SupabaseClient
  userId: string
  businessId: string | null
  customerId: string
  easnerPayoutId: string
  sourceInternalAccountId: string
  amount: number
  payoutLedgerTransactionId: string
}): Promise<{ ok: boolean; reason?: string; quoteId?: string }> {
  const externalAccountId = await registerTurnkeyUsdcExternalAccount({
    admin: input.admin,
    businessId: input.businessId,
    userId: input.userId,
    gridCustomerId: input.customerId,
  })
  if (!externalAccountId) return { ok: false, reason: "turnkey_external_account_missing" }

  const quoteBody = buildGridUsdcRefundSweepQuoteBody({
    sourceInternalAccountId: input.sourceInternalAccountId,
    turnkeyExternalAccountId: externalAccountId,
    lockedSendMinor: gridMinorUnits(input.amount, 6),
  })
  const quote = await gridFetch<GridQuote>({
    method: "POST",
    path: "/quotes",
    json: quoteBody,
    idempotencyKey: buildGridIdempotencyKey(`grid_payout_refund_${input.easnerPayoutId}`, quoteBody),
  })
  const quoteId = String(quote.id ?? "").trim()
  const outgoingId = String(quote.transactionId ?? "").trim()
  if (quoteId && !quoteLooksCompleted(quote.status) && !quoteLooksFailed(quote.status)) {
    await executeGridQuote(quoteId, input.easnerPayoutId)
  }

  const { data: payout } = await input.admin
    .from("transactions")
    .select("metadata")
    .eq("id", input.payoutLedgerTransactionId)
    .maybeSingle()
  const prior = asMeta(payout?.metadata)
  await input.admin
    .from("transactions")
    .update({
      metadata: {
        ...prior,
        grid_refund_sweep_quote_id: quoteId || undefined,
        grid_refund_sweep_transaction_id: outgoingId || undefined,
        grid_refund_expected: true,
        noah_refund_expected: true,
        grid_refund_amount: input.amount,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.payoutLedgerTransactionId)

  return { ok: true, reason: "submitted", quoteId }
}

async function executeGridQuote(quoteId: string, easnerPayoutId: string): Promise<void> {
  try {
    await gridFetch({
      method: "POST",
      path: `/quotes/${encodeURIComponent(quoteId)}/execute`,
      idempotencyKey: buildGridIdempotencyKey(`grid_payout_refund_exec_${easnerPayoutId}`, { quoteId }),
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "execute_failed"
    if (e instanceof GridHttpError && (e.status === 409 || e.status === 400)) {
      const body = JSON.stringify(e.body ?? "").toLowerCase()
      if (body.includes("already") || body.includes("executed") || body.includes("processing")) return
    }
    if (/already|executed|processing/i.test(message)) return
    throw e
  }
}

async function loadSweepByEasnerPayoutId(
  admin: SupabaseClient,
  easnerPayoutId: string,
): Promise<RefundSweepRow | null> {
  const { data } = await admin
    .from("grid_transfers")
    .select(
      "id,user_id,business_id,transaction_id,status,grid_quote_id,grid_transaction_id,quoted_pay_in,grid_customer_id,metadata",
    )
    .eq("mode", GRID_PAYOUT_REFUND_SWEEP_MODE)
    .filter("metadata->>easner_payout_id", "eq", easnerPayoutId)
    .maybeSingle()
  if (!data?.id) return null
  return { ...data, metadata: asMeta(data.metadata) } as RefundSweepRow
}

async function loadSweepById(admin: SupabaseClient, id: string): Promise<RefundSweepRow | null> {
  const { data } = await admin
    .from("grid_transfers")
    .select(
      "id,user_id,business_id,transaction_id,status,grid_quote_id,grid_transaction_id,quoted_pay_in,grid_customer_id,metadata",
    )
    .eq("id", id)
    .maybeSingle()
  if (!data?.id) return null
  return { ...data, metadata: asMeta(data.metadata) } as RefundSweepRow
}

async function patchSweep(
  admin: SupabaseClient,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await admin
    .from("grid_transfers")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
}

function quoteLooksCompleted(status: string | undefined): boolean {
  const classified = classifyGridOutgoingPayoutWebhook({ eventType: "", status })
  return classified === "settled"
}

function quoteLooksFailed(status: string | undefined): boolean {
  const classified = classifyGridOutgoingPayoutWebhook({ eventType: "", status })
  return classified === "failed"
}

/**
 * Move USDC stranded on Grid's customer internal account back to the owner Turnkey vault.
 * Does not create a user-facing ledger row – Turnkey inbound is suppressed as a payout refund.
 */
export async function startGridPayoutRefundTurnkeySweep(
  admin: SupabaseClient,
  input: {
    userId: string
    businessId: string | null
    customerId: string
    easnerPayoutId: string
    payoutLedgerTransactionId: string
    failedGridTransactionId?: string | null
    requestedAmountUsdc?: number | null
  },
): Promise<{ ok: boolean; reason?: string; transferId?: string; amount?: number }> {
  const easnerPayoutId = String(input.easnerPayoutId ?? "").trim()
  const customerId = normalizeGridCustomerId(input.customerId)
  if (!easnerPayoutId || !customerId || !input.userId) {
    return { ok: false, reason: "missing_ids" }
  }

  const existing = await loadSweepByEasnerPayoutId(admin, easnerPayoutId)
  if (existing && TERMINAL.has(existing.status)) {
    return { ok: true, reason: existing.status, transferId: existing.id }
  }

  const internal = await loadGridCustomerInternalAccount({ customerId, currency: "USDC" })
  if (!internal?.id) return { ok: false, reason: "missing_usdc_internal_account" }

  const requested = Number(input.requestedAmountUsdc ?? 0)
  const available = Number(internal.balanceMajor ?? 0)
  const amount = quantizeGridUsdcMajor(
    requested > 0 && available > 0 ? Math.min(requested, available) : available || requested,
  )
  if (!(amount > 0)) return { ok: false, reason: "no_usdc_balance" }

  const now = new Date().toISOString()
  const meta = {
    ...(existing?.metadata ?? {}),
    easner_payout_id: easnerPayoutId,
    failed_grid_transaction_id: String(input.failedGridTransactionId ?? "").trim() || undefined,
    source_internal_account_id: internal.id,
    refund_usdc_amount: amount,
    suppress_in_feed: true,
    global_payout_refund_mirror: true,
  }

  let transferId = existing?.id
  if (!transferId) {
    const { data: inserted, error } = await admin
      .from("grid_transfers")
      .insert({
        user_id: input.userId,
        business_id: input.businessId,
        transaction_id: input.payoutLedgerTransactionId,
        mode: GRID_PAYOUT_REFUND_SWEEP_MODE,
        status: "pending",
        pay_in_currency: "USDC",
        receive_currency: "USDC",
        quoted_pay_in: amount,
        quoted_receive: amount,
        grid_customer_id: customerId,
        metadata: meta,
      })
      .select("id")
      .maybeSingle()
    if (error || !inserted?.id) {
      const raced = await loadSweepByEasnerPayoutId(admin, easnerPayoutId)
      if (raced?.id) transferId = raced.id
      else {
        console.warn("[grid] payout refund sweep insert failed, quoting without transfer row:", error?.message)
        const quoted = await submitGridUsdcRefundQuote({
          admin,
          userId: input.userId,
          businessId: input.businessId,
          customerId,
          easnerPayoutId,
          sourceInternalAccountId: internal.id,
          amount,
          payoutLedgerTransactionId: input.payoutLedgerTransactionId,
        })
        return { ...quoted, amount, transferId: undefined }
      }
    } else {
      transferId = String(inserted.id)
    }
  } else {
    await patchSweep(admin, transferId, {
      metadata: meta,
      quoted_pay_in: amount,
      quoted_receive: amount,
      transaction_id: input.payoutLedgerTransactionId,
      updated_at: now,
    })
  }

  const submitted = await executeGridPayoutRefundSweep(admin, String(transferId))
  return { ...submitted, amount }
}

export async function executeGridPayoutRefundSweep(
  admin: SupabaseClient,
  transferId: string,
): Promise<{ ok: boolean; reason?: string; transferId?: string }> {
  const row = await loadSweepById(admin, transferId)
  if (!row) return { ok: false, reason: "transfer_not_found" }
  if (row.status === "settled") return { ok: true, reason: "settled", transferId: row.id }

  const easnerPayoutId = String(row.metadata.easner_payout_id ?? "").trim()
  const amount = Number(row.quoted_pay_in ?? row.metadata.refund_usdc_amount ?? 0)
  const customerId = normalizeGridCustomerId(String(row.grid_customer_id ?? ""))
  const sourceInternalAccountId = String(row.metadata.source_internal_account_id ?? "").trim()
  if (!easnerPayoutId || !(amount > 0) || !customerId || !sourceInternalAccountId) {
    return { ok: false, reason: "incomplete_sweep_row" }
  }

  const existingQuoteId = String(row.grid_quote_id ?? "").trim()
  if (existingQuoteId) {
    try {
      const quote = await retrieveGridQuote(existingQuoteId)
      const status = String(quote.status ?? "")
      if (quoteLooksFailed(status)) {
        await patchSweep(admin, row.id, {
          status: "failed",
          metadata: { ...row.metadata, sweep_error: status || "quote_failed" },
        })
        return { ok: false, reason: status || "quote_failed", transferId: row.id }
      }
      if (!quoteLooksCompleted(status)) {
        await executeGridQuote(existingQuoteId, easnerPayoutId)
      }
      await patchSweep(admin, row.id, {
        status: "processing",
        grid_transaction_id:
          String(quote.transactionId ?? row.grid_transaction_id ?? "").trim() || row.grid_transaction_id,
        metadata: { ...row.metadata, sweep_error: null, grid_quote_status: quote.status ?? null },
      })
      return { ok: true, reason: "execute_retried", transferId: row.id }
    } catch (e) {
      if (!(e instanceof GridHttpError && (e.status === 404 || e.status === 410))) {
        const message = e instanceof Error ? e.message : "quote_retrieve_failed"
        await patchSweep(admin, row.id, {
          status: "pending",
          metadata: { ...row.metadata, sweep_error: message },
        })
        return { ok: false, reason: message, transferId: row.id }
      }
    }
  }

  const externalAccountId = await registerTurnkeyUsdcExternalAccount({
    admin,
    businessId: row.business_id,
    userId: row.user_id,
    gridCustomerId: customerId,
  })
  if (!externalAccountId) {
    await patchSweep(admin, row.id, {
      status: "pending",
      metadata: { ...row.metadata, sweep_error: "turnkey_external_account_missing" },
    })
    return { ok: false, reason: "turnkey_external_account_missing", transferId: row.id }
  }

  const quoteBody = buildGridUsdcRefundSweepQuoteBody({
    sourceInternalAccountId,
    turnkeyExternalAccountId: externalAccountId,
    lockedSendMinor: gridMinorUnits(amount, 6),
  })

  try {
    const quote = await gridFetch<GridQuote>({
      method: "POST",
      path: "/quotes",
      json: quoteBody,
      idempotencyKey: buildGridIdempotencyKey(`grid_payout_refund_${easnerPayoutId}`, quoteBody),
    })
    const quoteId = String(quote.id ?? "").trim()
    const outgoingId = String(quote.transactionId ?? "").trim()
    if (quoteId && !quoteLooksCompleted(quote.status) && !quoteLooksFailed(quote.status)) {
      await executeGridQuote(quoteId, easnerPayoutId)
    }
    await patchSweep(admin, row.id, {
      status: "processing",
      grid_quote_id: quoteId || row.grid_quote_id,
      grid_transaction_id: outgoingId || row.grid_transaction_id,
      metadata: {
        ...row.metadata,
        source_internal_account_id: sourceInternalAccountId,
        sweep_error: null,
        grid_quote_status: quote.status ?? null,
      },
    })
    return { ok: true, reason: "submitted", transferId: row.id }
  } catch (e) {
    const message = e instanceof Error ? e.message : "quote_failed"
    console.warn("[grid] payout refund sweep quote failed", {
      transferId: row.id,
      easnerPayoutId,
      error: message,
    })
    await patchSweep(admin, row.id, {
      status: "pending",
      metadata: { ...row.metadata, sweep_error: message },
    })
    return { ok: false, reason: message, transferId: row.id }
  }
}

async function markRefundSweepSettled(
  admin: SupabaseClient,
  row: RefundSweepRow,
  solanaTxHash: string | null,
  outgoingId: string | null,
): Promise<void> {
  await patchSweep(admin, row.id, {
    status: "settled",
    grid_transaction_id: outgoingId || row.grid_transaction_id,
    metadata: {
      ...row.metadata,
      grid_on_chain_tx_hash: solanaTxHash,
      sweep_error: null,
    },
  })
  const payoutId = String(row.transaction_id ?? "").trim()
  if (payoutId && solanaTxHash) {
    await persistGlobalPayoutRefundTxHashOnOutRow(admin, {
      outRowId: payoutId,
      txHash: solanaTxHash,
    }).catch(() => {})
  }
}

export async function settleGridPayoutRefundSweepFromOutgoing(
  admin: SupabaseClient,
  input: { event: GridWebhookEvent },
): Promise<{ handled: boolean }> {
  const data = webhookData(input.event)
  const quoteId = gridWebhookQuoteId(data)
  const outgoingId = gridWebhookTransactionId(data)
  if (!quoteId && !outgoingId) return { handled: false }

  let row: RefundSweepRow | null = null
  if (quoteId) {
    const { data: byQuote } = await admin
      .from("grid_transfers")
      .select(
        "id,user_id,business_id,transaction_id,status,grid_quote_id,grid_transaction_id,quoted_pay_in,grid_customer_id,metadata",
      )
      .eq("mode", GRID_PAYOUT_REFUND_SWEEP_MODE)
      .eq("grid_quote_id", quoteId)
      .maybeSingle()
    if (byQuote?.id) row = { ...byQuote, metadata: asMeta(byQuote.metadata) } as RefundSweepRow
  }
  if (!row && outgoingId) {
    const { data: byTx } = await admin
      .from("grid_transfers")
      .select(
        "id,user_id,business_id,transaction_id,status,grid_quote_id,grid_transaction_id,quoted_pay_in,grid_customer_id,metadata",
      )
      .eq("mode", GRID_PAYOUT_REFUND_SWEEP_MODE)
      .eq("grid_transaction_id", outgoingId)
      .maybeSingle()
    if (byTx?.id) row = { ...byTx, metadata: asMeta(byTx.metadata) } as RefundSweepRow
  }
  if (!row) return { handled: false }

  const type = String(input.event.eventType ?? input.event.type ?? "").trim()
  const status = String(data?.status ?? "").trim()
  const classified = classifyGridOutgoingPayoutWebhook({ eventType: type, status })
  if (classified === "failed") {
    await patchSweep(admin, row.id, {
      status: "failed",
      metadata: { ...row.metadata, sweep_error: status || type || "outgoing_failed" },
    })
    return { handled: true }
  }
  if (classified !== "settled") return { handled: true }

  await markRefundSweepSettled(admin, row, extractGridOnChainTxHash(data), outgoingId)
  return { handled: true }
}

export async function settleGridPayoutRefundSweepForSolanaTx(
  admin: SupabaseClient,
  input: { transferId: string; solanaTxHash: string },
): Promise<void> {
  const row = await loadSweepById(admin, input.transferId)
  if (!row) return
  await markRefundSweepSettled(admin, row, input.solanaTxHash, row.grid_transaction_id)
}

export async function findPendingGridPayoutRefundSweepForInboundAmount(
  admin: SupabaseClient,
  input: {
    userId: string
    businessId: string | null
    amount: number
    currency: string
  },
): Promise<{ transferId: string; payoutLedgerTransactionId: string | null } | null> {
  const currency = String(input.currency || "USD").toUpperCase()
  if (currency !== "USD" && currency !== "USDC") return null
  if (!(input.amount > 0)) return null

  let q = admin
    .from("grid_transfers")
    .select("id,quoted_pay_in,metadata,status,transaction_id,user_id,business_id")
    .eq("mode", GRID_PAYOUT_REFUND_SWEEP_MODE)
    .eq("user_id", input.userId)
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: false })
    .limit(12)
  if (input.businessId) q = q.eq("business_id", input.businessId)
  else q = q.is("business_id", null)

  const { data: rows } = await q
  for (const row of rows ?? []) {
    const meta = asMeta(row.metadata)
    if (String(meta.grid_on_chain_tx_hash ?? "").trim()) continue
    const quoted = Number(row.quoted_pay_in ?? meta.refund_usdc_amount ?? 0)
    if (!amountsRoughlyEqual(quoted, input.amount)) continue
    return {
      transferId: String(row.id),
      payoutLedgerTransactionId: row.transaction_id ? String(row.transaction_id) : null,
    }
  }
  return null
}
