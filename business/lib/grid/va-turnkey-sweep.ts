import type { SupabaseClient } from "@supabase/supabase-js"
import { GridHttpError, gridFetch } from "./http"
import { buildGridIdempotencyKey } from "./idempotency"
import {
  buildGridVaTurnkeySweepQuoteBody,
  normalizeGridCustomerId,
  resolveGridCustomerInternalAccountId,
} from "./quote-request"
import { gridMinorUnits } from "./external-account"
import { registerTurnkeyUsdcExternalAccount } from "./turnkey-external-account"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { retrieveGridQuote } from "./quote-funding"
import {
  extractGridOnChainTxHash,
  resolveGridVaInboundWalletCredit,
} from "./webhook-amount"
import {
  gridWebhookCustomerId,
  gridWebhookDestinationAccountId,
  gridWebhookQuoteId,
  gridWebhookTransactionId,
} from "./webhook-event-id"
import type { GridQuote, GridWebhookEvent } from "./types"
import { reconcileGridVaBankDepositCreditForSolanaTx } from "./grid-bank-deposit-credit"
import { GRID_VA_TURNKEY_DUST_MAX_USD, isGridVaTurnkeyDustAmount } from "./grid-va-turnkey-dust"
import { suppressTurnkeyGridVaChainMirrorRow } from "./grid-va-turnkey-mirror"

export { suppressTurnkeyGridVaChainMirrorRow }

export const GRID_VA_TURNKEY_SWEEP_MODE = "va_turnkey_sweep" as const

const TERMINAL_SWEEP = new Set(["settled", "failed"])

type SweepTransferRow = {
  id: string
  user_id: string
  business_id: string | null
  transaction_id: string | null
  status: string
  grid_quote_id: string | null
  grid_transaction_id: string | null
  external_account_id: string | null
  grid_customer_id: string | null
  quoted_pay_in: number | string | null
  metadata: Record<string, unknown>
}

function webhookData(event: GridWebhookEvent): Record<string, unknown> | undefined {
  return event.data && typeof event.data === "object"
    ? (event.data as Record<string, unknown>)
    : undefined
}

function asMeta(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

function amountsRoughlyEqual(a: number, b: number): boolean {
  if (!(a > 0) || !(b > 0)) return false
  return Math.abs(a - b) <= Math.max(0.02, a * 0.001)
}

export function parseGridInternalAccountId(raw: string | null | undefined): string | null {
  const match = String(raw ?? "").trim().match(/^(InternalAccount:[A-Za-z0-9-]+)/)
  return match?.[1] ?? null
}

function quoteStatusLooksCompleted(status: string | undefined): boolean {
  const s = String(status ?? "").toUpperCase()
  return s.includes("COMPLETED") || s.includes("SETTLED") || s === "EXECUTED" || s.includes("PROCESSING")
}

function quoteStatusLooksFailed(status: string | undefined): boolean {
  const s = String(status ?? "").toUpperCase()
  return s.includes("FAILED") || s.includes("EXPIRED") || s.includes("CANCELLED") || s.includes("CANCELED")
}

async function resolveUsdInternalAccountId(
  admin: SupabaseClient,
  input: { businessId: string; customerId: string },
): Promise<string> {
  const { data: va } = await admin
    .from("virtual_accounts")
    .select("provider_virtual_account_id")
    .eq("business_id", input.businessId)
    .eq("provider", "grid")
    .eq("currency", "usd")
    .maybeSingle()
  const fromVa = parseGridInternalAccountId(va?.provider_virtual_account_id)
  if (fromVa) return fromVa
  return (await resolveGridCustomerInternalAccountId({ customerId: input.customerId, currency: "USD" })) ?? ""
}

async function executeGridQuote(quoteId: string, inboundId: string): Promise<void> {
  try {
    await gridFetch({
      method: "POST",
      path: `/quotes/${encodeURIComponent(quoteId)}/execute`,
      idempotencyKey: buildGridIdempotencyKey(`grid_va_sweep_exec_${inboundId}`, { quoteId }),
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

async function loadSweepByInbound(
  admin: SupabaseClient,
  inboundGridTransactionId: string,
): Promise<SweepTransferRow | null> {
  const { data } = await admin
    .from("grid_transfers")
    .select(
      "id,user_id,business_id,transaction_id,status,grid_quote_id,grid_transaction_id,external_account_id,grid_customer_id,quoted_pay_in,metadata",
    )
    .eq("mode", GRID_VA_TURNKEY_SWEEP_MODE)
    .filter("metadata->>inbound_grid_transaction_id", "eq", inboundGridTransactionId)
    .maybeSingle()
  if (!data?.id) return null
  return {
    ...data,
    metadata: asMeta(data.metadata),
  } as SweepTransferRow
}

async function loadSweepById(admin: SupabaseClient, id: string): Promise<SweepTransferRow | null> {
  const { data } = await admin
    .from("grid_transfers")
    .select(
      "id,user_id,business_id,transaction_id,status,grid_quote_id,grid_transaction_id,external_account_id,grid_customer_id,quoted_pay_in,metadata",
    )
    .eq("id", id)
    .maybeSingle()
  if (!data?.id) return null
  return {
    ...data,
    metadata: asMeta(data.metadata),
  } as SweepTransferRow
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

async function attachHashToLedger(
  admin: SupabaseClient,
  input: {
    userId: string
    businessId: string | null
    ledgerTransactionId?: string | null
    inboundGridTransactionId: string
    solanaTxHash: string
    amount: number
  },
): Promise<void> {
  let ledgerId = String(input.ledgerTransactionId ?? "").trim()
  if (!ledgerId) {
    const { data } = await admin
      .from("transactions")
      .select("id")
      .eq("provider", "grid")
      .eq("provider_transaction_id", input.inboundGridTransactionId)
      .maybeSingle()
    ledgerId = String(data?.id ?? "").trim()
  }
  if (!ledgerId) return

  await admin
    .from("transactions")
    .update({
      tx_hash: input.solanaTxHash,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ledgerId)

  await reconcileGridVaBankDepositCreditForSolanaTx(admin, {
    solanaTxHash: input.solanaTxHash,
    userId: input.userId,
    businessId: input.businessId,
    inboundAmount: input.amount,
    ledgerCurrency: "USD",
  })
}

export async function startGridVaTurnkeySweepFromInbound(
  admin: SupabaseClient,
  input: { event: GridWebhookEvent; ledgerTransactionId?: string | null },
): Promise<{ ok: boolean; reason?: string; transferId?: string }> {
  const data = webhookData(input.event)
  if (!data) return { ok: false, reason: "no_data" }

  const customerId = normalizeGridCustomerId(gridWebhookCustomerId(data))
  const inboundGridTransactionId = gridWebhookTransactionId(data)
  if (!customerId || !inboundGridTransactionId) {
    return { ok: false, reason: "missing_ids" }
  }

  const credit = resolveGridVaInboundWalletCredit(data)
  if (!credit || credit.ledgerCurrency !== "USD") {
    return { ok: false, reason: "unsupported_currency" }
  }

  const { data: biz } = await admin
    .from("businesses")
    .select("id")
    .eq("grid_customer_id", customerId)
    .maybeSingle()
  const businessId = biz?.id ? String(biz.id) : ""
  if (!businessId) return { ok: false, reason: "business_not_found" }

  const userId = await resolveBusinessOrgOwnerUserId(admin, businessId)
  if (!userId) return { ok: false, reason: "owner_not_found" }

  let sourceInternalAccountId =
    parseGridInternalAccountId(gridWebhookDestinationAccountId(data)) ?? ""
  if (!sourceInternalAccountId) {
    sourceInternalAccountId = await resolveUsdInternalAccountId(admin, { businessId, customerId })
  }

  return startGridVaTurnkeySweepForKnownInbound(admin, {
    userId,
    businessId,
    customerId,
    inboundGridTransactionId,
    sourceInternalAccountId,
    amount: credit.amount,
    ledgerTransactionId: input.ledgerTransactionId,
  })
}

export async function startGridVaTurnkeySweepForKnownInbound(
  admin: SupabaseClient,
  input: {
    userId: string
    businessId: string
    customerId: string
    inboundGridTransactionId: string
    sourceInternalAccountId?: string | null
    amount: number
    ledgerTransactionId?: string | null
  },
): Promise<{ ok: boolean; reason?: string; transferId?: string }> {
  const inboundGridTransactionId = String(input.inboundGridTransactionId ?? "").trim()
  const customerId = normalizeGridCustomerId(input.customerId)
  const amount = Number(input.amount)
  if (!inboundGridTransactionId || !customerId || !(amount > 0) || !input.businessId) {
    return { ok: false, reason: "missing_ids" }
  }

  let sourceInternalAccountId = parseGridInternalAccountId(input.sourceInternalAccountId) ?? ""
  if (!sourceInternalAccountId) {
    sourceInternalAccountId = await resolveUsdInternalAccountId(admin, {
      businessId: input.businessId,
      customerId,
    })
  }
  if (!sourceInternalAccountId) return { ok: false, reason: "missing_source_account" }

  const existing = await loadSweepByInbound(admin, inboundGridTransactionId)
  if (existing && TERMINAL_SWEEP.has(existing.status)) {
    return { ok: true, reason: existing.status, transferId: existing.id }
  }

  let transferId = existing?.id
  const now = new Date().toISOString()
  const meta = {
    ...(existing?.metadata ?? {}),
    inbound_grid_transaction_id: inboundGridTransactionId,
    source_internal_account_id: sourceInternalAccountId,
    inbound_amount: amount,
    ledger_currency: "USD",
  }

  if (!transferId) {
    const { data: inserted, error } = await admin
      .from("grid_transfers")
      .insert({
        user_id: input.userId,
        business_id: input.businessId,
        transaction_id: input.ledgerTransactionId ?? null,
        mode: GRID_VA_TURNKEY_SWEEP_MODE,
        status: "pending",
        pay_in_currency: "USD",
        receive_currency: "USDC",
        quoted_pay_in: amount,
        quoted_receive: amount,
        grid_customer_id: customerId,
        metadata: meta,
      })
      .select("id")
      .maybeSingle()
    if (error || !inserted?.id) {
      const raced = await loadSweepByInbound(admin, inboundGridTransactionId)
      if (raced?.id) transferId = raced.id
      else {
        console.warn("[grid] va turnkey sweep insert failed:", error?.message)
        return { ok: false, reason: "insert_failed" }
      }
    } else {
      transferId = String(inserted.id)
    }
  } else {
    await patchSweep(admin, transferId, {
      metadata: meta,
      ...(input.ledgerTransactionId ? { transaction_id: input.ledgerTransactionId } : {}),
      quoted_pay_in: amount,
      quoted_receive: amount,
      updated_at: now,
    })
  }

  return executeGridVaTurnkeySweep(admin, String(transferId))
}

export async function executeGridVaTurnkeySweep(
  admin: SupabaseClient,
  transferId: string,
): Promise<{ ok: boolean; reason?: string; transferId?: string }> {
  const row = await loadSweepById(admin, transferId)
  if (!row) return { ok: false, reason: "transfer_not_found" }
  if (TERMINAL_SWEEP.has(row.status) && row.status === "settled") {
    return { ok: true, reason: "settled", transferId: row.id }
  }

  const inboundId = String(row.metadata.inbound_grid_transaction_id ?? "").trim()
  let sourceInternalAccountId = String(row.metadata.source_internal_account_id ?? "").trim()
  const amount = Number(row.quoted_pay_in ?? row.metadata.inbound_amount ?? 0)
  const customerId = normalizeGridCustomerId(String(row.grid_customer_id ?? ""))
  const businessId = String(row.business_id ?? "").trim()
  if (!inboundId || !(amount > 0) || !customerId || !businessId) {
    return { ok: false, reason: "incomplete_sweep_row" }
  }
  if (!sourceInternalAccountId) {
    sourceInternalAccountId = await resolveUsdInternalAccountId(admin, { businessId, customerId })
    if (sourceInternalAccountId) {
      await patchSweep(admin, row.id, {
        metadata: { ...row.metadata, source_internal_account_id: sourceInternalAccountId },
      })
    }
  }
  if (!sourceInternalAccountId) return { ok: false, reason: "incomplete_sweep_row" }

  const existingQuoteId = String(row.grid_quote_id ?? "").trim()
  if (existingQuoteId) {
    try {
      const quote = await retrieveGridQuote(existingQuoteId)
      const status = String(quote.status ?? "")
      if (quoteStatusLooksFailed(status)) {
        await patchSweep(admin, row.id, {
          status: "failed",
          metadata: { ...row.metadata, sweep_error: status || "quote_failed" },
        })
        return { ok: false, reason: status || "quote_failed", transferId: row.id }
      }
      if (!quoteStatusLooksCompleted(status)) {
        await executeGridQuote(existingQuoteId, inboundId)
      }
      await patchSweep(admin, row.id, {
        status: "processing",
        grid_transaction_id: String(quote.transactionId ?? row.grid_transaction_id ?? "").trim() || row.grid_transaction_id,
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
    businessId,
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

  const quoteBody = buildGridVaTurnkeySweepQuoteBody({
    sourceInternalAccountId,
    turnkeyExternalAccountId: externalAccountId,
    lockedSendMinor: gridMinorUnits(amount, 2),
  })

  try {
    const quote = await gridFetch<GridQuote>({
      method: "POST",
      path: "/quotes",
      json: quoteBody,
      idempotencyKey: buildGridIdempotencyKey(`grid_va_sweep_${inboundId}`, quoteBody),
    })
    const quoteId = String(quote.id ?? "").trim()
    const outgoingId = String(quote.transactionId ?? "").trim()
    if (quoteId && !quoteStatusLooksCompleted(quote.status) && !quoteStatusLooksFailed(quote.status)) {
      await executeGridQuote(quoteId, inboundId)
    }
    await patchSweep(admin, row.id, {
      status: "processing",
      grid_quote_id: quoteId || row.grid_quote_id,
      grid_transaction_id: outgoingId || row.grid_transaction_id,
      external_account_id: externalAccountId,
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
    console.warn("[grid] va turnkey sweep quote failed", {
      transferId: row.id,
      inboundId,
      error: message,
    })
    await patchSweep(admin, row.id, {
      status: "pending",
      metadata: { ...row.metadata, sweep_error: message },
    })
    return { ok: false, reason: message, transferId: row.id }
  }
}

export async function settleGridVaTurnkeySweepFromOutgoing(
  admin: SupabaseClient,
  input: { event: GridWebhookEvent },
): Promise<{ handled: boolean }> {
  const data = webhookData(input.event)
  const quoteId = gridWebhookQuoteId(data)
  const outgoingId = gridWebhookTransactionId(data)
  if (!quoteId && !outgoingId) return { handled: false }

  let row: SweepTransferRow | null = null
  if (quoteId) {
    const { data: byQuote } = await admin
      .from("grid_transfers")
      .select(
        "id,user_id,business_id,transaction_id,status,grid_quote_id,grid_transaction_id,external_account_id,grid_customer_id,quoted_pay_in,metadata",
      )
      .eq("mode", GRID_VA_TURNKEY_SWEEP_MODE)
      .eq("grid_quote_id", quoteId)
      .maybeSingle()
    if (byQuote?.id) row = { ...byQuote, metadata: asMeta(byQuote.metadata) } as SweepTransferRow
  }
  if (!row && outgoingId) {
    const { data: byTx } = await admin
      .from("grid_transfers")
      .select(
        "id,user_id,business_id,transaction_id,status,grid_quote_id,grid_transaction_id,external_account_id,grid_customer_id,quoted_pay_in,metadata",
      )
      .eq("mode", GRID_VA_TURNKEY_SWEEP_MODE)
      .eq("grid_transaction_id", outgoingId)
      .maybeSingle()
    if (byTx?.id) row = { ...byTx, metadata: asMeta(byTx.metadata) } as SweepTransferRow
  }
  if (!row) return { handled: false }

  const status = String(data?.status ?? input.event.eventType ?? "").toUpperCase()
  const failed = status.includes("FAILED") || status.includes("EXPIRED")
  const completed =
    status.includes("COMPLETED") || status.includes("SETTLED") || String(input.event.eventType ?? "").includes("COMPLETED")

  if (failed) {
    await patchSweep(admin, row.id, {
      status: "failed",
      metadata: { ...row.metadata, sweep_error: status || "outgoing_failed" },
    })
    return { handled: true }
  }
  if (!completed) return { handled: true }

  const hash = extractGridOnChainTxHash(data)
  const amount = Number(row.quoted_pay_in ?? row.metadata.inbound_amount ?? 0)
  const inboundId = String(row.metadata.inbound_grid_transaction_id ?? "").trim()
  await patchSweep(admin, row.id, {
    status: "settled",
    grid_transaction_id: outgoingId || row.grid_transaction_id,
    metadata: {
      ...row.metadata,
      grid_on_chain_tx_hash: hash,
      sweep_error: null,
    },
  })
  if (hash) {
    await attachHashToLedger(admin, {
      userId: row.user_id,
      businessId: row.business_id,
      ledgerTransactionId: row.transaction_id,
      inboundGridTransactionId: inboundId,
      solanaTxHash: hash,
      amount,
    })
  }
  return { handled: true }
}

export async function settleGridVaTurnkeySweepForSolanaTx(
  admin: SupabaseClient,
  input: {
    transferId: string
    solanaTxHash: string
    inboundAmount?: number
  },
): Promise<void> {
  const row = await loadSweepById(admin, input.transferId)
  if (!row) return
  const amount = Number(row.quoted_pay_in ?? row.metadata.inbound_amount ?? 0)
  const inboundId = String(row.metadata.inbound_grid_transaction_id ?? "").trim()
  const solanaTxHash = String(input.solanaTxHash ?? "").trim()
  const isDust = input.inboundAmount != null && isGridVaTurnkeyDustAmount(input.inboundAmount)
  const priorGridHash = String(row.metadata.grid_on_chain_tx_hash ?? "").trim()

  await patchSweep(admin, row.id, {
    status: "settled",
    metadata: {
      ...row.metadata,
      sweep_error: null,
      ...(isDust
        ? { turnkey_dust_tx_hash: solanaTxHash }
        : {
            turnkey_on_chain_tx_hash: solanaTxHash,
            grid_on_chain_tx_hash: priorGridHash || solanaTxHash,
          }),
    },
  })
  if (!isDust) {
    await attachHashToLedger(admin, {
      userId: row.user_id,
      businessId: row.business_id,
      ledgerTransactionId: row.transaction_id,
      inboundGridTransactionId: inboundId,
      solanaTxHash,
      amount,
    })
  }
  if (solanaTxHash) {
    await suppressTurnkeyGridVaChainMirrorRow(admin, {
      txHash: solanaTxHash,
      userId: row.user_id,
      businessId: row.business_id,
    }).catch(() => {})
  }
}

/**
 * Match a Grid VA Turnkey sweep to an on-chain signature.
 * Grid's outgoing webhook often records a different hash than the Turnkey wallet credit.
 * Dust legs are linked FIFO to a recent sweep without overwriting the principal hash.
 */
export async function findGridVaTurnkeySweepForSolanaTx(
  admin: SupabaseClient,
  input: {
    txHash: string
    businessId: string | null
    userId: string
    amount?: number
  },
): Promise<{ transferId: string } | null> {
  const txHash = String(input.txHash ?? "").trim()
  const businessId = String(input.businessId ?? "").trim()
  if (!txHash || !businessId) return null

  for (const metaKey of ["grid_on_chain_tx_hash", "turnkey_on_chain_tx_hash", "turnkey_dust_tx_hash"] as const) {
    const { data: linked } = await admin
      .from("grid_transfers")
      .select("id")
      .eq("mode", GRID_VA_TURNKEY_SWEEP_MODE)
      .eq("business_id", businessId)
      .filter(`metadata->>${metaKey}`, "eq", txHash)
      .maybeSingle()
    if (linked?.id) return { transferId: String(linked.id) }
  }

  const { data: rows } = await admin
    .from("grid_transfers")
    .select("id,metadata,status,updated_at,quoted_pay_in,created_at")
    .eq("mode", GRID_VA_TURNKEY_SWEEP_MODE)
    .eq("business_id", businessId)
    .in("status", ["settled", "processing", "pending"])
    .order("updated_at", { ascending: true })
    .limit(24)

  const inboundAmount = Number(input.amount)
  const dust = Number.isFinite(inboundAmount) && isGridVaTurnkeyDustAmount(inboundAmount)
  const dustCutoffMs = Date.now() - 2 * 60 * 60 * 1000
  const hasPrincipalAmount = Number.isFinite(inboundAmount) && inboundAmount >= GRID_VA_TURNKEY_DUST_MAX_USD

  for (const row of rows ?? []) {
    const meta = asMeta(row.metadata)
    const gridHash = String(meta.grid_on_chain_tx_hash ?? "").trim()
    const turnkeyHash = String(meta.turnkey_on_chain_tx_hash ?? "").trim()
    const dustHash = String(meta.turnkey_dust_tx_hash ?? "").trim()
    if (gridHash === txHash || turnkeyHash === txHash || dustHash === txHash) {
      return { transferId: String(row.id) }
    }
  }

  if (hasPrincipalAmount) {
    for (const row of rows ?? []) {
      const meta = asMeta(row.metadata)
      if (String(meta.turnkey_on_chain_tx_hash ?? "").trim()) continue
      const quoted = Number(row.quoted_pay_in ?? meta.inbound_amount ?? 0)
      if (!amountsRoughlyEqual(quoted, inboundAmount)) continue
      return { transferId: String(row.id) }
    }
  }

  if (!dust) {
    for (const row of rows ?? []) {
      const meta = asMeta(row.metadata)
      if (String(meta.grid_on_chain_tx_hash ?? "").trim()) continue
      if (String(meta.turnkey_on_chain_tx_hash ?? "").trim()) continue
      return { transferId: String(row.id) }
    }
  }

  if (dust) {
    for (const row of [...(rows ?? [])].reverse()) {
      const meta = asMeta(row.metadata)
      if (String(meta.turnkey_dust_tx_hash ?? "").trim()) continue
      const updatedAt = Date.parse(String(row.updated_at ?? row.created_at ?? ""))
      if (Number.isFinite(updatedAt) && updatedAt < dustCutoffMs) continue
      return { transferId: String(row.id) }
    }
  }

  return null
}

export async function findPendingGridVaTurnkeySweepForInboundAmount(
  admin: SupabaseClient,
  input: {
    userId: string
    businessId: string | null
    amount: number
    currency: string
  },
): Promise<{ transferId: string } | null> {
  if (String(input.currency || "USD").toUpperCase() !== "USD") return null
  if (!(input.amount > 0) || isGridVaTurnkeyDustAmount(input.amount) || !input.businessId) return null

  const { data: rows } = await admin
    .from("grid_transfers")
    .select("id,quoted_pay_in,metadata,status")
    .eq("mode", GRID_VA_TURNKEY_SWEEP_MODE)
    .eq("business_id", input.businessId)
    .in("status", ["pending", "processing", "settled"])
    .order("created_at", { ascending: false })
    .limit(12)

  for (const row of rows ?? []) {
    const meta = asMeta(row.metadata)
    if (String(meta.turnkey_on_chain_tx_hash ?? "").trim()) continue
    const quoted = Number(row.quoted_pay_in ?? meta.inbound_amount ?? 0)
    if (!amountsRoughlyEqual(quoted, input.amount)) continue
    return { transferId: String(row.id) }
  }
  return null
}

export async function enqueueMissingGridVaTurnkeySweeps(
  admin: SupabaseClient,
  opts: { limit?: number; olderThanMs?: number } = {},
): Promise<{ enqueued: number }> {
  const limit = Math.max(1, Math.min(50, opts.limit ?? 25))
  const olderThanMs = opts.olderThanMs ?? 2 * 60_000
  const cutoff = new Date(Date.now() - olderThanMs).toISOString()
  let enqueued = 0

  const { data: deposits } = await admin
    .from("transactions")
    .select("id,user_id,business_id,amount,payload,metadata,provider_transaction_id")
    .eq("provider", "grid")
    .eq("direction", "in")
    .eq("status", "settled")
    .is("tx_hash", null)
    .filter("metadata->>grid_va_inbound", "eq", "true")
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(limit)

  for (const row of deposits ?? []) {
    const meta = asMeta(row.metadata)
    if (String(meta.grid_on_chain_tx_hash ?? "").trim()) continue
    const inboundId = String(meta.grid_transaction_id ?? row.provider_transaction_id ?? "").trim()
    const businessId = String(row.business_id ?? "").trim()
    const userId = String(row.user_id ?? "").trim()
    const customerId = normalizeGridCustomerId(String(meta.grid_customer_id ?? ""))
    const amount = Number(meta.settled_stablecoin_amount ?? row.amount ?? 0)
    if (!inboundId || !businessId || !userId || !customerId || !(amount > 0)) continue
    const payload = row.payload && typeof row.payload === "object" ? (row.payload as Record<string, unknown>) : {}
    const sourceInternalAccountId = parseGridInternalAccountId(gridWebhookDestinationAccountId(payload))
    const result = await startGridVaTurnkeySweepForKnownInbound(admin, {
      userId,
      businessId,
      customerId,
      inboundGridTransactionId: inboundId,
      sourceInternalAccountId,
      amount,
      ledgerTransactionId: String(row.id),
    })
    if (result.ok) enqueued += 1
  }

  const { data: settlements } = await admin
    .from("grid_transfers")
    .select("id,user_id,business_id,grid_customer_id,grid_transaction_id,quoted_receive,quoted_pay_in")
    .eq("mode", "stripe_settlement")
    .eq("settlement_rail", "grid_va")
    .eq("status", "settled")
    .not("grid_transaction_id", "is", null)
    .lt("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(limit)

  for (const row of settlements ?? []) {
    const inboundId = String(row.grid_transaction_id ?? "").trim()
    const businessId = String(row.business_id ?? "").trim()
    const userId = String(row.user_id ?? "").trim()
    const customerId = normalizeGridCustomerId(String(row.grid_customer_id ?? ""))
    const amount = Number(row.quoted_receive ?? row.quoted_pay_in ?? 0)
    if (!inboundId || !businessId || !userId || !customerId || !(amount > 0)) continue
    const existing = await loadSweepByInbound(admin, inboundId)
    if (existing) continue
    const result = await startGridVaTurnkeySweepForKnownInbound(admin, {
      userId,
      businessId,
      customerId,
      inboundGridTransactionId: inboundId,
      amount,
    })
    if (result.ok) enqueued += 1
  }

  return { enqueued }
}
