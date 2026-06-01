import {
  buildBankDepositLifecycle,
  buildTransactionTimingRows,
  deriveBankDepositInboundDisplayLabel,
  deriveBankDepositNarrationLabel,
  deriveBankDepositPaymentRail,
  deriveBankDepositSchemeLabel,
  deriveVerificationBankName,
  deriveVerificationDepositNarrationLabel,
  isBankOnrampDepositFlow,
  isVerificationDepositMetadata,
  type BankDepositLifecycleStep,
  type TransactionTimingRow,
} from "@easner/shared"
import {
  deriveNoahBankPayInRemitterName,
  extractFiatDepositEnrichment,
  extractNoahBankPayInEnrichment,
  isNoahBankOnrampFiatPayIn,
  isNoahFiatDepositWebhookPayload,
  mergeBankDepositLifecycleMetadata,
  pickNoahOrchestrationRuleExecutionId,
} from "@/lib/noah/bank-onramp-tx"
import type { FiatDepositWebhookTimestamps } from "@/lib/noah/fiat-deposit-webhook-timestamps"

function roundFiat(amount: number | null | undefined): number | null {
  if (amount == null || !Number.isFinite(amount)) return null
  return Math.round(amount * 100) / 100
}

function pickIso(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (c == null) continue
    const s = String(c).trim()
    if (s) return s
  }
  return null
}

function pickFiatDepositId(
  payload: Record<string, unknown>,
  meta: Record<string, unknown>,
  enrichment: ReturnType<typeof extractNoahBankPayInEnrichment> | null,
): string | null {
  if (payload.ID != null && String(payload.ID).trim()) {
    return String(payload.ID).trim()
  }
  const fp = payload.FiatPayment as Record<string, unknown> | undefined
  const fromFp = fp?.FiatDepositID != null ? String(fp.FiatDepositID).trim() : ""
  if (fromFp) return fromFp
  if (enrichment?.ruleExecutionId) return enrichment.ruleExecutionId
  const fromMeta = meta.noah_fiat_deposit_id ?? meta.noah_rule_execution_id
  if (fromMeta != null && String(fromMeta).trim()) return String(fromMeta).trim()
  return pickNoahOrchestrationRuleExecutionId(payload)
}

export type ResolvedBankDepositPayIn = {
  effectiveMetadata: Record<string, unknown>
  lifecycle: BankDepositLifecycleStep[]
  depositAmount: number
  feeAmount: number | null
  postedAmount: number | null
  postedCurrency: string
  depositSchemeLabel: string
  sourcePaymentRail: string
  senderName: string | null
  narration: string | null
  reference: string | null
  processingAt: string | null
  completedAt: string | null
  transactionStartedAt: string | null
  ledgerCreatedAt: string | null
  transactionTiming: TransactionTimingRow[]
  fiatDepositId: string | null
}

export function resolveBankDepositPayInDetail(
  row: Record<string, unknown>,
  webhook?: FiatDepositWebhookTimestamps | null,
): ResolvedBankDepositPayIn | null {
  const meta = (row.metadata as Record<string, unknown> | null | undefined) ?? {}
  const payload = (row.payload as Record<string, unknown> | null | undefined) ?? {}
  const isFiatDepositPayload = isNoahFiatDepositWebhookPayload(payload)
  if (!isNoahBankOnrampFiatPayIn(payload) && !isBankOnrampDepositFlow(meta) && !isFiatDepositPayload) {
    return null
  }

  const txEnrichment = isFiatDepositPayload ? null : extractNoahBankPayInEnrichment(payload)
  const fdEnrichment = isFiatDepositPayload ? extractFiatDepositEnrichment(payload) : null
  if (!txEnrichment && !fdEnrichment && !isBankOnrampDepositFlow(meta)) return null

  const fiatDepositId = pickFiatDepositId(payload, meta, txEnrichment)
  const ledgerStatus = String(row.status ?? "")
  const stLower = ledgerStatus.toLowerCase()

  const depositAmount = roundFiat(
    typeof meta.fiat_deposit_amount === "number"
      ? meta.fiat_deposit_amount
      : fdEnrichment?.fiatAmount ?? txEnrichment?.fiatAmount,
  ) ?? fdEnrichment?.fiatAmount ?? txEnrichment?.fiatAmount ?? 0

  const feeAmount = roundFiat(
    typeof meta.fee_amount === "number" ? meta.fee_amount : txEnrichment?.feeAmount,
  )

  const postedAmount = roundFiat(
    typeof meta.posted_amount === "number"
      ? meta.posted_amount
      : typeof meta.settled_amount === "number"
        ? meta.settled_amount
        : txEnrichment?.settledStablecoinAmount,
  )

  const fiatCurrency =
    fdEnrichment?.fiatCurrency ??
    txEnrichment?.fiatCurrency ??
    String(meta.fiat_deposit_currency ?? "USD").toUpperCase()

  const postedCurrency =
    meta.settled_currency != null
      ? String(meta.settled_currency).toUpperCase()
      : txEnrichment?.walletLedgerCurrency ?? fiatCurrency

  const paymentReference =
    webhook?.paymentReference ||
    (typeof meta.payment_reference === "string" && meta.payment_reference.trim()) ||
    (typeof meta.reference === "string" && meta.reference.trim()) ||
    fdEnrichment?.paymentReference ||
    txEnrichment?.paymentReference ||
    null

  const fiatDepositSenderName =
    webhook?.senderName ??
    (typeof meta.noah_fiat_deposit_sender_name === "string"
      ? meta.noah_fiat_deposit_sender_name
      : null)

  const senderName = isVerificationDepositMetadata(meta)
    ? deriveVerificationBankName({
        metadata: meta,
        payload,
        fiatDepositSenderName,
      })
    : (deriveBankDepositInboundDisplayLabel({
        metadata: meta,
        fiatDepositSenderName,
      }) ??
      deriveNoahBankPayInRemitterName(payload, { fiatDepositSenderName }) ??
      null)

  const narration = isVerificationDepositMetadata(meta)
    ? deriveVerificationDepositNarrationLabel({
        metadata: meta,
        paymentReference,
        verificationBankName:
          typeof meta.verification_bank_name === "string" ? meta.verification_bank_name : undefined,
        fiatDepositSenderName,
      })
    : (deriveBankDepositNarrationLabel({
        metadata: meta,
        paymentReference,
      }) ?? undefined)

  const processingAt =
    pickIso(meta.processing_at) ??
    webhook?.processingAt ??
    pickIso(payload.Created, row.occurred_at, row.created_at)

  const transactionStartedAt = pickIso(meta.transaction_started_at, row.created_at)
  const completedAt =
    stLower === "settled"
      ? pickIso(meta.completed_at, webhook?.completedAt)
      : pickIso(meta.completed_at)

  const schemeCtx = {
    metadata: {
      ...meta,
      fiat_deposit_currency: fiatCurrency,
      noah_payment_method_type:
        meta.noah_payment_method_type ??
        (webhook?.paymentMethodType != null ? webhook.paymentMethodType : null) ??
        fdEnrichment?.paymentMethodType,
    },
    payload,
  }
  const sourcePaymentRail = deriveBankDepositPaymentRail(schemeCtx)
  const depositSchemeLabel = deriveBankDepositSchemeLabel({
    metadata: { ...schemeCtx.metadata, source_payment_rail: sourcePaymentRail },
    payload,
  })

  const payInFields: Record<string, unknown> = {
    flow: "bank_onramp",
    source_type: "virtual_account",
    fiat_deposit_amount: depositAmount,
    fiat_deposit_currency: fiatCurrency,
    fee_amount: feeAmount,
    settled_amount: postedAmount,
    posted_amount: postedAmount,
    settled_currency: postedCurrency,
    sender_name: senderName,
    remitter_name: senderName,
    noah_fiat_deposit_sender_name:
      fiatDepositSenderName ??
      (typeof meta.noah_fiat_deposit_sender_name === "string"
        ? meta.noah_fiat_deposit_sender_name
        : null),
    payment_reference: paymentReference,
    reference: paymentReference,
    ...(narration ? { deposit_narration: narration, narration } : {}),
    noah_rule_execution_id: txEnrichment?.ruleExecutionId ?? fiatDepositId,
    noah_fiat_deposit_id: fiatDepositId,
    noah_on_chain_tx_hash: txEnrichment?.onChainTxHash ?? null,
    source_payment_rail: sourcePaymentRail,
    deposit_scheme_label: depositSchemeLabel,
    processing_at: processingAt,
    completed_at: completedAt,
  }

  const effectiveMetadata = mergeBankDepositLifecycleMetadata(
    { ...meta, ...payInFields },
    {
      processing_at: processingAt,
      completed_at: completedAt,
      noah_fiat_deposit_id: fiatDepositId,
    },
  )

  const lifecycle = buildBankDepositLifecycle({
    status: ledgerStatus,
    metadata: effectiveMetadata,
    payload,
    occurredAt: row.occurred_at != null ? String(row.occurred_at) : null,
    settledAt: row.settled_at != null ? String(row.settled_at) : null,
    createdAt: row.created_at != null ? String(row.created_at) : null,
  })

  const transactionTiming = buildTransactionTimingRows({
    status: ledgerStatus,
    startedAt: transactionStartedAt,
    completedAt,
    showExpectedWhileInFlight: false,
  })

  return {
    effectiveMetadata,
    lifecycle,
    depositAmount,
    feeAmount,
    postedAmount,
    postedCurrency,
    depositSchemeLabel,
    sourcePaymentRail,
    senderName,
    narration,
    reference: narration ?? paymentReference,
    processingAt,
    completedAt,
    transactionStartedAt,
    ledgerCreatedAt: row.created_at != null ? String(row.created_at) : null,
    transactionTiming,
    fiatDepositId,
  }
}
