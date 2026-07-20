/**
 * Unified inbound receive detail — YC fund_balance, Noah VA, verification, stablecoin, Easetag.
 * One snapshot + row builder for detail, email, receipt, and notifications.
 */

import { formatMoneyDisplay } from "../format-money-display"
import { formatReviewRowMoneyDisplay } from "../format-review-row-money"
import { formatSendRateLabel } from "../format-exchange-rate"
import { computeDisplayProcessingFee } from "../payout-processing-fee"
import { REVIEW_ROW_LABELS } from "../review-row-labels"
import { isPayoutReviewFeeVisible } from "../payout-review-display"
import { formatMaskedSenderDisplay } from "../payout-recipient-subtitle"
import {
  BANK_DEPOSIT_COMPLETED_DESCRIPTION,
  isBankOnrampDepositFlow,
} from "./bank-deposit-lifecycle"
import { deriveBankDepositSchemeLabel } from "./bank-deposit-scheme"
import type { YcFundBalanceDepositReviewSnapshot } from "./global-deposit-types"
import {
  isNoahVaFundingDeposit,
  isYcFundBalanceDepositMetadata,
  normalizeYcFundBalanceDepositReview,
  reconstructYcFundBalanceDepositReview,
  resolveYcFundBalanceLocalPayInBreakdown,
  resolveNoahVaFundingDepositTitleFromMeta,
  resolveNoahVaFundingNotificationActivityLabel,
  resolveYcFundBalanceDepositDisplayTitle,
  resolveYcFundBalanceNotificationActivityLabelFromMetadata,
} from "./yc-deposit-display"
import { deriveEasnerInboundRemitterDisplayName } from "./product-label"
import {
  resolveYcPayInUserWhenAt,
} from "./yc-pay-in-display"
import {
  BANK_VERIFICATION_COMPLETED_DESCRIPTION,
  deriveVerificationBankName,
  isVerificationDepositMetadata,
} from "./verification-deposit"

export type InboundReceiveKind =
  | "yc_fund_balance"
  | "noah_va_funding"
  | "noah_verification"
  | "stablecoin"
  | "easetag_receive"

export type InboundReceiveCreditDestination = {
  label: "credit_to" | "credit_for"
  balanceLabel: string
  currency: string
  hint?: string
}

export type InboundReceiveDetailSnapshot = {
  kind: InboundReceiveKind
  displayTitle: string
  transactionId: string
  whenAt: string
  amountCredited: { amount: number; currency: string }
  creditDestination?: InboundReceiveCreditDestination
  scheme?: string
  sender?: string
  amountPaid?: { amount: number; currency: string }
  depositAmount?: { amount: number; currency: string }
  processingFee?: { amount: number; currency: string }
  exchangeRate?: { from: string; to: string; rate: number }
  narration?: string
  note?: string
  /** Push/email activity label (may differ from displayTitle casing). */
  notificationActivityLabel?: string
}

export type InboundReceiveDetailRow = {
  label: string
  value: string
  /** When set, UI renders currency flag + balance label instead of plain text. */
  creditCurrency?: string
  /** Verification explainer — detail surface only. */
  isVerificationHint?: boolean
}

export type InboundReceiveRowSurface = "detail" | "email" | "receipt"

export type InboundReceiveResolveInput = {
  provider?: string | null
  direction?: string | null
  metadata?: Record<string, unknown> | null
  payload?: Record<string, unknown> | null
  source_type?: string | null
  chain?: string | null
  currency?: string | null
  amount?: number | null
  deposit_review?: YcFundBalanceDepositReviewSnapshot | null
  sender_display_name?: string | null
  source_payment_rail?: string | null
  reference?: string | null
  fee_amount?: number | null
  posted_amount?: number | null
  posted_currency?: string | null
  settled_amount?: number | null
  settled_currency?: string | null
  occurred_at?: string | null
  created_at?: string | null
  ledger_created_at?: string | null
  easner_transaction_id?: string | null
  send_note?: string | null
  display_description?: string | null
}

const VERIFICATION_CREDIT_HINT =
  "Verification only — not added to your spendable balance."

const CHAIN_ABBREVIATIONS: Record<string, string> = {
  solana: "SOL",
  ethereum: "ETH",
  polygon: "MATIC",
  polygonpos: "MATIC",
  base: "BASE",
  arbitrum: "ARB",
}

function readMetaString(meta: Record<string, unknown>, key: string): string {
  const v = meta[key]
  if (v == null) return ""
  return String(v).trim()
}

function pickIso(...candidates: unknown[]): string {
  for (const c of candidates) {
    if (c == null) continue
    const s = String(c).trim()
    if (s) return s
  }
  return ""
}

function pickAmount(...candidates: unknown[]): number | null {
  for (const c of candidates) {
    const n = typeof c === "number" ? c : Number(c)
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}

function abbreviateChain(chain: string): string {
  const key = chain.trim().toLowerCase()
  return CHAIN_ABBREVIATIONS[key] || key.toUpperCase()
}

function deriveStablecoinSchemeLabel(input: InboundReceiveResolveInput): string {
  const meta = input.metadata ?? {}
  const rail = String(
    input.source_payment_rail ?? meta.source_payment_rail ?? meta.payment_rail ?? input.chain ?? "solana",
  )
  const railDisplay = abbreviateChain(rail)
  const sourceCurrency = String(
    meta.source_currency ?? input.posted_currency ?? input.settled_currency ?? input.currency ?? "",
  ).toUpperCase()
  const stablecoin = sourceCurrency === "EUR" || sourceCurrency === "EURC" ? "EURC" : "USDC"
  return `${stablecoin} on ${railDisplay}`
}

function isStablecoinInbound(input: InboundReceiveResolveInput): boolean {
  const meta = input.metadata ?? {}
  if (String(meta.flow ?? "").toLowerCase() === "bank_onramp") return false
  const sourceType = String(meta.source_type ?? input.source_type ?? "").toLowerCase()
  if (sourceType === "liquidation_address") return true
  const provider = String(input.provider ?? "").toLowerCase()
  if (provider === "turnkey" && (input.chain || meta.chain || input.source_payment_rail)) return true
  return false
}

function isEasetagInbound(input: InboundReceiveResolveInput): boolean {
  const meta = input.metadata ?? {}
  return (
    String(meta.source ?? "").toLowerCase() === "easetag_p2p" ||
    String(input.source_type ?? "").toLowerCase() === "easetag_p2p"
  )
}

function readEasetagHandle(meta: Record<string, unknown>): string {
  const raw = readMetaString(meta, "sender_easetag")
  return raw ? raw.replace(/^@+/, "") : ""
}

/** Priority: easetag → verification → yc_fund_balance → stablecoin → noah_va_funding */
export function classifyInboundReceiveKind(
  input: InboundReceiveResolveInput,
): InboundReceiveKind | null {
  const dir = String(input.direction ?? "").toLowerCase()
  if (dir !== "in" && dir !== "credit") return null

  const meta = input.metadata ?? {}

  if (isEasetagInbound(input)) return "easetag_receive"
  if (isVerificationDepositMetadata(meta)) return "noah_verification"
  if (input.deposit_review || isYcFundBalanceDepositMetadata(meta)) return "yc_fund_balance"
  if (isStablecoinInbound(input)) return "stablecoin"
  if (
    isNoahVaFundingDeposit({ provider: input.provider, direction: "in", metadata: meta }) ||
    isBankOnrampDepositFlow(meta)
  ) {
    return "noah_va_funding"
  }
  return null
}

export function resolveCreditDestination(
  currency: string,
  kind: InboundReceiveKind,
): InboundReceiveCreditDestination {
  const c = String(currency ?? "USD").trim().toUpperCase() || "USD"
  const balanceLabel = `${c} Balance`
  if (kind === "noah_verification") {
    return {
      label: "credit_for",
      balanceLabel,
      currency: c,
      hint: VERIFICATION_CREDIT_HINT,
    }
  }
  return { label: "credit_to", balanceLabel, currency: c }
}

function resolveDisplayTitle(kind: InboundReceiveKind, input: InboundReceiveResolveInput): string {
  const meta = input.metadata ?? {}
  switch (kind) {
    case "yc_fund_balance":
      return resolveYcFundBalanceDepositDisplayTitle(meta)
    case "noah_va_funding":
      return resolveNoahVaFundingDepositTitleFromMeta(meta)
    case "noah_verification":
      return "Bank verification deposit"
    case "stablecoin":
      return "Stablecoin deposit"
    case "easetag_receive": {
      const handle = readEasetagHandle(meta)
      return handle ? `Received from @${handle}` : "Easetag received"
    }
    default:
      return "Deposit"
  }
}

function resolveSender(input: InboundReceiveResolveInput): string | undefined {
  const meta = input.metadata ?? {}
  if (input.sender_display_name?.trim()) return input.sender_display_name.trim()
  const fromMeta = deriveEasnerInboundRemitterDisplayName({
    metadata: meta,
    payload: input.payload ?? null,
  })
  if (fromMeta?.trim()) return fromMeta.trim()
  const masked = formatMaskedSenderDisplay({
    senderName: readMetaString(meta, "sender_name"),
    counterpartyAddress: readMetaString(meta, "counterparty_address") || readMetaString(meta, "from_address"),
  })
  return masked || undefined
}

export function resolveInboundReceiveDetail(
  input: InboundReceiveResolveInput,
): InboundReceiveDetailSnapshot | null {
  const kind = classifyInboundReceiveKind(input)
  if (!kind) return null

  const meta = input.metadata ?? {}
  const transactionId = pickIso(
    input.easner_transaction_id,
    meta.easner_transaction_id,
    meta.transaction_id,
  )
  const whenAt =
    resolveYcPayInUserWhenAt(meta) ??
    pickIso(
      input.occurred_at,
      input.ledger_created_at,
      input.created_at,
      meta.ledger_created_at,
      meta.created_at,
    )
  const note = pickIso(input.send_note, meta.send_note, meta.note)

  if (kind === "yc_fund_balance") {
    const review =
      normalizeYcFundBalanceDepositReview(input.deposit_review) ??
      normalizeYcFundBalanceDepositReview(meta.deposit_review) ??
      reconstructYcFundBalanceDepositReview(
        meta,
        typeof meta.customer_rate === "number" ? meta.customer_rate : Number(meta.customer_rate),
      )
    if (!review) return null

    const breakdown = resolveYcFundBalanceLocalPayInBreakdown(review)
    const displayProcessingFeeUsd = computeDisplayProcessingFee({
      processingFee: review.processing_fee,
      exchangeFee: review.exchange_fee,
    })
    const feeLocalRaw = Number(meta.display_processing_fee_local)
    const feeLocal =
      Number.isFinite(feeLocalRaw) && feeLocalRaw > 0 ? feeLocalRaw : breakdown.feeLocal
    const feeAmount = feeLocal > 0 ? feeLocal : displayProcessingFeeUsd
    const feeCurrency = feeLocal > 0 ? review.local_currency : "USD"

    return {
      kind,
      displayTitle: resolveDisplayTitle(kind, input),
      notificationActivityLabel: resolveYcFundBalanceNotificationActivityLabelFromMetadata(
        meta,
        review,
      ),
      transactionId,
      whenAt,
      amountCredited: { amount: review.usd_credit, currency: "USD" },
      creditDestination: resolveCreditDestination("USD", kind),
      scheme: review.transfer_method,
      depositAmount: { amount: breakdown.principalLocal, currency: review.local_currency },
      amountPaid: { amount: breakdown.totalLocal, currency: review.local_currency },
      ...(isPayoutReviewFeeVisible(feeAmount)
        ? { processingFee: { amount: feeAmount, currency: feeCurrency } }
        : {}),
      ...(review.exchange_rate > 0
        ? { exchangeRate: { from: "USD", to: review.local_currency, rate: review.exchange_rate } }
        : {}),
      ...(note ? { note } : {}),
    }
  }

  if (kind === "noah_verification") {
    const creditedCurrency = String(
      input.posted_currency ?? input.settled_currency ?? input.currency ?? meta.settled_currency ?? "USD",
    ).toUpperCase()
    const creditedAmount =
      pickAmount(input.posted_amount, input.settled_amount, input.amount, meta.posted_amount, meta.settled_amount) ??
      0
    const bank = deriveVerificationBankName({ metadata: meta, payload: input.payload ?? null })
    return {
      kind,
      displayTitle: resolveDisplayTitle(kind, input),
      notificationActivityLabel: "Bank verification deposit",
      transactionId,
      whenAt,
      amountCredited: { amount: creditedAmount, currency: creditedCurrency },
      creditDestination: resolveCreditDestination(creditedCurrency, kind),
      scheme: deriveBankDepositSchemeLabel({ metadata: meta, payload: input.payload ?? null }),
      sender: bank || resolveSender(input),
      ...(readMetaString(meta, "reference") || input.reference
        ? { narration: readMetaString(meta, "reference") || input.reference || undefined }
        : {}),
    }
  }

  if (kind === "noah_va_funding") {
    const creditedCurrency = String(
      input.posted_currency ??
        input.settled_currency ??
        input.currency ??
        meta.posted_currency ??
        meta.settled_currency ??
        meta.fiat_deposit_currency ??
        "USD",
    ).toUpperCase()
    const creditedAmount =
      pickAmount(
        input.posted_amount,
        input.settled_amount,
        input.amount,
        meta.posted_amount,
        meta.settled_amount,
        meta.fiat_deposit_amount,
      ) ?? 0
    const feeAmount = pickAmount(input.fee_amount, meta.fee_amount, meta.fee) ?? 0
    const feeCurrency = String(input.currency ?? meta.currency ?? creditedCurrency).toUpperCase()
    return {
      kind,
      displayTitle: resolveDisplayTitle(kind, input),
      notificationActivityLabel: resolveNoahVaFundingNotificationActivityLabel(creditedCurrency),
      transactionId,
      whenAt,
      amountCredited: { amount: creditedAmount, currency: creditedCurrency },
      creditDestination: resolveCreditDestination(creditedCurrency, kind),
      scheme: deriveBankDepositSchemeLabel({ metadata: meta, payload: input.payload ?? null }),
      sender: resolveSender(input),
      ...(feeAmount > 0 ? { processingFee: { amount: feeAmount, currency: feeCurrency } } : {}),
      ...(readMetaString(meta, "reference") || readMetaString(meta, "narration") || input.reference
        ? {
            narration:
              readMetaString(meta, "narration") ||
              readMetaString(meta, "reference") ||
              input.reference ||
              undefined,
          }
        : {}),
      ...(note ? { note } : {}),
    }
  }

  if (kind === "stablecoin") {
    const creditedCurrency = String(
      input.posted_currency ?? input.settled_currency ?? input.currency ?? meta.posted_currency ?? "USD",
    ).toUpperCase()
    const creditedAmount =
      pickAmount(input.posted_amount, input.settled_amount, input.amount, meta.posted_amount, meta.settled_amount) ??
      0
    const feeAmount = pickAmount(input.fee_amount, meta.fee_amount, meta.fee) ?? 0
    const feeCurrency = String(input.currency ?? creditedCurrency).toUpperCase()
    return {
      kind,
      displayTitle: resolveDisplayTitle(kind, input),
      notificationActivityLabel: "Stablecoin deposit",
      transactionId,
      whenAt,
      amountCredited: { amount: creditedAmount, currency: creditedCurrency },
      creditDestination: resolveCreditDestination(creditedCurrency, kind),
      scheme: deriveStablecoinSchemeLabel(input),
      sender: resolveSender(input),
      ...(feeAmount > 0 ? { processingFee: { amount: feeAmount, currency: feeCurrency } } : {}),
      ...(note ? { note } : {}),
    }
  }

  // easetag_receive
  const creditedCurrency = String(
    input.posted_currency ?? input.settled_currency ?? input.currency ?? meta.currency ?? "USD",
  ).toUpperCase()
  const creditedAmount =
    pickAmount(input.posted_amount, input.settled_amount, input.amount, meta.amount) ?? 0
  return {
    kind,
    displayTitle: resolveDisplayTitle(kind, input),
    transactionId,
    whenAt,
    amountCredited: { amount: creditedAmount, currency: creditedCurrency },
    creditDestination: resolveCreditDestination(creditedCurrency, kind),
    scheme: "Easetag",
    ...(note ? { note } : {}),
  }
}

function pushIf(rows: InboundReceiveDetailRow[], label: string, value: string | null | undefined): void {
  const v = String(value ?? "").trim()
  if (v) rows.push({ label, value: v })
}

function pushCreditDestination(
  rows: InboundReceiveDetailRow[],
  dest: InboundReceiveCreditDestination | undefined,
): void {
  if (!dest) return
  const label = dest.label === "credit_for" ? REVIEW_ROW_LABELS.creditFor : REVIEW_ROW_LABELS.creditTo
  rows.push({ label, value: dest.balanceLabel, creditCurrency: dest.currency })
}

function formatWhen(iso: string): string {
  if (!iso) return ""
  try {
    return new Date(iso).toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

export function buildInboundReceiveDetailRows(
  snapshot: InboundReceiveDetailSnapshot,
  options?: { surface?: InboundReceiveRowSurface },
): InboundReceiveDetailRow[] {
  const surface = options?.surface ?? "detail"
  const includeWhen = surface === "detail"
  const includeVerificationHint = surface === "detail"
  const rows: InboundReceiveDetailRow[] = []

  switch (snapshot.kind) {
    case "yc_fund_balance": {
      if (snapshot.exchangeRate && snapshot.exchangeRate.rate > 0) {
        pushIf(
          rows,
          REVIEW_ROW_LABELS.exchangeRate,
          formatSendRateLabel(
            snapshot.exchangeRate.from,
            snapshot.exchangeRate.to,
            snapshot.exchangeRate.rate,
          ),
        )
      }
      if (snapshot.depositAmount) {
        pushIf(
          rows,
          REVIEW_ROW_LABELS.depositAmount,
          formatReviewRowMoneyDisplay(
            REVIEW_ROW_LABELS.depositAmount,
            snapshot.depositAmount.amount,
            snapshot.depositAmount.currency,
          ),
        )
      }
      if (snapshot.processingFee) {
        pushIf(
          rows,
          REVIEW_ROW_LABELS.processingFee,
          formatReviewRowMoneyDisplay(
            REVIEW_ROW_LABELS.processingFee,
            snapshot.processingFee.amount,
            snapshot.processingFee.currency,
          ),
        )
      }
      if (snapshot.amountPaid) {
        pushIf(
          rows,
          REVIEW_ROW_LABELS.amountPaid,
          formatReviewRowMoneyDisplay(
            REVIEW_ROW_LABELS.amountPaid,
            snapshot.amountPaid.amount,
            snapshot.amountPaid.currency,
          ),
        )
      }
      pushIf(
        rows,
        REVIEW_ROW_LABELS.amountCredited,
        formatReviewRowMoneyDisplay(
          REVIEW_ROW_LABELS.amountCredited,
          snapshot.amountCredited.amount,
          snapshot.amountCredited.currency,
        ),
      )
      pushCreditDestination(rows, snapshot.creditDestination)
      pushIf(rows, REVIEW_ROW_LABELS.scheme, snapshot.scheme)
      if (includeWhen) pushIf(rows, REVIEW_ROW_LABELS.when, formatWhen(snapshot.whenAt))
      break
    }
    case "noah_va_funding": {
      if (includeWhen) pushIf(rows, REVIEW_ROW_LABELS.when, formatWhen(snapshot.whenAt))
      pushIf(rows, REVIEW_ROW_LABELS.scheme, snapshot.scheme)
      pushIf(rows, REVIEW_ROW_LABELS.sender, snapshot.sender)
      if (snapshot.processingFee) {
        pushIf(
          rows,
          REVIEW_ROW_LABELS.processingFee,
          formatReviewRowMoneyDisplay(
            REVIEW_ROW_LABELS.processingFee,
            snapshot.processingFee.amount,
            snapshot.processingFee.currency,
          ),
        )
      }
      pushIf(
        rows,
        REVIEW_ROW_LABELS.amountCredited,
        formatReviewRowMoneyDisplay(
          REVIEW_ROW_LABELS.amountCredited,
          snapshot.amountCredited.amount,
          snapshot.amountCredited.currency,
        ),
      )
      pushCreditDestination(rows, snapshot.creditDestination)
      if (surface !== "receipt") pushIf(rows, REVIEW_ROW_LABELS.narration, snapshot.narration)
      break
    }
    case "noah_verification": {
      if (includeWhen) pushIf(rows, REVIEW_ROW_LABELS.when, formatWhen(snapshot.whenAt))
      pushIf(rows, REVIEW_ROW_LABELS.scheme, snapshot.scheme)
      pushIf(rows, REVIEW_ROW_LABELS.sender, snapshot.sender)
      pushIf(
        rows,
        REVIEW_ROW_LABELS.amountCredited,
        formatReviewRowMoneyDisplay(
          REVIEW_ROW_LABELS.amountCredited,
          snapshot.amountCredited.amount,
          snapshot.amountCredited.currency,
        ),
      )
      pushCreditDestination(rows, snapshot.creditDestination)
      if (includeVerificationHint && snapshot.creditDestination?.hint) {
        rows.push({
          label: "",
          value: snapshot.creditDestination.hint,
          isVerificationHint: true,
        })
      }
      break
    }
    case "stablecoin": {
      if (includeWhen) pushIf(rows, REVIEW_ROW_LABELS.when, formatWhen(snapshot.whenAt))
      pushIf(rows, REVIEW_ROW_LABELS.scheme, snapshot.scheme)
      pushIf(rows, REVIEW_ROW_LABELS.sender, snapshot.sender)
      if (snapshot.processingFee) {
        pushIf(
          rows,
          REVIEW_ROW_LABELS.processingFee,
          formatReviewRowMoneyDisplay(
            REVIEW_ROW_LABELS.processingFee,
            snapshot.processingFee.amount,
            snapshot.processingFee.currency,
          ),
        )
      }
      pushCreditDestination(rows, snapshot.creditDestination)
      pushIf(rows, REVIEW_ROW_LABELS.note, snapshot.note)
      break
    }
    case "easetag_receive": {
      pushIf(rows, REVIEW_ROW_LABELS.scheme, snapshot.scheme ?? "Easetag")
      pushCreditDestination(rows, snapshot.creditDestination)
      if (includeWhen) pushIf(rows, REVIEW_ROW_LABELS.when, formatWhen(snapshot.whenAt))
      pushIf(rows, REVIEW_ROW_LABELS.note, snapshot.note)
      break
    }
  }

  return rows
}

export type InboundReceiveNotification = {
  activityLabel: string
  successTitle: string
  successBody: string
  failedTitle: string
  failedBody: string
}

export function resolveInboundReceiveNotification(
  snapshot: InboundReceiveDetailSnapshot,
  outcome: "success" | "failed" = "success",
): InboundReceiveNotification {
  const creditedText = formatMoneyDisplay(
    snapshot.amountCredited.amount,
    snapshot.amountCredited.currency,
  )
  const balanceLabel = snapshot.creditDestination?.balanceLabel ?? `${snapshot.amountCredited.currency} Balance`

  let activityLabel = snapshot.notificationActivityLabel ?? snapshot.displayTitle
  let successTitle = `${activityLabel} complete`
  let successBody = `${creditedText} credited to your ${balanceLabel}`

  switch (snapshot.kind) {
    case "yc_fund_balance": {
      successBody = `${creditedText} credited to your USD balance`
      break
    }
    case "noah_va_funding": {
      successTitle = `${activityLabel} complete`
      successBody = BANK_DEPOSIT_COMPLETED_DESCRIPTION
      break
    }
    case "noah_verification": {
      successTitle = "Bank verification deposit complete"
      successBody = BANK_VERIFICATION_COMPLETED_DESCRIPTION
      break
    }
    case "stablecoin": {
      activityLabel = "Stablecoin deposit"
      successTitle = "Stablecoin deposit complete"
      successBody = `${creditedText} credited to your ${balanceLabel}`
      break
    }
    case "easetag_receive": {
      activityLabel = snapshot.displayTitle.startsWith("Received from")
        ? "Easetag received"
        : snapshot.displayTitle
      successTitle = snapshot.displayTitle.startsWith("Received from")
        ? snapshot.displayTitle
        : "Easetag received"
      const handle = snapshot.displayTitle.match(/@(\w+)/)?.[1]
      successBody = handle
        ? `Received ${creditedText} from @${handle}`
        : `Received ${creditedText}`
      break
    }
  }

  const failedTitle = `${activityLabel} failed`
  const failedBody = `Your ${activityLabel.toLowerCase()} could not be completed.`

  if (outcome === "failed") {
    return { activityLabel, successTitle: failedTitle, successBody: failedBody, failedTitle, failedBody }
  }
  return { activityLabel, successTitle, successBody, failedTitle, failedBody }
}

/** Flat email rows from snapshot (no When / verification hint). */
export function buildInboundReceiveEmailDetailRows(
  snapshot: InboundReceiveDetailSnapshot,
): { label: string; value: string }[] {
  return buildInboundReceiveDetailRows(snapshot, { surface: "email" })
    .filter((row) => !row.isVerificationHint && row.label)
    .map(({ label, value }) => ({ label, value }))
}
