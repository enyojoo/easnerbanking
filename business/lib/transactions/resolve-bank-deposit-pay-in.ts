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
  isYcFundBalanceDepositMetadata,
  reconstructYcFundBalanceDepositReview,
  resolveYcFundBalanceDepositDisplayTitle,
  type BankDepositLifecycleStep,
  type TransactionTimingRow,
  type YcFundBalanceDepositReviewSnapshot,
  resolveTransactionTimingAnchors,
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
import type { BankOnrampOrchestrationOutTimestamps } from "@/lib/noah/bank-onramp-orchestration-out-webhook-timestamps"
import type { FiatDepositWebhookTimestamps } from "@/lib/noah/fiat-deposit-webhook-timestamps"
import { resolveLedgerWhenAtFromRow } from "@/lib/ledger/ledger-occurred-at"

export type BankDepositPayInWebhookContext = {
  fiatDeposit?: FiatDepositWebhookTimestamps | null
  orchestrationOut?: BankOnrampOrchestrationOutTimestamps | null
}

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
  depositReview?: YcFundBalanceDepositReviewSnapshot | null
  depositDisplayTitle?: string | null
  displayHeroTitle?: string | null
}

export function resolveBankDepositPayInDetail(
  row: Record<string, unknown>,
  webhooks?: BankDepositPayInWebhookContext | FiatDepositWebhookTimestamps | null,
): ResolvedBankDepositPayIn | null {
  const fiatDepositWebhook =
    webhooks && "fiatDeposit" in webhooks
      ? webhooks.fiatDeposit
      : (webhooks as FiatDepositWebhookTimestamps | null | undefined)
  const orchestrationOutWebhook =
    webhooks && "orchestrationOut" in webhooks ? webhooks.orchestrationOut : null
  const meta = (row.metadata as Record<string, unknown> | null | undefined) ?? {}
  const payload = (row.payload as Record<string, unknown> | null | undefined) ?? {}
  const isFiatDepositPayload = isNoahFiatDepositWebhookPayload(payload)
  const isYcFundBalance =
    String(row.provider ?? "").toLowerCase() === "yellowcard" &&
    (isYcFundBalanceDepositMetadata(meta) || meta.flow === "bank_onramp")
  if (
    !isNoahBankOnrampFiatPayIn(payload) &&
    !isBankOnrampDepositFlow(meta) &&
    !isFiatDepositPayload &&
    !isYcFundBalance
  ) {
    return null
  }

  if (isYcFundBalance) {
    const ledgerStatus = String(row.status ?? "")
    const depositAmount =
      roundFiat(typeof meta.local_pay_in === "number" ? meta.local_pay_in : Number(meta.local_pay_in)) ??
      0
    const postedAmount =
      roundFiat(typeof meta.usd_credit === "number" ? meta.usd_credit : Number(meta.usd_credit)) ??
      roundFiat(typeof row.amount === "number" ? row.amount : Number(row.amount))
    const feeAmount = roundFiat(
      typeof meta.processing_fee === "number" ? meta.processing_fee : Number(meta.processing_fee),
    )
    const fiatCurrency = String(meta.local_currency ?? "NGN").toUpperCase()
    const payInRail =
      String(meta.pay_in_rail ?? "").trim().toLowerCase() === "mobile_money"
        ? "mobile_money"
        : "bank_transfer"
    const processingAt = pickIso(meta.processing_at)
    const completedAt = pickIso(meta.completed_at, row.settled_at)
    const failedAt = pickIso(meta.failed_at)
    const depositReview = reconstructYcFundBalanceDepositReview(
      meta,
      typeof meta.customer_rate === "number" ? meta.customer_rate : Number(meta.customer_rate),
    )
    const depositDisplayTitle = resolveYcFundBalanceDepositDisplayTitle(meta)
    const displayHeroTitle =
      String(meta.display_hero_title ?? "").trim() || depositDisplayTitle
    const sourcePaymentRail = payInRail === "mobile_money" ? "mobile_money" : "local_bank"
    const schemeCtx = {
      metadata: {
        ...meta,
        flow: "bank_onramp",
        fiat_deposit_currency: fiatCurrency,
        source_payment_rail: sourcePaymentRail,
      },
      payload,
    }
    const depositSchemeLabel = deriveBankDepositSchemeLabel({
      metadata: { ...schemeCtx.metadata, source_payment_rail: sourcePaymentRail },
      payload,
    })
    const effectiveMetadata = mergeBankDepositLifecycleMetadata(
      {
        ...meta,
        flow: "bank_onramp",
        fiat_deposit_amount: depositAmount,
        fiat_deposit_currency: fiatCurrency,
        fee_amount: feeAmount,
        settled_amount: postedAmount,
        posted_amount: postedAmount,
        settled_currency: "USD",
        source_payment_rail: sourcePaymentRail,
        deposit_scheme_label: depositSchemeLabel,
        deposit_display_title: depositDisplayTitle,
        display_hero_title: displayHeroTitle,
        ...(depositReview ? { deposit_review: depositReview } : {}),
      },
      {
        processing_at: processingAt,
        completed_at: completedAt,
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
    const timingAnchors = resolveTransactionTimingAnchors({
      createdAt: row.created_at != null ? String(row.created_at) : null,
      metadata: effectiveMetadata,
      webhookProcessingAt: processingAt,
      webhookCompletedAt: completedAt,
      webhookFailedAt: failedAt,
      lifecycle,
    })
    const transactionTiming = buildTransactionTimingRows({
      status: ledgerStatus,
      startedAt: timingAnchors.startedAt,
      completedAt: timingAnchors.completedAt,
      failedAt: timingAnchors.failedAt,
      showExpectedWhileInFlight: false,
      showStartedWhileInFlight: false,
      showTerminalDuration: false,
    })
    return {
      effectiveMetadata,
      lifecycle,
      depositAmount,
      feeAmount,
      postedAmount,
      postedCurrency: "USD",
      depositSchemeLabel,
      sourcePaymentRail,
      senderName: null,
      narration: null,
      reference: null,
      processingAt,
      completedAt,
      transactionStartedAt: processingAt,
      ledgerCreatedAt: resolveLedgerWhenAtFromRow(row),
      transactionTiming,
      fiatDepositId: meta.yc_sequence_id != null ? String(meta.yc_sequence_id) : null,
      depositReview,
      depositDisplayTitle,
      displayHeroTitle,
    }
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
    typeof meta.customer_fee === "number"
      ? meta.customer_fee
      : typeof meta.fee_amount === "number"
        ? meta.fee_amount
        : txEnrichment?.feeAmount,
  )

  const postedAmount = roundFiat(
    typeof meta.user_net_amount === "number"
      ? meta.user_net_amount
      : typeof meta.posted_amount === "number"
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
    fiatDepositWebhook?.paymentReference ||
    (typeof meta.payment_reference === "string" && meta.payment_reference.trim()) ||
    (typeof meta.reference === "string" && meta.reference.trim()) ||
    fdEnrichment?.paymentReference ||
    txEnrichment?.paymentReference ||
    null

  const fiatDepositSenderName =
    fiatDepositWebhook?.senderName ??
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
    pickIso(meta.processing_at, fiatDepositWebhook?.processingAt, payload.Created, row.occurred_at)

  const ruleExecutionId =
    txEnrichment?.ruleExecutionId ??
    pickNoahOrchestrationRuleExecutionId(payload) ??
    fiatDepositId

  const isVerification = isVerificationDepositMetadata(meta)
  const completedAt = isVerification
    ? pickIso(meta.completed_at, fiatDepositWebhook?.completedAt)
    : pickIso(
        meta.on_chain_settled_at,
        orchestrationOutWebhook?.onChainSettledAt,
        meta.completed_at,
      )
  const failedAt = pickIso(meta.failed_at, meta.noah_payout_failed_at)

  const schemeCtx = {
    metadata: {
      ...meta,
      fiat_deposit_currency: fiatCurrency,
      noah_payment_method_type:
        meta.noah_payment_method_type ??
        (fiatDepositWebhook?.paymentMethodType != null
          ? fiatDepositWebhook.paymentMethodType
          : null) ??
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
    noah_rule_execution_id: ruleExecutionId,
    noah_fiat_deposit_id: fiatDepositId,
    noah_on_chain_tx_hash:
      pickIso(meta.noah_on_chain_tx_hash, orchestrationOutWebhook?.solanaTxHash) ??
      txEnrichment?.onChainTxHash ??
      null,
    source_payment_rail: sourcePaymentRail,
    deposit_scheme_label: depositSchemeLabel,
    processing_at: processingAt,
    ...(isVerification ? { completed_at: completedAt } : {}),
    ...(completedAt && !isVerification ? { on_chain_settled_at: completedAt, completed_at: completedAt } : {}),
  }

  const effectiveMetadata = mergeBankDepositLifecycleMetadata(
    { ...meta, ...payInFields },
    {
      processing_at: processingAt,
      ...(isVerification
        ? { completed_at: completedAt }
        : completedAt
          ? { on_chain_settled_at: completedAt }
          : {}),
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

  const timingAnchors = resolveTransactionTimingAnchors({
    createdAt: row.created_at != null ? String(row.created_at) : null,
    metadata: effectiveMetadata,
    webhookProcessingAt: fiatDepositWebhook?.processingAt,
    webhookCompletedAt: completedAt,
    webhookFailedAt: failedAt,
    lifecycle,
  })

  const transactionTiming = buildTransactionTimingRows({
    status: ledgerStatus,
    startedAt: timingAnchors.startedAt,
    completedAt: timingAnchors.completedAt,
    failedAt: timingAnchors.failedAt,
    showExpectedWhileInFlight: false,
    showStartedWhileInFlight: false,
    showTerminalDuration: false,
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
    narration: narration ?? null,
    reference: narration ?? paymentReference,
    processingAt,
    completedAt,
    transactionStartedAt: processingAt,
    ledgerCreatedAt: resolveLedgerWhenAtFromRow(row),
    transactionTiming,
    fiatDepositId,
  }
}
