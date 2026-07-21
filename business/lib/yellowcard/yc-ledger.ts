/**
 * Yellowcard ledger helpers — Noah-parity metadata, lookups, and refund flags.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import type { YcFundBalanceDepositReviewSnapshot } from "@easner/shared"
import { mergeBankDepositLifecycleMetadata, mergeGlobalPayoutLifecycleMetadata } from "@/lib/noah/bank-onramp-tx"
import { pendingGlobalPayoutProviderTransactionId } from "@/lib/noah/global-payout-ledger"

export type YcMode = "fund_balance" | "balance_payout" | "cross_border_send"

export type YcTransferRow = {
  id: string
  transaction_id: string | null
  user_id: string
  business_id: string | null
  mode: string
  status: string
  pay_in_currency: string | null
  receive_currency: string | null
  quoted_pay_in: number | null
  quoted_receive: number | null
  customer_rate: number | null
  leg1_sequence_id: string | null
  leg2_sequence_id: string | null
  leg1_yc_id: string | null
  leg2_yc_id: string | null
  omnibus_in_actual: number | null
  fee_wallet_sweep: number | null
  bank_info: Record<string, unknown> | null
  settlement_info: Record<string, unknown> | null
  metadata: Record<string, unknown>
}

export type YcLedgerContext = {
  transfer: YcTransferRow | null
  transaction: {
    id: string
    user_id: string
    business_id: string | null
    status: string
    amount: number
    currency: string
    direction: string | null
    metadata: Record<string, unknown>
    provider: string
  } | null
  sequenceId: string
  matchedLeg: "leg1" | "leg2" | "tx" | null
}

function asMeta(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
}

function mapTransfer(row: Record<string, unknown>): YcTransferRow {
  return {
    id: String(row.id),
    transaction_id: row.transaction_id != null ? String(row.transaction_id) : null,
    user_id: String(row.user_id),
    business_id: row.business_id != null ? String(row.business_id) : null,
    mode: String(row.mode ?? ""),
    status: String(row.status ?? ""),
    pay_in_currency: row.pay_in_currency != null ? String(row.pay_in_currency) : null,
    receive_currency: row.receive_currency != null ? String(row.receive_currency) : null,
    quoted_pay_in: row.quoted_pay_in != null ? Number(row.quoted_pay_in) : null,
    quoted_receive: row.quoted_receive != null ? Number(row.quoted_receive) : null,
    customer_rate: row.customer_rate != null ? Number(row.customer_rate) : null,
    leg1_sequence_id: row.leg1_sequence_id != null ? String(row.leg1_sequence_id) : null,
    leg2_sequence_id: row.leg2_sequence_id != null ? String(row.leg2_sequence_id) : null,
    leg1_yc_id: row.leg1_yc_id != null ? String(row.leg1_yc_id) : null,
    leg2_yc_id: row.leg2_yc_id != null ? String(row.leg2_yc_id) : null,
    omnibus_in_actual: row.omnibus_in_actual != null ? Number(row.omnibus_in_actual) : null,
    fee_wallet_sweep: row.fee_wallet_sweep != null ? Number(row.fee_wallet_sweep) : null,
    bank_info: (row.bank_info as Record<string, unknown> | null) ?? null,
    settlement_info: (row.settlement_info as Record<string, unknown> | null) ?? null,
    metadata: asMeta(row.metadata),
  }
}

/** Unified lookup by YC sequence id across yc_transfers + transactions. */
export async function findYcContextBySequenceId(
  admin: SupabaseClient,
  sequenceId: string,
): Promise<YcLedgerContext> {
  const seq = String(sequenceId || "").trim()
  if (!seq) {
    return { transfer: null, transaction: null, sequenceId: seq, matchedLeg: null }
  }

  const { data: transferRaw } = await admin
    .from("yc_transfers")
    .select("*")
    .or(`leg1_sequence_id.eq.${seq},leg2_sequence_id.eq.${seq}`)
    .maybeSingle()

  const transfer = transferRaw ? mapTransfer(transferRaw as Record<string, unknown>) : null
  let matchedLeg: YcLedgerContext["matchedLeg"] = null
  if (transfer) {
    if (transfer.leg2_sequence_id === seq) matchedLeg = "leg2"
    else if (transfer.leg1_sequence_id === seq) matchedLeg = "leg1"
  }

  let transaction: YcLedgerContext["transaction"] = null
  if (transfer?.transaction_id) {
    const { data: tx } = await admin
      .from("transactions")
      .select("id,user_id,business_id,status,amount,currency,direction,metadata,provider")
      .eq("id", transfer.transaction_id)
      .maybeSingle()
    if (tx?.id) {
      transaction = {
        id: String(tx.id),
        user_id: String(tx.user_id),
        business_id: tx.business_id != null ? String(tx.business_id) : null,
        status: String(tx.status ?? ""),
        amount: Number(tx.amount ?? 0),
        currency: String(tx.currency ?? "USD"),
        direction: tx.direction != null ? String(tx.direction) : null,
        metadata: asMeta(tx.metadata),
        provider: String(tx.provider ?? ""),
      }
    }
  }

  if (!transaction) {
    const { data: txByMeta } = await admin
      .from("transactions")
      .select("id,user_id,business_id,status,amount,currency,direction,metadata,provider")
      .contains("metadata", { yc_sequence_id: seq })
      .maybeSingle()
    if (txByMeta?.id) {
      transaction = {
        id: String(txByMeta.id),
        user_id: String(txByMeta.user_id),
        business_id: txByMeta.business_id != null ? String(txByMeta.business_id) : null,
        status: String(txByMeta.status ?? ""),
        amount: Number(txByMeta.amount ?? 0),
        currency: String(txByMeta.currency ?? "USD"),
        direction: txByMeta.direction != null ? String(txByMeta.direction) : null,
        metadata: asMeta(txByMeta.metadata),
        provider: String(txByMeta.provider ?? ""),
      }
      if (!matchedLeg) matchedLeg = "tx"
    }
  }

  return { transfer, transaction, sequenceId: seq, matchedLeg }
}

/** Merge YC receive webhook fields onto fund_balance metadata (Noah FiatDeposit parity). */
export function enrichYcFundBalanceReceiveFromPayload(
  prior: Record<string, unknown>,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const bankInfo = (payload.bankInfo ?? payload.bank_info) as Record<string, unknown> | null | undefined
  const settlementInfo = (payload.settlementInfo ?? payload.settlement_info) as
    | Record<string, unknown>
    | null
    | undefined
  const ycId = String(payload.id ?? payload.receiveId ?? payload.collectionId ?? "").trim()
  const channelId = String(payload.channelId ?? payload.channel_id ?? "").trim()
  const status = String(payload.status ?? "").trim()

  return {
    ...prior,
    ...(ycId ? { yc_receive_id: ycId, leg1_yc_id: ycId } : {}),
    ...(channelId ? { channel_id: channelId } : {}),
    ...(status ? { yc_receive_status: status } : {}),
    ...(bankInfo && typeof bankInfo === "object" ? { yc_bank_info: bankInfo } : {}),
    ...(settlementInfo && typeof settlementInfo === "object"
      ? { yc_settlement_info: settlementInfo }
      : {}),
  }
}

export function buildYcFundBalanceReceiveMetadata(input: {
  prior?: Record<string, unknown> | null
  sequenceId: string
  transferId?: string | null
  payload?: Record<string, unknown>
  localPayIn?: number | null
  localCurrency?: string | null
  usdCredit?: number | null
  processingFee?: number | null
  residenceCountry?: string | null
  payInRail?: "bank_transfer" | "mobile_money" | null
  customerRate?: number | null
  depositReview?: YcFundBalanceDepositReviewSnapshot | null
  depositDisplayTitle?: string | null
  displayHeroTitle?: string | null
}): Record<string, unknown> {
  const base = {
    ...(input.prior ?? {}),
    source: "api_yellowcard_fund_balance",
    flow: "bank_onramp",
    yc_mode: "fund_balance" satisfies YcMode,
    yc_sequence_id: input.sequenceId,
    ...(input.transferId ? { yc_transfer_id: input.transferId } : {}),
    ...(input.localPayIn != null ? { local_pay_in: input.localPayIn } : {}),
    ...(input.localCurrency ? { local_currency: input.localCurrency } : {}),
    ...(input.usdCredit != null ? { usd_credit: input.usdCredit } : {}),
    ...(input.processingFee != null ? { processing_fee: input.processingFee } : {}),
    ...(input.residenceCountry ? { residence_country: String(input.residenceCountry).trim().toUpperCase() } : {}),
    ...(input.payInRail ? { pay_in_rail: input.payInRail } : {}),
    ...(input.customerRate != null && Number.isFinite(input.customerRate)
      ? { customer_rate: input.customerRate }
      : {}),
    ...(input.depositReview ? { deposit_review: input.depositReview } : {}),
    ...(input.depositDisplayTitle ? { deposit_display_title: input.depositDisplayTitle } : {}),
    ...(input.displayHeroTitle ? { display_hero_title: input.displayHeroTitle } : {}),
    ...(input.payload ? { yc_webhook_payload_keys: Object.keys(input.payload).slice(0, 40) } : {}),
  }
  return input.payload ? enrichYcFundBalanceReceiveFromPayload(base, input.payload) : base
}

const YC_CROSS_BORDER_ALLOWED: Record<string, readonly string[]> = {
  awaiting_pay_in: ["processing", "failed"],
  processing: ["leg1_settled", "failed"],
  leg1_settled: ["leg2_in_progress", "failed"],
  leg2_in_progress: ["completed", "failed"],
  pending: ["processing", "leg1_settled", "leg2_in_progress", "completed", "failed"],
}

/** Guard cross-border yc_transfers.status transitions (no-op downgrade allowed). */
export function canTransitionYcCrossBorderStatus(current: string, next: string): boolean {
  const cur = String(current || "").trim()
  const nxt = String(next || "").trim()
  if (!cur || !nxt || cur === nxt) return true
  if (cur === "completed" || cur === "failed") return false
  const allowed = YC_CROSS_BORDER_ALLOWED[cur]
  if (!allowed) return true
  return allowed.includes(nxt)
}

export function buildYcBalancePayoutOutMetadata(input: {
  prior?: Record<string, unknown> | null
  easnerPayoutId: string
  easnerTransactionId: string
  sequenceId: string
  ycSendId?: string | null
  channelId?: string | null
  totalDebited: number
  cryptoAuthorizedAmount: number
  marginAmount?: number
  processingFee?: number
  receiveAmount?: number
  receiveCurrency?: string
  customerRate?: number
  recipientId?: string | null
  recipientSnapshot?: Record<string, unknown> | null
  walletAddress?: string | null
  transactionStartedAt?: string
  ycLockedLocalAmount?: number | null
}): Record<string, unknown> {
  const processingFee = Number(input.processingFee ?? 0)
  return {
    ...(input.prior ?? {}),
    source: "api_yellowcard_balance_payout",
    payout_type: "global_fiat",
    flow: "global_fiat_offramp",
    execution_model: "turnkey_workflow",
    payout_provider: "yellowcard",
    yc_mode: "balance_payout" satisfies YcMode,
    yc_sequence_id: input.sequenceId,
    easner_payout_id: input.easnerPayoutId,
    easner_transaction_id: input.easnerTransactionId,
    form_session_id: input.ycSendId ?? input.sequenceId,
    crypto_authorized_amount: String(input.cryptoAuthorizedAmount),
    noah_floor: String(input.cryptoAuthorizedAmount),
    noah_send_amount: String(input.cryptoAuthorizedAmount),
    total_debited: input.totalDebited,
    margin_amount: input.marginAmount ?? 0,
    processing_fee: processingFee,
    ...(processingFee > 0.000_001 ? { processing_fee_pending: true } : {}),
    margin_capture_mode: "fee_wallet_deferred",
    ...(input.channelId ? { channel_id: input.channelId } : {}),
    ...(input.receiveAmount != null ? { receive_amount: input.receiveAmount } : {}),
    ...(input.receiveCurrency ? { receive_currency: input.receiveCurrency, fiat_currency: input.receiveCurrency } : {}),
    ...(input.customerRate != null ? { customer_rate: input.customerRate } : {}),
    ...(input.recipientId ? { recipient_id: input.recipientId } : {}),
    ...(input.recipientSnapshot ? { recipient_snapshot: input.recipientSnapshot } : {}),
    ...(input.walletAddress ? { yc_wallet_address: input.walletAddress } : {}),
    ...(input.ycSendId ? { yc_send_id: input.ycSendId } : {}),
    ...(input.ycLockedLocalAmount != null && input.ycLockedLocalAmount > 0
      ? { yc_locked_local_amount: input.ycLockedLocalAmount }
      : {}),
    transaction_started_at: input.transactionStartedAt ?? new Date().toISOString(),
  }
}

export function buildYcCrossBorderOutMetadata(input: {
  prior?: Record<string, unknown> | null
  sequenceId: string
  transferId?: string | null
  localPayIn?: number | null
  receiveAmount?: number | null
  payInCurrency?: string | null
  receiveCurrency?: string | null
  customerRate?: number | null
}): Record<string, unknown> {
  return {
    ...(input.prior ?? {}),
    source: "api_yellowcard_cross_border",
    payout_type: "global_fiat",
    flow: "global_fiat_offramp",
    payout_provider: "yellowcard",
    yc_mode: "cross_border_send" satisfies YcMode,
    yc_sequence_id: input.sequenceId,
    ...(input.transferId ? { yc_transfer_id: input.transferId } : {}),
    ...(input.localPayIn != null ? { local_pay_in: input.localPayIn } : {}),
    ...(input.receiveAmount != null ? { receive_amount: input.receiveAmount } : {}),
    ...(input.payInCurrency ? { local_currency: input.payInCurrency } : {}),
    ...(input.receiveCurrency ? { receive_currency: input.receiveCurrency } : {}),
    ...(input.customerRate != null ? { customer_rate: input.customerRate } : {}),
    transaction_started_at: new Date().toISOString(),
  }
}

/** Track user Turnkey→YC crypto send on the visible payout row (no feed suppression). */
export function buildYcParentPayoutCryptoDepositTracking(input: {
  prior?: Record<string, unknown> | null
  txHash?: string | null
  providerTransactionId?: string | null
  status?: string | null
  error?: string | null
}): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(input.prior ?? {}) }
  delete next.suppress_in_feed
  delete next.yc_crypto_deposit_leg
  delete next.yc_settlement_leg
  if (input.txHash) {
    next.yc_crypto_deposit_tx_hash = input.txHash
    next.turnkey_tx_hash = input.txHash
  }
  if (input.providerTransactionId) {
    next.yc_crypto_deposit_provider_id = input.providerTransactionId
  }
  if (input.status) next.yc_crypto_deposit_status = input.status
  if (input.error) next.yc_crypto_deposit_error = input.error
  return next
}

/** Internal omnibus → YC wallet crypto deposit leg (hidden from feed). */
export function buildYcOmnibusCryptoDepositMetadata(input: {
  prior?: Record<string, unknown> | null
  easnerPayoutId?: string | null
  transferId?: string | null
  ycMode: YcMode
  txHash?: string | null
  providerTransactionId?: string | null
}): Record<string, unknown> {
  return {
    ...(input.prior ?? {}),
    suppress_in_feed: true,
    yc_crypto_deposit_leg: true,
    yc_settlement_leg: true,
    yc_mode: input.ycMode,
    ...(input.easnerPayoutId ? { easner_payout_id: input.easnerPayoutId } : {}),
    ...(input.transferId ? { yc_transfer_id: input.transferId } : {}),
    ...(input.txHash ? { yc_crypto_deposit_tx_hash: input.txHash, turnkey_tx_hash: input.txHash } : {}),
    ...(input.providerTransactionId
      ? { yc_crypto_deposit_provider_id: input.providerTransactionId }
      : {}),
  }
}

export function buildYcRefundExpectedPatch(
  prior: Record<string, unknown> | null | undefined,
  opts?: { refundAmount?: number | null; refundTxHash?: string | null },
): Record<string, unknown> {
  return {
    ...(prior ?? {}),
    yc_refund_expected: true,
    noah_refund_expected: true,
    ...(opts?.refundAmount != null && Number.isFinite(opts.refundAmount)
      ? { yc_refund_amount: opts.refundAmount, noah_refund_amount: opts.refundAmount }
      : {}),
    ...(opts?.refundTxHash
      ? { yc_refund_tx_hash: opts.refundTxHash, noah_refund_tx_hash: opts.refundTxHash }
      : {}),
  }
}

export function mergeYcFundBalanceLifecycle(
  prior: Record<string, unknown> | null | undefined,
  patch: {
    processing_at?: string | null
    completed_at?: string | null
    failed_at?: string | null
  },
): Record<string, unknown> {
  let merged = mergeBankDepositLifecycleMetadata(prior, {
    processing_at: patch.processing_at,
    completed_at: patch.completed_at,
  })
  if (patch.failed_at) {
    merged = {
      ...merged,
      failed_at: patch.failed_at,
    }
  }
  return merged
}

export function mergeYcPayoutLifecycle(
  prior: Record<string, unknown> | null | undefined,
  patch: {
    transaction_started_at?: string | null
    processing_at?: string | null
    completed_at?: string | null
    failed_at?: string | null
  },
): Record<string, unknown> {
  return mergeGlobalPayoutLifecycleMetadata(prior, patch)
}

export function ycPendingPayoutProviderTransactionId(easnerPayoutId: string): string {
  return pendingGlobalPayoutProviderTransactionId(easnerPayoutId)
}

export function isYcFundBalanceRow(meta: Record<string, unknown>): boolean {
  return meta.yc_mode === "fund_balance" || (meta.flow === "bank_onramp" && meta.payout_provider === "yellowcard")
}

export function isYcBalancePayoutRow(meta: Record<string, unknown>): boolean {
  return meta.yc_mode === "balance_payout"
}

export function isYcCrossBorderRow(meta: Record<string, unknown>): boolean {
  return meta.yc_mode === "cross_border_send"
}

export function isYcInternalCryptoLeg(meta: Record<string, unknown>): boolean {
  return (
    meta.yc_crypto_deposit_leg === true ||
    meta.yc_settlement_leg === true ||
    meta.suppress_in_feed === true
  )
}

/** Match omnibus inbound to a pending YC fund_balance / cross_border leg1 transfer. */
export async function findYcTransferForOmnibusInbound(
  admin: SupabaseClient,
  input: { txHash: string | null; amount?: number | null },
): Promise<YcTransferRow | null> {
  const txHash = String(input.txHash || "").trim()
  if (txHash) {
    const { data: byHash } = await admin
      .from("yc_transfers")
      .select("*")
      .in("mode", ["fund_balance", "cross_border_send"])
      .filter("metadata->>leg1_omnibus_tx_hash", "eq", txHash)
      .maybeSingle()
    if (byHash?.id) return mapTransfer(byHash as Record<string, unknown>)
  }

  // Amount + recent awaiting window (14d) as soft match when hash not yet linked
  const amount = input.amount
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return null
  const sinceIso = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const { data: rows } = await admin
    .from("yc_transfers")
    .select("*")
    .in("mode", ["fund_balance", "cross_border_send"])
    .in("status", ["awaiting_pay_in", "pending", "processing", "leg1_settled", "leg2_in_progress"])
    .gte("created_at", sinceIso)
    .limit(30)

  const candidates: YcTransferRow[] = []
  for (const row of rows ?? []) {
    const t = mapTransfer(row as Record<string, unknown>)
    const expected =
      Number(t.metadata?.omnibus_in_expected ?? 0) ||
      Number(t.omnibus_in_actual ?? 0) ||
      Number((t.settlement_info as Record<string, unknown> | null)?.cryptoAmount ?? 0) ||
      Number(t.metadata?.usd_credit ?? 0) + Number(t.metadata?.processing_fee ?? 0) ||
      Number(t.quoted_receive ?? 0) + Number(t.metadata?.processing_fee ?? 0)
    if (!(expected > 0)) continue
    if (Math.abs(expected - amount) <= Math.max(0.02, expected * 0.002)) {
      candidates.push(t)
    }
  }

  if (!candidates.length) return null

  const preferred =
    candidates.find((t) => t.mode === "fund_balance" && t.status === "processing") ??
    candidates.find((t) => t.status === "processing") ??
    candidates[0]

  if (txHash && preferred?.id) {
    const priorMeta = preferred.metadata ?? {}
    if (priorMeta.leg1_omnibus_tx_hash !== txHash) {
      await admin
        .from("yc_transfers")
        .update({
          metadata: { ...priorMeta, leg1_omnibus_tx_hash: txHash },
          updated_at: new Date().toISOString(),
        })
        .eq("id", preferred.id)
      preferred.metadata = { ...priorMeta, leg1_omnibus_tx_hash: txHash }
    }
  }

  return preferred ?? null
}

function ycFundBalanceAmountsRoughlyEqual(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return false
  return Math.abs(a - b) <= Math.max(0.01, a * 0.001)
}

/**
 * YC fund_balance vault delivery submitted but Solana hash not linked yet (Turnkey poll race).
 * Matches Noah pending pay-in suppression when chain webhook arrives first.
 */
export async function findPendingYcFundBalanceVaultInbound(
  admin: SupabaseClient,
  input: {
    userId: string
    businessId: string | null
    amount: number
    withinHours?: number
  },
): Promise<YcTransferRow | null> {
  const amount = input.amount
  if (!Number.isFinite(amount) || amount <= 0) return null

  const hours = input.withinHours ?? 72
  const sinceIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

  let q = admin
    .from("yc_transfers")
    .select("*")
    .eq("mode", "fund_balance")
    .neq("status", "completed")
    .gte("updated_at", sinceIso)
  if (input.businessId) {
    q = q.eq("business_id", input.businessId)
  } else {
    q = q.eq("user_id", input.userId).is("business_id", null)
  }

  const { data: rows } = await q.order("updated_at", { ascending: false }).limit(20)
  for (const row of rows ?? []) {
    const transfer = mapTransfer(row as Record<string, unknown>)
    const meta = transfer.metadata
    if (meta.fund_balance_split_status === "completed") continue
    const splitStatus = String(meta.fund_balance_split_status ?? "")
    if (splitStatus !== "send_submitted") continue
    const vaultHash = String(meta.user_vault_tx_hash ?? "").trim()
    if (vaultHash) continue

    const expected =
      Number(meta.usd_credit ?? 0) ||
      Number(transfer.quoted_receive ?? 0)
    if (!ycFundBalanceAmountsRoughlyEqual(amount, expected)) continue

    return transfer
  }
  return null
}

/** Suppress duplicate Turnkey inbound rows for YC fund_balance vault delivery. */
export async function findYcFundBalanceChainSettlementForSuppression(
  admin: SupabaseClient,
  input: { txHash: string | null; userId: string; businessId: string | null },
): Promise<boolean> {
  const txHash = String(input.txHash || "").trim()
  if (!txHash) return false

  let q = admin
    .from("yc_transfers")
    .select("id")
    .eq("mode", "fund_balance")
    .filter("metadata->>user_vault_tx_hash", "eq", txHash)
  if (input.businessId) {
    q = q.eq("business_id", input.businessId)
  } else {
    q = q.eq("user_id", input.userId).is("business_id", null)
  }
  const { data: byTransfer } = await q.maybeSingle()
  if (byTransfer?.id) return true

  let txQ = admin
    .from("transactions")
    .select("id")
    .eq("provider", "yellowcard")
    .eq("tx_hash", txHash)
    .eq("direction", "in")
  if (input.businessId) {
    txQ = txQ.eq("business_id", input.businessId)
  } else {
    txQ = txQ.eq("user_id", input.userId).is("business_id", null)
  }
  const { data: txRow } = await txQ.maybeSingle()
  if (!txRow?.id) return false

  const { data: fullTx } = await admin
    .from("transactions")
    .select("metadata")
    .eq("id", txRow.id)
    .maybeSingle()
  const meta = asMeta(fullTx?.metadata)
  return meta.yc_mode === "fund_balance" || meta.flow === "bank_onramp"
}

/** Fee-wallet refund after cross_border leg2 SEND.FAILED. */
export async function findYcCrossBorderFeeWalletRefundSuppression(
  admin: SupabaseClient,
  input: { amount: number; currency?: string },
): Promise<{ transferId: string; transactionId: string | null } | null> {
  const amount = input.amount
  if (!Number.isFinite(amount) || amount <= 0) return null
  const sinceIso = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const { data: rows } = await admin
    .from("yc_transfers")
    .select("*")
    .eq("mode", "cross_border_send")
    .eq("status", "failed")
    .gte("updated_at", sinceIso)
    .limit(20)

  for (const row of rows ?? []) {
    const t = mapTransfer(row as Record<string, unknown>)
    if (t.metadata.ops_alert !== "cross_border_leg2_failed_refund_to_fee_wallet") continue
    if (t.metadata.yc_fee_wallet_refund_suppressed === true) continue
    const expected =
      Number(t.metadata?.leg2_crypto_amount ?? 0) ||
      Number((t.settlement_info as { send?: { cryptoAmount?: number } } | null)?.send?.cryptoAmount ?? 0)
    if (!(expected > 0)) continue
    if (Math.abs(expected - amount) <= Math.max(0.02, expected * 0.002)) {
      return { transferId: t.id, transactionId: t.transaction_id }
    }
  }
  return null
}
