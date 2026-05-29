/**
 * Noah bank-deposit-to-onchain-address (settlement VA → stablecoin) transaction classification.
 * Fiat pay-in (OffNetwork + FiatPayment) is user-facing; orchestrated on-chain Out is internal.
 */

import { formatDisplayPersonName } from "@easner/shared/format-display-name"
import {
  deriveBankDepositInboundDisplayLabel,
  deriveBankDepositNarrationLabel,
  parseSentFromNarrationLabel,
} from "@easner/shared/transactions/bank-deposit-inbound-label"
import {
  deriveBankDepositPaymentRail,
  deriveBankDepositSchemeLabel,
} from "@easner/shared/transactions/bank-deposit-scheme"
import {
  buildVerificationDepositMetadataFields,
  classifyVerificationDepositFromFiatDeposit,
  deriveVerificationDepositNarrationLabel,
  formatVerificationBankDisplayName,
} from "@easner/shared/transactions/verification-deposit"

function breakdownAmount(tx: Record<string, unknown>, type: string): number | null {
  const items = tx.Breakdown
  if (!Array.isArray(items)) return null
  for (const item of items) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    if (String(row.Type ?? "") !== type) continue
    const n = Number.parseFloat(String(row.Amount ?? ""))
    if (Number.isFinite(n)) return n
  }
  return null
}

export function pickNoahOrchestrationRuleExecutionId(tx: Record<string, unknown>): string | null {
  const orch = tx.Orchestration as Record<string, unknown> | undefined
  const id = orch?.RuleExecutionID ?? orch?.RuleExecutionId ?? orch?.ruleExecutionId
  return id != null && String(id).trim() ? String(id).trim() : null
}

/** Fiat ACH/wire pay-in leg of bank onramp (settlement VA). */
export function isNoahBankOnrampFiatPayIn(tx: Record<string, unknown>): boolean {
  if (String(tx.Direction ?? "") !== "In") return false
  if (String(tx.Network ?? "") !== "OffNetwork") return false
  return !!tx.FiatPayment
}

/** Noah FiatDeposit webhook `Data` object stored as ledger `payload`. */
export function isNoahFiatDepositWebhookPayload(payload: Record<string, unknown>): boolean {
  return payload.FiatAmount != null && !payload.FiatPayment
}

export function isBankOnrampFiatDepositPayload(payload: Record<string, unknown>): boolean {
  return isNoahBankOnrampFiatPayIn(payload) || isNoahFiatDepositWebhookPayload(payload)
}

/**
 * Noah's orchestrated crypto withdrawal to the user's Turnkey wallet — not a separate user action.
 */
export function isNoahBankOnrampOrchestrationOutLeg(tx: Record<string, unknown>): boolean {
  if (String(tx.Direction ?? "") !== "Out") return false
  if (!pickNoahOrchestrationRuleExecutionId(tx)) return false
  const net = String(tx.Network ?? "")
  if (!net || net === "OffNetwork") return false
  const crypto = String(tx.CryptoCurrency ?? "").toUpperCase()
  return crypto.includes("USDC") || crypto.includes("EURC")
}

/**
 * Orchestrated on-chain stablecoin credit to the user's wallet (Transaction In + Orchestration).
 * Excludes fiat VA pay-ins (OffNetwork + FiatPayment) — those are the user-facing ledger row.
 */
export function isNoahBankOnrampOrchestrationInLeg(tx: Record<string, unknown>): boolean {
  if (String(tx.Direction ?? "") !== "In") return false
  if (isNoahBankOnrampFiatPayIn(tx)) return false
  if (!pickNoahOrchestrationRuleExecutionId(tx)) return false
  const net = String(tx.Network ?? "")
  if (!net || net === "OffNetwork") return false
  const crypto = String(tx.CryptoCurrency ?? "").toUpperCase()
  return crypto.includes("USDC") || crypto.includes("EURC")
}

export function isNoahBankOnrampLedgerPayload(tx: Record<string, unknown>): boolean {
  return (
    isNoahBankOnrampFiatPayIn(tx) ||
    isNoahBankOnrampOrchestrationInLeg(tx) ||
    isNoahBankOnrampOrchestrationOutLeg(tx)
  )
}

export function formatNoahAccountHolderName(
  holder: Record<string, unknown> | undefined,
): string | null {
  if (!holder) return null
  const name = holder.Name as Record<string, unknown> | undefined
  if (!name || typeof name !== "object") return null
  const parts = [name.FirstName, name.MiddleName, name.LastName]
    .map((p) => formatDisplayPersonName(p != null ? String(p) : ""))
    .filter(Boolean)
  return parts.length ? parts.join(" ") : null
}

/** @deprecated Prefer {@link parseSentFromNarrationLabel}. */
export function parseLastSentFromInNarration(text: string | null | undefined): string | null {
  const label = parseSentFromNarrationLabel(text)
  if (!label) return null
  return label.replace(/^Sent from\s+/i, "").trim() || null
}

/**
 * FiatDeposit remitter for hero/list — not VA account holder, not ACH narration.
 */
export function deriveNoahBankPayInRemitterName(
  tx: Record<string, unknown>,
  opts?: {
    fiatDepositSenderName?: string | null
  },
): string | null {
  const fp = tx.FiatPayment as Record<string, unknown> | undefined
  const fpSource = fp?.Source as Record<string, unknown> | undefined
  const fpSourceName =
    fpSource &&
    (fpSource.SenderName ??
      fpSource.Name ??
      fpSource.CompanyName ??
      fpSource.MerchantName)

  const label = deriveBankDepositInboundDisplayLabel({
    fiatDepositSenderName:
      opts?.fiatDepositSenderName ??
      (fpSourceName != null && String(fpSourceName).trim() ? String(fpSourceName) : null),
  })
  return label ?? null
}

/** @deprecated Use {@link deriveNoahBankPayInRemitterName}. */
export const deriveNoahBankPayInSenderName = deriveNoahBankPayInRemitterName

export type NoahBankPayInEnrichment = {
  fiatAmount: number
  fiatCurrency: string
  feeAmount: number | null
  settledStablecoinAmount: number | null
  settledStablecoinAsset: string | null
  walletLedgerCurrency: "USD" | "EUR" | null
  senderDisplayName: string | null
  ruleExecutionId: string | null
  paymentReference: string | null
  onChainTxHash: string | null
}

export function extractNoahBankPayInEnrichment(tx: Record<string, unknown>): NoahBankPayInEnrichment | null {
  if (!isNoahBankOnrampFiatPayIn(tx)) return null
  const fp = tx.FiatPayment as Record<string, unknown> | undefined
  const fiatAmount = Number.parseFloat(String(fp?.Amount ?? "0"))
  const fiatCurrency = String(fp?.FiatCurrency ?? "USD").toUpperCase()
  const feeFromFp = fp?.FeeAmount != null ? Number.parseFloat(String(fp.FeeAmount)) : NaN
  const channelFee = breakdownAmount(tx, "ChannelFee")
  const feeAmount = Number.isFinite(feeFromFp) ? feeFromFp : channelFee

  const remaining = breakdownAmount(tx, "Remaining")
  const cryptoAmount = Number.parseFloat(String(tx.Amount ?? ""))
  const settledStablecoinAmount = Number.isFinite(remaining)
    ? remaining
    : Number.isFinite(cryptoAmount)
      ? cryptoAmount
      : null

  const asset = String(tx.CryptoCurrency ?? "").toUpperCase()
  const settledStablecoinAsset = asset || null
  const walletLedgerCurrency: "USD" | "EUR" | null = asset.includes("EURC")
    ? "EUR"
    : asset.includes("USDC")
      ? "USD"
      : fiatCurrency === "EUR"
        ? "EUR"
        : "USD"

  const publicId = tx.PublicID ?? tx.TxHash ?? tx.TransactionHash
  const onChainTxHash = publicId != null && String(publicId).trim() ? String(publicId).trim() : null

  return {
    fiatAmount: Number.isFinite(fiatAmount) ? fiatAmount : 0,
    fiatCurrency,
    feeAmount: feeAmount != null && Number.isFinite(feeAmount) ? feeAmount : null,
    settledStablecoinAmount,
    settledStablecoinAsset,
    walletLedgerCurrency,
    senderDisplayName: null,
    ruleExecutionId: pickNoahOrchestrationRuleExecutionId(tx),
    paymentReference: null,
    onChainTxHash,
  }
}

function roundFiatDisplayAmount(amount: number | null): number | null {
  if (amount == null || !Number.isFinite(amount)) return null
  return Math.round(amount * 100) / 100
}

function pickIsoTimestamp(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (c == null) continue
    const s = String(c).trim()
    if (s) return s
  }
  return null
}

/** Earliest ISO timestamp wins. */
export function mergeBankDepositLifecycleMetadata(
  existing: Record<string, unknown> | null | undefined,
  patch: {
    processing_at?: string | null
    completed_at?: string | null
    noah_fiat_deposit_id?: string | null
  },
): Record<string, unknown> {
  const merged = { ...(existing ?? {}) }
  const nextProcessing = pickIsoTimestamp(patch.processing_at)
  const prevProcessing = pickIsoTimestamp(merged.processing_at)
  if (nextProcessing) {
    if (!prevProcessing || new Date(nextProcessing).getTime() < new Date(prevProcessing).getTime()) {
      merged.processing_at = nextProcessing
    }
  }
  const nextCompleted = pickIsoTimestamp(patch.completed_at)
  if (nextCompleted) {
    merged.completed_at = nextCompleted
  }
  if (patch.noah_fiat_deposit_id) {
    merged.noah_fiat_deposit_id = patch.noah_fiat_deposit_id
  }
  return merged
}

export type FiatDepositEnrichment = {
  depositId: string
  fiatAmount: number
  fiatCurrency: string
  senderDisplayName: string | null
  paymentReference: string | null
  paymentMethodType: string | null
  processingAt: string | null
  status: string
}

export function extractFiatDepositEnrichment(data: Record<string, unknown>): FiatDepositEnrichment | null {
  const depositId = data.ID != null ? String(data.ID).trim() : ""
  if (!depositId) return null
  const sender = data.Sender as Record<string, unknown> | undefined
  const fullName =
    sender?.FullName != null && String(sender.FullName).trim()
      ? formatDisplayPersonName(String(sender.FullName))
      : null
  const fiatAmount = Number.parseFloat(String(data.FiatAmount ?? "0"))
  return {
    depositId,
    fiatAmount: Number.isFinite(fiatAmount) ? fiatAmount : 0,
    fiatCurrency: String(data.FiatCurrency ?? "USD").toUpperCase(),
    senderDisplayName: fullName,
    paymentReference:
      data.Reference != null && String(data.Reference).trim()
        ? String(data.Reference).trim()
        : data.Description != null && String(data.Description).trim()
          ? String(data.Description).trim()
          : data.PaymentSystemID != null && String(data.PaymentSystemID).trim()
            ? String(data.PaymentSystemID).trim()
            : null,
    paymentMethodType:
      data.PaymentMethodType != null && String(data.PaymentMethodType).trim()
        ? String(data.PaymentMethodType).trim()
        : null,
    processingAt: pickIsoTimestamp(data.Created, data.Occurred),
    status: String(data.Status ?? "").toLowerCase(),
  }
}

export function isVerificationFiatDeposit(enrichment: FiatDepositEnrichment): boolean {
  return classifyVerificationDepositFromFiatDeposit({ fiatAmount: enrichment.fiatAmount }) === "verification"
}

/** Ledger metadata for Noah FiatDeposit verification microdeposits (FiatDeposit-first ingest). */
export function buildNoahVerificationFiatDepositLedgerMetadata(
  data: Record<string, unknown>,
  enrichment: FiatDepositEnrichment,
  opts?: { occurredAt?: string | null; completedAt?: string | null },
): Record<string, unknown> {
  const sender = data.Sender as Record<string, unknown> | undefined
  const rawSender =
    sender?.FullName != null && String(sender.FullName).trim() ? String(sender.FullName).trim() : ""
  const verificationBankName = formatVerificationBankDisplayName(rawSender)
  const paymentReference = enrichment.paymentReference
  const depositNarration = deriveVerificationDepositNarrationLabel({
    paymentReference,
    verificationBankName,
    fiatDepositSenderName: rawSender || null,
  })

  const schemeCtx = {
    metadata: {
      fiat_deposit_currency: enrichment.fiatCurrency,
      noah_payment_method_type: enrichment.paymentMethodType,
    },
    payload: data,
  }
  const sourcePaymentRail = deriveBankDepositPaymentRail(schemeCtx)
  const depositSchemeLabel = deriveBankDepositSchemeLabel({
    metadata: { ...schemeCtx.metadata, source_payment_rail: sourcePaymentRail },
    payload: data,
  })

  const processingAt = enrichment.processingAt
  const completedAt =
    enrichment.status === "settled"
      ? pickIsoTimestamp(opts?.completedAt, opts?.occurredAt, data.Created)
      : null

  const base: Record<string, unknown> = {
    source: "webhook_fiat_deposit",
    source_type: "virtual_account",
    flow: "bank_onramp",
    deposit_kind: "verification",
    verification_bank_name: verificationBankName,
    fiat_deposit_amount: enrichment.fiatAmount,
    fiat_deposit_currency: enrichment.fiatCurrency,
    fee_amount: 0,
    settled_amount: 0,
    posted_amount: 0,
    settled_currency: enrichment.fiatCurrency,
    sender_name: verificationBankName,
    remitter_name: verificationBankName,
    noah_fiat_deposit_sender_name: rawSender || null,
    payment_reference: paymentReference,
    reference: paymentReference,
    ...(depositNarration ? { deposit_narration: depositNarration, narration: depositNarration } : {}),
    noah_fiat_deposit_id: enrichment.depositId,
    noah_payment_method_type: enrichment.paymentMethodType,
    source_payment_rail: sourcePaymentRail,
    deposit_scheme_label: depositSchemeLabel,
    destination_payment_rail: "crypto",
    processing_at: processingAt,
    completed_at: completedAt,
  }
  return mergePayInMetadataWithLifecycle({}, base, {
    processing_at: processingAt,
    completed_at: completedAt,
    noah_fiat_deposit_id: enrichment.depositId,
  })
}

export function buildNoahBankPayInLedgerMetadata(
  tx: Record<string, unknown>,
  enrichment: NoahBankPayInEnrichment,
  opts?: {
    status?: string
    occurredAt?: string | null
    /** From FiatDeposit webhook — must win over settlement VA account holder name. */
    fiatDepositSenderName?: string | null
    /** ACH/wire narration (Reference / Description from FiatDeposit). */
    paymentReference?: string | null
  },
): Record<string, unknown> {
  const settledWalletAmount = roundFiatDisplayAmount(enrichment.settledStablecoinAmount)
  const st = String(opts?.status ?? tx.Status ?? "").toLowerCase()
  const processingAt = pickIsoTimestamp(tx.Created, opts?.occurredAt)
  const completedAt =
    st === "settled"
      ? pickIsoTimestamp(tx.Updated, tx.Occurred, opts?.occurredAt)
      : null
  const schemeCtx = {
    metadata: {
      fiat_deposit_currency: enrichment.fiatCurrency,
    },
    payload: tx,
  }
  const sourcePaymentRail = deriveBankDepositPaymentRail(schemeCtx)
  const depositSchemeLabel = deriveBankDepositSchemeLabel({
    metadata: { ...schemeCtx.metadata, source_payment_rail: sourcePaymentRail },
    payload: tx,
  })

  const paymentReference = opts?.paymentReference ?? enrichment.paymentReference
  const remitterName = deriveNoahBankPayInRemitterName(tx, {
    fiatDepositSenderName: opts?.fiatDepositSenderName ?? enrichment.senderDisplayName,
  })
  const depositNarration = deriveBankDepositNarrationLabel({ paymentReference })

  const verificationFields = buildVerificationDepositMetadataFields({
    payload: tx,
    fiatAmount: enrichment.fiatAmount,
    settledStablecoinAmount: enrichment.settledStablecoinAmount,
    fiatDepositSenderName: opts?.fiatDepositSenderName ?? enrichment.senderDisplayName,
  })

  const base: Record<string, unknown> = {
    source: "webhook_transaction",
    source_type: "virtual_account",
    flow: "bank_onramp",
    deposit_kind: verificationFields.deposit_kind,
    verification_bank_name: verificationFields.verification_bank_name,
    fiat_deposit_amount: enrichment.fiatAmount,
    fiat_deposit_currency: enrichment.fiatCurrency,
    fee_amount: enrichment.feeAmount,
    settled_amount: settledWalletAmount,
    posted_amount: settledWalletAmount,
    settled_currency: enrichment.walletLedgerCurrency,
    settled_asset: enrichment.settledStablecoinAsset,
    sender_name: remitterName,
    remitter_name: remitterName,
    noah_fiat_deposit_sender_name: opts?.fiatDepositSenderName ?? null,
    payment_reference: paymentReference,
    reference: paymentReference,
    ...(depositNarration ? { deposit_narration: depositNarration, narration: depositNarration } : {}),
    noah_rule_execution_id: enrichment.ruleExecutionId,
    noah_fiat_deposit_id: enrichment.ruleExecutionId,
    noah_on_chain_tx_hash: enrichment.onChainTxHash,
    source_payment_rail: sourcePaymentRail,
    deposit_scheme_label: depositSchemeLabel,
    destination_payment_rail: "crypto",
    processing_at: processingAt,
    completed_at: completedAt,
  }
  return mergePayInMetadataWithLifecycle({}, base, {
    processing_at: processingAt,
    completed_at: completedAt,
    noah_fiat_deposit_id: enrichment.ruleExecutionId,
  })
}

export function mergePayInMetadataWithLifecycle(
  existingMeta: Record<string, unknown> | null | undefined,
  payInFields: Record<string, unknown>,
  lifecyclePatch: {
    processing_at?: string | null
    completed_at?: string | null
    noah_fiat_deposit_id?: string | null
  },
): Record<string, unknown> {
  return mergeBankDepositLifecycleMetadata(
    { ...(existingMeta ?? {}), ...payInFields },
    lifecyclePatch,
  )
}

export function buildNoahOrchestrationOutLegMetadata(
  tx: Record<string, unknown>,
  ruleExecutionId: string | null,
): Record<string, unknown> {
  return {
    source: "webhook_transaction",
    suppress_in_feed: true,
    noah_orchestration_settlement_leg: true,
    noah_rule_execution_id: ruleExecutionId,
    flow: "bank_onramp",
  }
}
