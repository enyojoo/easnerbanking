/** Ledger field mapping for Noah global fiat payouts (no @easner/shared imports). */

import type { SupabaseClient } from "@supabase/supabase-js"
import {
  formatNoahAccountHolderName,
  pickNoahOrchestrationRuleExecutionId,
} from "@/lib/noah/bank-onramp-tx"
import { applyWalletBalanceDelta } from "@/lib/wallet/wallet-balances-db"

export function pendingGlobalPayoutProviderTransactionId(easnerPayoutId: string): string {
  return `global_payout_pending:${easnerPayoutId}`
}

export function isNoahGlobalPayoutSellTx(tx: Record<string, unknown>): boolean {
  if (String(tx.Direction ?? "").toUpperCase() !== "OUT") return false
  if (!tx.FiatPayment || typeof tx.FiatPayment !== "object") return false
  return Boolean(String(tx.CryptoCurrency ?? "").trim())
}

/** On-chain Noah IN that may be global-payout orchestration (Turnkey → Noah), not a user deposit. */
export function isNoahGlobalPayoutOrchestrationInLegShape(tx: Record<string, unknown>): boolean {
  if (String(tx.Direction ?? "").toUpperCase() !== "IN") return false
  if (tx.FiatPayment) return false
  const net = String(tx.Network ?? "")
  if (!net || net === "OffNetwork") return false
  const crypto = String(tx.CryptoCurrency ?? "").toUpperCase()
  return crypto.includes("USDC") || crypto.includes("EURC")
}

/**
 * Noah received USDC/EURC from Turnkey before fiat payout — internal orchestration leg, not user-facing credit.
 * Mirrors bank-on-ramp orchestration Out (Solana) which we suppress on the other side of the flow.
 */
export function isNoahGlobalPayoutOrchestrationInLeg(tx: Record<string, unknown>): boolean {
  return isNoahGlobalPayoutOrchestrationInLegShape(tx)
}

/**
 * Pending Noah IN webhooks often omit Orchestration; ID is the rule execution id.
 */
export function pickNoahGlobalPayoutOrchestrationRuleExecutionId(
  tx: Record<string, unknown>,
): string | null {
  return (
    pickNoahOrchestrationRuleExecutionId(tx) ??
    (isNoahGlobalPayoutOrchestrationInLegShape(tx) && tx.ID != null && String(tx.ID).trim()
      ? String(tx.ID).trim()
      : null)
  )
}

export function buildNoahGlobalPayoutOrchestrationInSuppressMetadata(input: {
  priorMetadata?: Record<string, unknown> | null
  linkedOutRowId?: string | null
  easnerPayoutId?: string | null
  ruleExecutionId?: string | null
  solanaTxHash?: string | null
}): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    ...(input.priorMetadata ?? {}),
    source: "webhook_transaction",
    flow: "global_fiat_offramp",
    global_payout_orchestration_in_leg: true,
    suppress_in_feed: true,
  }
  if (input.linkedOutRowId) patch.linked_global_payout_out_row_id = input.linkedOutRowId
  if (input.easnerPayoutId) patch.easner_payout_id = input.easnerPayoutId
  if (input.ruleExecutionId) patch.noah_rule_execution_id = input.ruleExecutionId
  if (input.solanaTxHash) patch.noah_on_chain_tx_hash = input.solanaTxHash
  return patch
}

export function pickNoahWebhookTxHash(tx: Record<string, unknown>): string | null {
  const h = tx.TxHash ?? tx.TransactionHash ?? tx.txHash ?? tx.Hash ?? tx.PublicID
  return h != null && String(h).trim() ? String(h).trim() : null
}

function applyLedgerScope<T extends { eq: (col: string, val: string) => T; is: (col: string, val: null) => T }>(
  query: T,
  scope: { userId: string; businessId: string | null },
): T {
  if (scope.businessId) return query.eq("business_id", scope.businessId)
  return query.eq("user_id", scope.userId).is("business_id", null)
}

export type ResolvedGlobalPayoutOutRow = {
  id: string
  metadata: Record<string, unknown>
  easnerPayoutId: string
}

/**
 * Resolve the user-facing global payout OUT row for a Noah orchestration IN webhook.
 * Pending IN events often lack ExternalID/Orchestration; match Turnkey settlement hash instead.
 */
export async function resolveGlobalPayoutOutRowForOrchestrationIn(
  admin: SupabaseClient,
  input: {
    externalId: string | null
    solanaTxHash: string | null
    ruleExecutionId: string | null
    userId: string
    businessId: string | null
  },
): Promise<ResolvedGlobalPayoutOutRow | null> {
  const scope = { userId: input.userId, businessId: input.businessId }

  if (input.externalId) {
    const pending = await findPendingGlobalPayoutByExternalId(admin, input.externalId)
    if (pending) {
      return {
        id: pending.id,
        metadata: pending.metadata,
        easnerPayoutId: input.externalId,
      }
    }
  }

  const solanaTxHash = String(input.solanaTxHash || "").trim()
  if (solanaTxHash) {
    let tkQ = admin
      .from("transactions")
      .select("metadata")
      .eq("provider", "turnkey")
      .eq("tx_hash", solanaTxHash)
    tkQ = applyLedgerScope(tkQ, scope)
    const { data: tkRow } = await tkQ.maybeSingle()
    const tkMeta = (tkRow?.metadata || {}) as Record<string, unknown>
    if (tkMeta.global_payout_settlement_leg === true) {
      const easnerPayoutId = String(tkMeta.easner_payout_id || "").trim()
      if (easnerPayoutId) {
        const pending = await findPendingGlobalPayoutByExternalId(admin, easnerPayoutId)
        if (pending) {
          return { id: pending.id, metadata: pending.metadata, easnerPayoutId }
        }
      }
    }

    let outByHashQ = admin
      .from("transactions")
      .select("id, metadata")
      .eq("provider", "noah")
      .eq("direction", "out")
      .filter("metadata->>turnkey_tx_hash", "eq", solanaTxHash)
    outByHashQ = applyLedgerScope(outByHashQ, scope)
    const { data: outByHash } = await outByHashQ.maybeSingle()
    if (outByHash?.id) {
      const meta = (outByHash.metadata || {}) as Record<string, unknown>
      const easnerPayoutId = String(meta.easner_payout_id || "").trim()
      if (easnerPayoutId && meta.payout_type === "global_fiat") {
        return { id: String(outByHash.id), metadata: meta, easnerPayoutId }
      }
    }
  }

  const ruleExecutionId = String(input.ruleExecutionId || "").trim()
  if (ruleExecutionId) {
    let outByRuleQ = admin
      .from("transactions")
      .select("id, metadata")
      .eq("provider", "noah")
      .eq("direction", "out")
      .filter("metadata->>noah_rule_execution_id", "eq", ruleExecutionId)
    outByRuleQ = applyLedgerScope(outByRuleQ, scope)
    const { data: outByRule } = await outByRuleQ.maybeSingle()
    if (outByRule?.id) {
      const meta = (outByRule.metadata || {}) as Record<string, unknown>
      const easnerPayoutId = String(meta.easner_payout_id || "").trim()
      if (easnerPayoutId && meta.payout_type === "global_fiat") {
        return { id: String(outByRule.id), metadata: meta, easnerPayoutId }
      }
    }
  }

  return null
}

/** Hide an internal Noah orchestration IN row created before linkage (pending webhook race). */
export async function suppressNoahGlobalPayoutOrchestrationInLedgerRow(
  admin: SupabaseClient,
  input: {
    noahTransactionId: string
    userId: string
    businessId: string | null
    linkedOutRowId?: string
    easnerPayoutId?: string
    ruleExecutionId?: string | null
    solanaTxHash?: string | null
  },
): Promise<void> {
  const noahTransactionId = String(input.noahTransactionId || "").trim()
  if (!noahTransactionId) return

  let q = admin
    .from("transactions")
    .select("id, metadata")
    .eq("provider", "noah")
    .eq("provider_transaction_id", noahTransactionId)
  q = applyLedgerScope(q, { userId: input.userId, businessId: input.businessId })
  const { data: row } = await q.maybeSingle()
  if (!row?.id) return

  const prior = (row.metadata || {}) as Record<string, unknown>
  const patch = buildNoahGlobalPayoutOrchestrationInSuppressMetadata({
    priorMetadata: prior,
    linkedOutRowId: input.linkedOutRowId,
    easnerPayoutId: input.easnerPayoutId,
    ruleExecutionId: input.ruleExecutionId,
    solanaTxHash: input.solanaTxHash,
  })

  await admin
    .from("transactions")
    .update({ metadata: patch, updated_at: new Date().toISOString() })
    .eq("id", row.id)
}

/** Resolve Turnkey global-payout settlement signatures for Noah IN rows (list feed safety net). */
export async function collectGlobalPayoutSettlementTxHashesForScope(
  admin: SupabaseClient,
  txHashes: string[],
  scope: { userId: string; businessId: string | null },
): Promise<Set<string>> {
  const unique = [...new Set(txHashes.map((h) => String(h || "").trim()).filter(Boolean))]
  if (unique.length === 0) return new Set()

  const matched = new Set<string>()
  for (const hash of unique) {
    let q = admin
      .from("transactions")
      .select("metadata")
      .eq("provider", "turnkey")
      .eq("direction", "out")
      .eq("tx_hash", hash)
    q = applyLedgerScope(q, scope)
    const { data } = await q.maybeSingle()
    const meta = (data?.metadata || {}) as Record<string, unknown>
    if (meta.global_payout_settlement_leg === true) {
      matched.add(hash)
      continue
    }

    let noahQ = admin
      .from("transactions")
      .select("metadata")
      .eq("provider", "noah")
      .eq("direction", "out")
      .or(`tx_hash.eq.${hash},metadata->>turnkey_tx_hash.eq.${hash},metadata->>noah_on_chain_tx_hash.eq.${hash}`)
    noahQ = applyLedgerScope(noahQ, scope)
    const { data: noahRow } = await noahQ.maybeSingle()
    const noahMeta = (noahRow?.metadata || {}) as Record<string, unknown>
    if (easnerPayoutIdFromGlobalPayoutNoahMeta(noahMeta)) matched.add(hash)
  }
  return matched
}

export type NoahGlobalPayoutPayOutEnrichment = {
  beneficiaryName: string | null
  bankName: string | null
  accountNumber: string | null
  bankCode: string | null
  countryCode: string | null
  receiveAmount: number
  receiveCurrency: string
  fxRate: string | null
}

/** Beneficiary / bank fields from Noah OffNetwork OUT webhook (user-facing payout row). */
export function extractNoahGlobalPayoutPayOutEnrichment(
  tx: Record<string, unknown>,
): NoahGlobalPayoutPayOutEnrichment | null {
  if (!isNoahGlobalPayoutSellTx(tx)) return null
  const fp = tx.FiatPayment as Record<string, unknown> | undefined
  const fpm = tx.FiatPaymentMethod as Record<string, unknown> | undefined
  const issuer = fpm?.IssuerDetails as Record<string, unknown> | undefined
  const display = fpm?.DisplayDetails as Record<string, unknown> | undefined
  const holder = fpm?.AccountHolderDetails as Record<string, unknown> | undefined
  const receiveAmount = Math.abs(parseFloat(String(fp?.Amount ?? "0")) || 0)
  const receiveCurrency = String(fp?.FiatCurrency ?? "USD").toUpperCase()
  return {
    beneficiaryName: formatNoahAccountHolderName(holder),
    bankName:
      issuer?.Name != null && String(issuer.Name).trim() ? String(issuer.Name).trim() : null,
    accountNumber:
      display?.AccountNumber != null && String(display.AccountNumber).trim()
        ? String(display.AccountNumber).trim()
        : null,
    bankCode:
      display?.BankCode != null && String(display.BankCode).trim()
        ? String(display.BankCode).trim()
        : null,
    countryCode:
      fpm?.Country != null && String(fpm.Country).trim() ? String(fpm.Country).trim() : null,
    receiveAmount,
    receiveCurrency,
    fxRate: fp?.Rate != null && String(fp.Rate).trim() ? String(fp.Rate).trim() : null,
  }
}

export function buildNoahGlobalPayoutPayOutMetadata(
  tx: Record<string, unknown>,
  enrichment: NoahGlobalPayoutPayOutEnrichment,
): Record<string, unknown> {
  return {
    flow: "global_fiat_offramp",
    ...(enrichment.beneficiaryName
      ? {
          beneficiary_name: enrichment.beneficiaryName,
          recipient_name: enrichment.beneficiaryName,
          counterparty_name: enrichment.beneficiaryName,
        }
      : {}),
    ...(enrichment.bankName ? { bank_name: enrichment.bankName } : {}),
    ...(enrichment.accountNumber ? { account_number: enrichment.accountNumber } : {}),
    ...(enrichment.bankCode ? { bank_code: enrichment.bankCode } : {}),
    ...(enrichment.countryCode ? { country_code: enrichment.countryCode } : {}),
    ...(enrichment.fxRate ? { fx_rate: enrichment.fxRate } : {}),
    payment_rail: "bank",
    destination_payment_rail: "bank",
  }
}

export function settlementWalletCurrencyForNoahCrypto(crypto: string): string {
  const c = crypto.trim().toUpperCase()
  if (c.includes("USDC") || c === "USD") return "USD"
  if (c.includes("EURC") || c === "EUR") return "EUR"
  return c
}

function pickPositiveAmount(raw: unknown): number | null {
  const n = Math.abs(parseFloat(String(raw ?? "")))
  return Number.isFinite(n) && n > 0 ? n : null
}

export function pickNoahCryptoDebitAmount(tx: Record<string, unknown>): number | null {
  for (const key of ["CryptoAmount", "Amount", "CryptoAuthorizedAmount", "TotalAmount"]) {
    const n = pickPositiveAmount(tx[key])
    if (n != null) return n
  }
  const cp = tx.CryptoPayment as Record<string, unknown> | undefined
  if (cp) {
    const n = pickPositiveAmount(cp.Amount ?? cp.amount)
    if (n != null) return n
  }
  return null
}

export type NoahGlobalPayoutLedgerFields = {
  amount: number
  currency: string
  baseCurrency: string
  asset: string | null
  receiveAmount: number
  receiveCurrency: string
}

/**
 * Ledger columns for global fiat payouts:
 * - amount/currency/base_* = wallet debit (USD balance / USDC settlement)
 * - receiveAmount/receiveCurrency = beneficiary fiat (NGN, etc.)
 */
export function pickNoahGlobalPayoutLedgerFields(
  tx: Record<string, unknown>,
  hints?: { cryptoAuthorizedAmount?: string; sourceBalanceCurrency?: string },
): NoahGlobalPayoutLedgerFields {
  const fp = tx.FiatPayment as Record<string, unknown> | undefined
  const receiveAmount = Math.abs(parseFloat(String(fp?.Amount ?? "0")) || 0)
  const receiveCurrency = String(fp?.FiatCurrency ?? "USD").toUpperCase()
  const asset = String(tx.CryptoCurrency ?? "").trim() || null

  let cryptoAmount = pickNoahCryptoDebitAmount(tx)
  if (cryptoAmount == null && hints?.cryptoAuthorizedAmount) {
    cryptoAmount = pickPositiveAmount(hints.cryptoAuthorizedAmount)
  }

  const baseCurrency =
    String(hints?.sourceBalanceCurrency ?? "").trim().toUpperCase() ||
    (asset ? settlementWalletCurrencyForNoahCrypto(asset) : "USD")

  return {
    amount: cryptoAmount ?? 0,
    currency: baseCurrency,
    baseCurrency,
    asset,
    receiveAmount,
    receiveCurrency,
  }
}

export async function findPendingGlobalPayoutByExternalId(
  admin: SupabaseClient,
  externalId: string,
): Promise<{ id: string; metadata: Record<string, unknown> } | null> {
  const key = String(externalId || "").trim()
  if (!key) return null

  const pendingPtid = pendingGlobalPayoutProviderTransactionId(key)
  const { data: byPtid } = await admin
    .from("transactions")
    .select("id, metadata")
    .eq("provider", "noah")
    .eq("provider_transaction_id", pendingPtid)
    .maybeSingle()
  if (byPtid?.id) {
    return { id: String(byPtid.id), metadata: (byPtid.metadata || {}) as Record<string, unknown> }
  }

  const { data: byMeta } = await admin
    .from("transactions")
    .select("id, metadata")
    .eq("provider", "noah")
    .contains("metadata", { easner_payout_id: key })
    .maybeSingle()
  if (byMeta?.id) {
    return { id: String(byMeta.id), metadata: (byMeta.metadata || {}) as Record<string, unknown> }
  }

  return null
}

function readEasnerPayoutIdFromNoahMeta(meta: Record<string, unknown>): string | null {
  const id = String(meta.easner_payout_id ?? "").trim()
  return id || null
}

function isGlobalPayoutNoahOutRow(meta: Record<string, unknown>): boolean {
  return meta.payout_type === "global_fiat" || meta.flow === "global_fiat_offramp"
}

/** User-facing global payout Noah OUT row (pending or settled). */
export async function findGlobalPayoutNoahRowByEasnerPayoutId(
  admin: SupabaseClient,
  easnerPayoutId: string,
): Promise<{
  id: string
  user_id: string
  business_id: string | null
  amount: number
  currency: string
  metadata: Record<string, unknown>
} | null> {
  const pending = await findPendingGlobalPayoutByExternalId(admin, easnerPayoutId)
  if (!pending?.id) return null
  const { data } = await admin
    .from("transactions")
    .select("id, user_id, business_id, amount, currency, metadata")
    .eq("id", pending.id)
    .maybeSingle()
  if (!data?.id) return null
  return {
    id: String(data.id),
    user_id: String(data.user_id),
    business_id: data.business_id != null ? String(data.business_id) : null,
    amount: Number(data.amount ?? 0),
    currency: String(data.currency ?? "USD"),
    metadata: (data.metadata || {}) as Record<string, unknown>,
  }
}

export async function findGlobalPayoutNoahRowByTurnkeySendId(
  admin: SupabaseClient,
  turnkeySendId: string,
): Promise<{
  id: string
  user_id: string
  business_id: string | null
  amount: number
  currency: string
  metadata: Record<string, unknown>
  easnerPayoutId: string | null
} | null> {
  const tid = String(turnkeySendId || "").trim()
  if (!tid) return null

  const select = "id, user_id, business_id, amount, currency, metadata"

  const { data: byMain } = await admin
    .from("transactions")
    .select(select)
    .eq("provider", "noah")
    .eq("direction", "out")
    .filter("metadata->>turnkey_send_id", "eq", tid)
    .maybeSingle()
  if (byMain?.id) {
    const meta = (byMain.metadata || {}) as Record<string, unknown>
    return {
      id: String(byMain.id),
      user_id: String(byMain.user_id),
      business_id: byMain.business_id != null ? String(byMain.business_id) : null,
      amount: Number(byMain.amount ?? 0),
      currency: String(byMain.currency ?? "USD"),
      metadata: meta,
      easnerPayoutId: readEasnerPayoutIdFromNoahMeta(meta),
    }
  }

  const { data: byMargin } = await admin
    .from("transactions")
    .select(select)
    .eq("provider", "noah")
    .eq("direction", "out")
    .filter("metadata->>margin_turnkey_send_id", "eq", tid)
    .maybeSingle()
  if (byMargin?.id) {
    const meta = (byMargin.metadata || {}) as Record<string, unknown>
    return {
      id: String(byMargin.id),
      user_id: String(byMargin.user_id),
      business_id: byMargin.business_id != null ? String(byMargin.business_id) : null,
      amount: Number(byMargin.amount ?? 0),
      currency: String(byMargin.currency ?? "USD"),
      metadata: meta,
      easnerPayoutId: readEasnerPayoutIdFromNoahMeta(meta),
    }
  }

  return null
}

export async function patchGlobalPayoutNoahTurnkeySettlement(
  admin: SupabaseClient,
  input: {
    easnerPayoutId: string
    turnkeySendId: string
    txHash?: string | null
    turnkeySendStatus?: string | null
    marginLeg?: boolean
  },
): Promise<void> {
  const row = await findGlobalPayoutNoahRowByEasnerPayoutId(admin, input.easnerPayoutId)
  if (!row?.id) return

  const meta = { ...row.metadata }
  if (input.marginLeg) {
    meta.margin_turnkey_send_id = input.turnkeySendId
  } else {
    meta.turnkey_send_id = input.turnkeySendId
    if (input.txHash) meta.turnkey_tx_hash = input.txHash
    if (input.turnkeySendStatus) meta.turnkey_send_status = input.turnkeySendStatus
  }

  await admin
    .from("transactions")
    .update({
      metadata: meta,
      ...(input.txHash && !input.marginLeg ? { tx_hash: input.txHash } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
}

/**
 * Debit wallet for a global fiat payout once Turnkey chain send settles.
 * Noah payout row is the sole ledger record — no Turnkey OUT row required.
 */
export async function applyGlobalPayoutWalletDebitForEasnerPayoutId(
  admin: SupabaseClient,
  input: { easnerPayoutId: string; marginLeg?: boolean },
): Promise<void> {
  if (input.marginLeg) return

  const row = await findGlobalPayoutNoahRowByEasnerPayoutId(admin, input.easnerPayoutId)
  if (!row?.id) return

  const meta = row.metadata
  if (meta.balance_delta_applied === true) return

  let debitAmt = Number(meta.total_debited ?? row.amount ?? 0)
  if (!Number.isFinite(debitAmt) || debitAmt <= 0) return

  const currency = String(row.currency || "USD").toUpperCase() as "USD" | "EUR"
  await applyWalletBalanceDelta(admin, {
    businessId: row.business_id,
    userId: row.business_id ? null : row.user_id,
    currency,
    delta: -debitAmt,
  })

  await admin
    .from("transactions")
    .update({
      metadata: {
        ...meta,
        turnkey_settled: true,
        balance_delta_applied: true,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
}

function easnerPayoutIdFromGlobalPayoutNoahMeta(meta: Record<string, unknown>): string | null {
  if (!isGlobalPayoutNoahOutRow(meta)) return null
  return readEasnerPayoutIdFromNoahMeta(meta)
}

/** Skip duplicate chain-ingest debit when Turnkey global payout settlement already handled balance. */
export async function findGlobalPayoutSettlementForChainSuppression(
  admin: SupabaseClient,
  input: { turnkeySendStatusId?: string | null; txHash?: string | null },
): Promise<{ easnerPayoutId: string } | null> {
  const tid = String(input.turnkeySendStatusId || "").trim()
  if (tid) {
    const { data } = await admin
      .from("transactions")
      .select("metadata")
      .eq("provider", "turnkey")
      .eq("provider_transaction_id", tid)
      .maybeSingle()
    const meta = (data?.metadata || {}) as Record<string, unknown>
    if (meta.global_payout_settlement_leg === true) {
      const easnerPayoutId = String(meta.easner_payout_id || "").trim()
      if (easnerPayoutId) return { easnerPayoutId }
    }

    const noahRow = await findGlobalPayoutNoahRowByTurnkeySendId(admin, tid)
    if (noahRow?.easnerPayoutId) return { easnerPayoutId: noahRow.easnerPayoutId }
  }

  const hx = String(input.txHash || "").trim()
  if (hx) {
    const { data } = await admin
      .from("transactions")
      .select("metadata")
      .eq("provider", "turnkey")
      .eq("tx_hash", hx)
      .maybeSingle()
    const meta = (data?.metadata || {}) as Record<string, unknown>
    if (meta.global_payout_settlement_leg === true) {
      const easnerPayoutId = String(meta.easner_payout_id || "").trim()
      if (easnerPayoutId) return { easnerPayoutId }
    }

    let noahQ = admin
      .from("transactions")
      .select("metadata")
      .eq("provider", "noah")
      .eq("direction", "out")
      .or(`tx_hash.eq.${hx},metadata->>turnkey_tx_hash.eq.${hx},metadata->>noah_on_chain_tx_hash.eq.${hx}`)
    const { data: noahByHash } = await noahQ.maybeSingle()
    const noahMeta = (noahByHash?.metadata || {}) as Record<string, unknown>
    const easnerPayoutId = easnerPayoutIdFromGlobalPayoutNoahMeta(noahMeta)
    if (easnerPayoutId) return { easnerPayoutId }
  }

  return null
}

export async function linkPendingGlobalPayoutToNoahTransactionId(
  admin: SupabaseClient,
  input: { pendingRowId: string; noahTransactionId: string },
): Promise<void> {
  await admin
    .from("transactions")
    .update({
      provider_transaction_id: input.noahTransactionId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.pendingRowId)
}

/** Attach Solana orchestration IN leg to the user-facing global payout OUT row; do not create a separate IN ledger row. */
export async function linkGlobalPayoutOutRowFromOrchestrationIn(
  admin: SupabaseClient,
  input: {
    outRowId: string
    priorMetadata: Record<string, unknown>
    ruleExecutionId: string | null
    solanaTxHash: string | null
    noahOrchestrationInTransactionId?: string | null
    orchestrationInStatus?: string | null
  },
): Promise<void> {
  const patch: Record<string, unknown> = {
    ...input.priorMetadata,
    flow: "global_fiat_offramp",
    global_payout_orchestration_in_leg_linked: true,
  }
  if (input.ruleExecutionId) {
    patch.noah_rule_execution_id = input.ruleExecutionId
  }
  if (input.solanaTxHash) {
    patch.noah_on_chain_tx_hash = input.solanaTxHash
    if (!patch.turnkey_tx_hash) {
      patch.turnkey_tx_hash = input.solanaTxHash
    }
  }
  if (input.noahOrchestrationInTransactionId) {
    patch.noah_orchestration_in_transaction_id = input.noahOrchestrationInTransactionId
  }
  if (input.orchestrationInStatus) {
    patch.noah_orchestration_in_status = input.orchestrationInStatus
  }
  await admin
    .from("transactions")
    .update({
      metadata: patch,
      ...(input.solanaTxHash ? { tx_hash: input.solanaTxHash } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.outRowId)
}

/**
 * Remove a mistaken Noah orchestration IN ledger row (legacy ingest). Raw webhook stays in event_inbox.
 */
export async function deleteNoahGlobalPayoutOrchestrationInLedgerRowIfPresent(
  admin: SupabaseClient,
  input: {
    noahTransactionId: string
    userId: string
    businessId: string | null
  },
): Promise<boolean> {
  const noahTransactionId = String(input.noahTransactionId || "").trim()
  if (!noahTransactionId) return false

  let q = admin
    .from("transactions")
    .select("id, metadata, payload")
    .eq("provider", "noah")
    .eq("provider_transaction_id", noahTransactionId)
    .eq("direction", "in")
  q = applyLedgerScope(q, { userId: input.userId, businessId: input.businessId })
  const { data: row } = await q.maybeSingle()
  if (!row?.id) return false

  const meta = (row.metadata || {}) as Record<string, unknown>
  const payload = (row.payload || {}) as Record<string, unknown>
  const isOrchestrationIn =
    meta.global_payout_orchestration_in_leg === true ||
    isNoahGlobalPayoutOrchestrationInLegShape(payload)
  if (!isOrchestrationIn) return false

  const { error } = await admin.from("transactions").delete().eq("id", row.id)
  if (error) throw error
  return true
}

/**
 * Global payout orchestration IN: patch OUT only, delete any legacy IN row — no new IN ledger insert.
 */
export async function handleNoahGlobalPayoutOrchestrationInWebhook(
  admin: SupabaseClient,
  input: {
    noahTransactionId: string
    txData: Record<string, unknown>
    status: string
    userId: string
    businessId: string | null
    externalId: string | null
    ruleExecutionId: string | null
    solanaTxHash: string | null
  },
): Promise<{ linkedOutRowId: string | null; deletedInRow: boolean }> {
  const globalPayoutOutRow = await resolveGlobalPayoutOutRowForOrchestrationIn(admin, {
    externalId: input.externalId,
    solanaTxHash: input.solanaTxHash,
    ruleExecutionId: input.ruleExecutionId,
    userId: input.userId,
    businessId: input.businessId,
  })

  if (globalPayoutOutRow) {
    await linkGlobalPayoutOutRowFromOrchestrationIn(admin, {
      outRowId: globalPayoutOutRow.id,
      priorMetadata: globalPayoutOutRow.metadata,
      ruleExecutionId: input.ruleExecutionId,
      solanaTxHash: input.solanaTxHash,
      noahOrchestrationInTransactionId: input.noahTransactionId,
      orchestrationInStatus: input.status,
    })
  }

  const deletedInRow = await deleteNoahGlobalPayoutOrchestrationInLedgerRowIfPresent(admin, {
    noahTransactionId: input.noahTransactionId,
    userId: input.userId,
    businessId: input.businessId,
  })

  return { linkedOutRowId: globalPayoutOutRow?.id ?? null, deletedInRow }
}
