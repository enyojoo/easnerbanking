/**
 * Unified inbound receive detail – YC fund_balance, Noah VA, verification, stablecoin, Easetag.
 * One snapshot + row builder for detail, email, receipt, and notifications.
 */

import { formatMoneyDisplay } from "../format-money-display"
import { formatReviewRowMoneyDisplay } from "../format-review-row-money"
import { formatSendRateLabel } from "../format-exchange-rate"
import { formatTransactionWhen } from "../format-transaction-when"
import { computeDisplayProcessingFee } from "../payout-processing-fee"
import { REVIEW_ROW_LABELS } from "../review-row-labels"
import { isPayoutReviewFeeVisible, pickVisibleProcessingFee } from "../payout-review-display"
import { formatMaskedSenderDisplay } from "../payout-recipient-subtitle"
import { isBankOnrampDepositFlow } from "./bank-deposit-lifecycle"
import { deriveBankDepositSchemeLabel } from "./bank-deposit-scheme"
import type { YcFundBalanceDepositReviewSnapshot } from "./global-deposit-types"
import {
  isVaFundingDeposit,
  isYcFundBalanceDepositMetadata,
  normalizeYcFundBalanceDepositReview,
  reconstructYcFundBalanceDepositReview,
  resolveYcFundBalanceLocalPayInBreakdown,
  resolveVaFundingDepositTitleFromMeta,
  resolveVaFundingNotificationActivityLabel,
  resolveYcFundBalanceDepositDisplayTitle,
  resolveYcFundBalanceNotificationActivityLabelFromMetadata,
} from "./yc-deposit-display"
import { deriveEasnerInboundRemitterDisplayName } from "./product-label"
import { formatStablecoinDepositSchemeLabel } from "./stablecoin-deposit-scheme"
import { isRelayTronDepositInbound } from "./relay-tron-deposit"
import {
  deriveVerificationBankName,
  isVerificationDepositMetadata,
} from "./verification-deposit"
import { isStripeCollectionSettlementMetadata } from "./stripe-invoice-settlement-lifecycle"

export type InboundReceiveKind =
  | "yc_fund_balance"
  | "va_funding"
  | "bank_verification"
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
  /** Full wallet address when `sender` is a truncated on-chain address (for copy). */
  senderCopyValue?: string
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
  /** Verification explainer – detail surface only. */
  isVerificationHint?: boolean
  /** Full value to copy (e.g. wallet address); display `value` may be truncated. */
  copyValue?: string
}

export type InboundReceiveRowSurface = "detail" | "email" | "receipt"

export type InboundReceiveResolveInput = {
  provider?: string | null
  direction?: string | null
  metadata?: Record<string, unknown> | null
  payload?: Record<string, unknown> | null
  source_type?: string | null
  chain?: string | null
  asset?: string | null
  counterparty_address?: string | null
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
  settled_at?: string | null
  created_at?: string | null
  ledger_created_at?: string | null
  easner_transaction_id?: string | null
  send_note?: string | null
  display_description?: string | null
}

const VERIFICATION_CREDIT_HINT =
  "Verification only – not added to your spendable balance."

const CHAIN_ABBREVIATIONS: Record<string, string> = {
  solana: "SOL",
  ethereum: "ETH",
  polygon: "MATIC",
  polygonpos: "MATIC",
  base: "BASE",
  arbitrum: "ARB",
  tron: "TRX",
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
  return formatStablecoinDepositSchemeLabel({
    sourceCurrency: String(
      meta.source_currency ??
        input.asset ??
        input.posted_currency ??
        input.settled_currency ??
        input.currency ??
        "",
    ),
    paymentRail: String(
      input.source_payment_rail ?? meta.source_payment_rail ?? meta.payment_rail ?? input.chain ?? "solana",
    ),
    chain: input.chain != null ? String(input.chain) : meta.chain != null ? String(meta.chain) : undefined,
    asset: input.asset != null ? String(input.asset) : meta.asset != null ? String(meta.asset) : undefined,
  })
}

function isStablecoinInbound(input: InboundReceiveResolveInput): boolean {
  const meta = input.metadata ?? {}
  if (String(meta.flow ?? "").toLowerCase() === "bank_onramp") return false
  if (isRelayTronDepositInbound(input)) return true
  const sourceType = String(meta.source_type ?? input.source_type ?? "").toLowerCase()
  if (sourceType === "liquidation_address") return true
  const provider = String(input.provider ?? "").toLowerCase()
  if (provider === "turnkey" && (input.chain || meta.chain || input.source_payment_rail)) return true
  return false
}

function resolveStablecoinProcessingFee(
  input: InboundReceiveResolveInput,
  creditedAmount: number,
): number {
  const meta = input.metadata ?? {}
  const explicit = pickAmount(input.fee_amount, meta.fee_amount, meta.fee)
  if (explicit != null) return explicit
  const gross = pickAmount(meta.gross_usdt)
  if (gross != null && creditedAmount > 0 && gross > creditedAmount) {
    return Math.round((gross - creditedAmount) * 100) / 100
  }
  return 0
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

/** Priority: easetag → verification → yc_fund_balance → stablecoin → va_funding */
export function classifyInboundReceiveKind(
  input: InboundReceiveResolveInput,
): InboundReceiveKind | null {
  const dir = String(input.direction ?? "").toLowerCase()
  if (dir !== "in" && dir !== "credit") return null

  const meta = input.metadata ?? {}

  if (isEasetagInbound(input)) return "easetag_receive"
  if (isVerificationDepositMetadata(meta)) return "bank_verification"
  if (input.deposit_review || isYcFundBalanceDepositMetadata(meta)) return "yc_fund_balance"
  if (isStripeCollectionSettlementMetadata(meta)) return null
  if (isStablecoinInbound(input)) return "stablecoin"
  if (
    isVaFundingDeposit({ provider: input.provider, direction: "in", metadata: meta }) ||
    isBankOnrampDepositFlow(meta)
  ) {
    return "va_funding"
  }
  return null
}

export function resolveCreditDestination(
  currency: string,
  kind: InboundReceiveKind,
): InboundReceiveCreditDestination {
  const c = String(currency ?? "USD").trim().toUpperCase() || "USD"
  const balanceLabel = `${c} Balance`
  if (kind === "bank_verification") {
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
    case "va_funding":
      return resolveVaFundingDepositTitleFromMeta(meta)
    case "bank_verification":
      return "Bank verification deposit"
    case "stablecoin":
      return "Stablecoin deposit"
    case "easetag_receive": {
      const handle = readEasetagHandle(meta)
      return handle ? `Received from @${handle}` : "Easetag deposit"
    }
    default:
      return "Deposit"
  }
}

function resolveSenderWalletAddress(input: InboundReceiveResolveInput): string {
  const meta = input.metadata ?? {}
  return (
    readMetaString(meta, "counterparty_address") ||
    readMetaString(meta, "from_address") ||
    readMetaString(meta, "sender_tron_address") ||
    (input.counterparty_address ? String(input.counterparty_address).trim() : "")
  )
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
    counterpartyAddress: resolveSenderWalletAddress(input),
  })
  return masked || undefined
}

/** Display sender + optional full wallet address for copy (when sender is on-chain). */
function resolveSenderFields(input: InboundReceiveResolveInput): {
  sender?: string
  senderCopyValue?: string
} {
  const wallet = resolveSenderWalletAddress(input)
  const display = resolveSender(input)
  if (!display) return {}
  if (wallet) {
    const masked = formatMaskedSenderDisplay({ counterpartyAddress: wallet })
    if (display === masked || display === wallet) {
      return { sender: masked || display, senderCopyValue: wallet }
    }
  }
  return { sender: display }
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
  const whenAt = pickIso(
    input.ledger_created_at,
    input.occurred_at,
    input.settled_at,
    input.created_at,
    meta.on_chain_settled_at,
    meta.completed_at,
    meta.processing_at,
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
      pickVisibleProcessingFee(feeLocalRaw, breakdown.feeLocal) ?? breakdown.feeLocal
    const useLocalFee = isPayoutReviewFeeVisible(feeLocal)
    const feeAmount = useLocalFee ? feeLocal : displayProcessingFeeUsd
    const feeCurrency = useLocalFee ? review.local_currency : "USD"

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

  if (kind === "bank_verification") {
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

  if (kind === "va_funding") {
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
    const fiatDepositAmount = pickAmount(meta.fiat_deposit_amount)
    const fiatDepositCurrency = String(
      meta.fiat_deposit_currency ?? creditedCurrency,
    ).toUpperCase()
    return {
      kind,
      displayTitle: resolveDisplayTitle(kind, input),
      notificationActivityLabel: resolveVaFundingNotificationActivityLabel(creditedCurrency),
      transactionId,
      whenAt,
      amountCredited: { amount: creditedAmount, currency: creditedCurrency },
      creditDestination: resolveCreditDestination(creditedCurrency, kind),
      scheme: deriveBankDepositSchemeLabel({ metadata: meta, payload: input.payload ?? null }),
      ...resolveSenderFields(input),
      ...(fiatDepositAmount != null
        ? { depositAmount: { amount: fiatDepositAmount, currency: fiatDepositCurrency } }
        : {}),
      ...(Number.isFinite(feeAmount)
        ? { processingFee: { amount: feeAmount, currency: feeCurrency } }
        : {}),
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
    const feeAmount = resolveStablecoinProcessingFee(input, creditedAmount)
    const feeCurrency = isRelayTronDepositInbound(input)
      ? "USD"
      : String(input.currency ?? creditedCurrency).toUpperCase()
    const grossUsd = pickAmount(meta.gross_usdt)
    const depositAmount =
      grossUsd != null ? { amount: grossUsd, currency: "USD" as const } : undefined
    return {
      kind,
      displayTitle: resolveDisplayTitle(kind, input),
      notificationActivityLabel: "Stablecoin deposit",
      transactionId,
      whenAt,
      amountCredited: { amount: creditedAmount, currency: creditedCurrency },
      creditDestination: resolveCreditDestination(creditedCurrency, kind),
      scheme: deriveStablecoinSchemeLabel(input),
      ...resolveSenderFields(input),
      ...(depositAmount ? { depositAmount } : {}),
      ...(Number.isFinite(feeAmount)
        ? { processingFee: { amount: feeAmount, currency: feeCurrency } }
        : {}),
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

function pushSenderRow(rows: InboundReceiveDetailRow[], snapshot: InboundReceiveDetailSnapshot): void {
  const sender = String(snapshot.sender ?? "").trim()
  if (!sender) return
  const copyValue = String(snapshot.senderCopyValue ?? "").trim()
  rows.push({
    label: REVIEW_ROW_LABELS.sender,
    value: sender,
    ...(copyValue ? { copyValue } : {}),
  })
}

/** Amount credited is already in the hero for VA/crypto without a fee delta; local pay-in always shows it. */
function shouldShowAmountCreditedRow(snapshot: InboundReceiveDetailSnapshot): boolean {
  if (snapshot.kind === "yc_fund_balance") return true
  if (snapshot.kind === "bank_verification" || snapshot.kind === "easetag_receive") return false
  return Boolean(snapshot.processingFee && snapshot.processingFee.amount > 0)
}

function pushAmountCreditedIfNeeded(
  rows: InboundReceiveDetailRow[],
  snapshot: InboundReceiveDetailSnapshot,
): void {
  if (!shouldShowAmountCreditedRow(snapshot)) return
  pushIf(
    rows,
    REVIEW_ROW_LABELS.amountCredited,
    formatReviewRowMoneyDisplay(
      REVIEW_ROW_LABELS.amountCredited,
      snapshot.amountCredited.amount,
      snapshot.amountCredited.currency,
    ),
  )
}

function pushCreditDestination(
  rows: InboundReceiveDetailRow[],
  dest: InboundReceiveCreditDestination | undefined,
): void {
  if (!dest) return
  const label = dest.label === "credit_for" ? REVIEW_ROW_LABELS.creditFor : REVIEW_ROW_LABELS.creditTo
  rows.push({ label, value: dest.balanceLabel, creditCurrency: dest.currency })
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
      pushAmountCreditedIfNeeded(rows, snapshot)
      pushCreditDestination(rows, snapshot.creditDestination)
      break
    }
    case "va_funding": {
      // In-app hero / list already show sender_name; keep Sender on email only.
      if (surface === "email") pushSenderRow(rows, snapshot)
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
      pushAmountCreditedIfNeeded(rows, snapshot)
      pushCreditDestination(rows, snapshot.creditDestination)
      if (surface !== "receipt") pushIf(rows, REVIEW_ROW_LABELS.narration, snapshot.narration)
      break
    }
    case "bank_verification": {
      pushSenderRow(rows, snapshot)
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
      pushSenderRow(rows, snapshot)
      if (
        surface !== "detail" &&
        snapshot.depositAmount &&
        snapshot.processingFee &&
        snapshot.processingFee.amount > 0
      ) {
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
      pushAmountCreditedIfNeeded(rows, snapshot)
      pushCreditDestination(rows, snapshot.creditDestination)
      pushIf(rows, REVIEW_ROW_LABELS.note, snapshot.note)
      break
    }
    case "easetag_receive": {
      pushCreditDestination(rows, snapshot.creditDestination)
      pushIf(rows, REVIEW_ROW_LABELS.note, snapshot.note)
      break
    }
  }

  // Deposit method sits with Transfer method on payouts – last content row before When.
  pushIf(rows, REVIEW_ROW_LABELS.depositMethod, snapshot.scheme)

  // Keep the timestamp as the final transaction-detail row for every deposit type.
  if (includeWhen) {
    const formatted = snapshot.whenAt ? formatTransactionWhen(snapshot.whenAt) : ""
    rows.push({ label: REVIEW_ROW_LABELS.when, value: formatted || "–" })
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

/** Feed/gross amount for deposit push copy (local pay-in, VA fiat sent, relay gross, etc.). */
export function resolveInboundDepositReceivedAmount(snapshot: InboundReceiveDetailSnapshot): {
  amount: number
  currency: string
} {
  if (snapshot.kind === "easetag_receive") return snapshot.amountCredited
  if (snapshot.kind === "yc_fund_balance" && snapshot.amountPaid) return snapshot.amountPaid
  if (snapshot.depositAmount) return snapshot.depositAmount
  if (snapshot.amountPaid) return snapshot.amountPaid
  return snapshot.amountCredited
}

export function resolveInboundDepositNotificationAmountDisplay(
  snapshot: InboundReceiveDetailSnapshot,
): string {
  const { amount, currency } = resolveInboundDepositReceivedAmount(snapshot)
  return formatMoneyDisplay(amount, currency)
}

/** Unified deposit push/email intro – mirrors outbound "You've sent $X to …". */
export function formatInboundDepositReceivedNotificationBody(
  snapshot: InboundReceiveDetailSnapshot,
): string {
  const { amount, currency } = resolveInboundDepositReceivedAmount(snapshot)
  const receivedText = formatMoneyDisplay(amount, currency)

  switch (snapshot.kind) {
    case "easetag_receive": {
      const handle = snapshot.displayTitle.match(/@(\w+)/)?.[1]
      return handle
        ? `You've received ${receivedText} from @${handle}`
        : `You've received ${receivedText}`
    }
    case "yc_fund_balance": {
      const scheme = String(snapshot.scheme ?? "").trim()
      return scheme
        ? `You've received ${receivedText} via ${scheme}`
        : `You've received ${receivedText}`
    }
    case "bank_verification": {
      const bank = String(snapshot.sender ?? "").trim()
      return bank
        ? `You've received ${receivedText} from ${bank}`
        : `You've received ${receivedText}`
    }
    case "va_funding":
    case "stablecoin": {
      const sender = String(snapshot.sender ?? "").trim()
      if (sender) return `You've received ${receivedText} from ${sender}`
      if (snapshot.kind === "stablecoin") {
        return `You've received ${receivedText} via address`
      }
      const scheme = String(snapshot.scheme ?? "").trim()
      return scheme
        ? `You've received ${receivedText} via ${scheme}`
        : `You've received ${receivedText}`
    }
    default:
      return `You've received ${receivedText}`
  }
}

export function resolveInboundReceiveNotification(
  snapshot: InboundReceiveDetailSnapshot,
  outcome: "success" | "failed" = "success",
): InboundReceiveNotification {
  let activityLabel = snapshot.notificationActivityLabel ?? snapshot.displayTitle
  let successTitle = `${activityLabel} complete`
  let successBody = formatInboundDepositReceivedNotificationBody(snapshot)

  switch (snapshot.kind) {
    case "bank_verification":
      successTitle = "Bank verification deposit complete"
      break
    case "stablecoin":
      activityLabel = "Stablecoin deposit"
      successTitle = "Stablecoin deposit complete"
      break
    case "easetag_receive":
      activityLabel = "Easetag deposit"
      break
    case "va_funding":
      successTitle = `${activityLabel} complete`
      break
    default:
      break
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
