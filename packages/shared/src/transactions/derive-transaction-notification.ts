import { formatDisplayPersonName } from "../format-display-name"
import { formatMoneyDisplay } from "../format-money-display"
import { truncateMiddle } from "../payout-recipient-subtitle"
import { isGlobalPayoutOffRampFlow } from "./global-payout-flow"
import { displayPayoutReceiveAmount, type GlobalPayoutReviewSnapshot } from "./global-payout-types"
import { rawPayoutReviewFromMetadata } from "./payout-review-from-metadata"
import {
  getGlobalPayoutProcessingTime,
  getGlobalPayoutTransferMethod,
  normalizeTransferMethodLabel,
  resolvePayoutNotificationActivityLabel,
} from "./payout-transfer-method"
import {
  isBankOnrampDepositFlow,
} from "./bank-deposit-lifecycle"
import {
  deriveEasnerInboundRemitterDisplayName,
  toEasnerTransactionProductCategory,
} from "./product-label"
import {
  isVaFundingDeposit,
  isYcFundBalanceDepositMetadata,
  normalizeYcFundBalanceDepositReview,
  resolveVaFundingNotificationActivityLabel,
  resolveVaFundingDepositTitleFromMeta,
  resolveYcFundBalanceNotificationActivityLabelFromMetadata,
} from "./yc-deposit-display"
import {
  balanceConvertListProductLabel,
  isBalanceConvertMetadata,
  normalizeBalanceMoveReviewSnapshot,
} from "./balance-move-types"
import {
  resolveInboundDepositNotificationAmountDisplay,
  resolveInboundReceiveDetail,
  resolveInboundReceiveNotification,
} from "./inbound-receive-detail"
import {
  deriveVerificationBankName,
  formatVerificationDepositPushBody,
  isVerificationDepositMetadata,
} from "./verification-deposit"
import {
  activityLabelForNotification,
  buildTransactionNotificationHeadlines,
} from "./transaction-notification-headlines"
import { sanitizeCustomerFacingFailureReason } from "./sanitize-customer-facing-failure-reason"

/** Appended to failed outbound push copy when debited funds are restored. */
export const FAILED_OUTBOUND_FUNDS_RETURNED_PUSH =
  "Any debited funds have been returned to your balance."

function withFailedOutboundBody(
  body: string,
  direction: LedgerNotificationDirection | null,
  outcome: NotificationOutcome,
): string {
  if (outcome !== "failed" || direction !== "out") return body
  const trimmed = body.trim()
  if (!trimmed) return FAILED_OUTBOUND_FUNDS_RETURNED_PUSH
  return `${trimmed.replace(/\.\s*$/, "")}. ${FAILED_OUTBOUND_FUNDS_RETURNED_PUSH}`
}

export type LedgerNotificationDirection = "in" | "out"

export type NotificationOutcome = "success" | "failed" | "reversed"

export type TransactionNotificationKind =
  | "payroll_payment"
  | "easetag_send"
  | "easetag_receive"
  | "card_topup"
  | "card_payment"
  | "stablecoin_deposit"
  | "stablecoin_transfer"
  | "bank_deposit"
  | "bank_verification_credit"
  | "bank_payout"
  | "bank_transfer"
  | "balance_convert"
  | "generic"

export type DeriveTransactionNotificationInput = {
  provider: string
  direction: LedgerNotificationDirection | null
  amount: number
  currency: string
  metadata?: Record<string, unknown> | null
  payload?: Record<string, unknown> | null
  outcome?: NotificationOutcome
  transactionId?: string
  easnerTransactionId?: string
  failureReason?: string
}

export type TransactionNotificationDescriptor = {
  kind: TransactionNotificationKind
  outcome: NotificationOutcome
  /** Email HTML H1 */
  title: string
  body: string
  pushTitle: string
  pushBody: string
  /** SendGrid subject (may differ from pushTitle on failed/reversed) */
  emailSubject: string
  amountDisplay: string
  counterpartyLabel?: string
  counterpartyName?: string
  category: string
  paymentRail?: string
  direction: LedgerNotificationDirection | null
  provider: string
  emailEnabled: boolean
  transactionId?: string
  easnerTransactionId?: string
  failureReason?: string
}

function firstNonEmptyString(values: readonly unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === "string") {
      const t = v.trim()
      if (t) return t
    }
  }
  return undefined
}

function normalizePayoutReviewSnapshot(raw: unknown): GlobalPayoutReviewSnapshot | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const receiveAmount = Number(o.receive_amount)
  const totalDebited = Number(o.total_debited)
  const youSend = Number(o.you_send_amount)
  if (!Number.isFinite(receiveAmount) || receiveAmount <= 0) return null
  if (!Number.isFinite(totalDebited) || totalDebited <= 0) return null
  const transferMethod = String(o.transfer_method || getGlobalPayoutTransferMethod({})).trim()
  return {
    you_send_amount: Number.isFinite(youSend) ? youSend : totalDebited,
    total_debited: totalDebited,
    exchange_fee: Number.isFinite(Number(o.exchange_fee)) ? Number(o.exchange_fee) : 0,
    processing_fee: Number.isFinite(Number(o.processing_fee)) ? Number(o.processing_fee) : 0,
    exchange_rate: Number.isFinite(Number(o.exchange_rate)) ? Number(o.exchange_rate) : 1,
    send_currency: String(o.send_currency || "USD").toUpperCase(),
    receive_amount: receiveAmount,
    ...(Number.isFinite(Number(o.requested_receive_amount)) && Number(o.requested_receive_amount) > 0
      ? { requested_receive_amount: Number(o.requested_receive_amount) }
      : {}),
    receive_currency: String(o.receive_currency || "USD").toUpperCase(),
    transfer_method: transferMethod,
    processing_time: String(
      o.processing_time || getGlobalPayoutProcessingTime(transferMethod),
    ).trim(),
  }
}

function deriveOutboundCounterpartyName(input: {
  metadata?: Record<string, unknown> | null
  payload?: Record<string, unknown> | null
}): string | undefined {
  const meta = input.metadata || {}
  const payload = input.payload || {}
  const raw = firstNonEmptyString([
    meta.recipient_name,
    meta.destination_name,
    meta.counterparty_name,
    meta.beneficiary_name,
    meta.merchant_name,
    payload.recipientName,
    payload.counterpartyName,
    payload.merchantName,
    payload.beneficiaryName,
  ])
  if (!raw) return undefined
  return formatDisplayPersonName(raw) || undefined
}

function parseEasetag(meta: Record<string, unknown> | null, direction: LedgerNotificationDirection | null) {
  const outbound =
    typeof meta?.destinationEasetag === "string" && meta.destinationEasetag.trim()
      ? meta.destinationEasetag.trim().replace(/^@+/, "")
      : typeof meta?.payee_easetag === "string" && meta.payee_easetag.trim()
        ? meta.payee_easetag.trim().replace(/^@+/, "")
        : null
  const inbound =
    typeof meta?.sourceEasetag === "string" && meta.sourceEasetag.trim()
      ? meta.sourceEasetag.trim().replace(/^@+/, "")
      : typeof meta?.sender_easetag === "string" && meta.sender_easetag.trim()
        ? meta.sender_easetag.trim().replace(/^@+/, "")
        : null
  return { outbound, inbound }
}

function buildWalletSendBody(input: {
  metadata?: Record<string, unknown> | null
  payload?: Record<string, unknown> | null
  amount: number
  currency: string
  amountText: string
}): string {
  const meta = input.metadata ?? null
  const payoutReview = normalizePayoutReviewSnapshot(rawPayoutReviewFromMetadata(meta))
  const receiveAmount =
    (payoutReview ? displayPayoutReceiveAmount(payoutReview) : undefined) ??
    (typeof meta?.receive_amount === "number" ? meta.receive_amount : input.amount)
  const receiveCurrency = String(
    payoutReview?.receive_currency ?? meta?.receive_currency ?? meta?.receive_asset ?? input.currency,
  ).toUpperCase()
  const walletAddress = firstNonEmptyString([
    meta?.counterparty_address,
    meta?.destination_address,
    (meta?.recipient_snapshot as Record<string, unknown> | undefined)?.account_number,
  ])
  const amountDisplay =
    receiveAmount != null && receiveCurrency
      ? formatMoneyDisplay(receiveAmount, receiveCurrency)
      : input.amountText
  const destinationLabel = walletAddress ? truncateMiddle(walletAddress, 6, 6) : ""
  // Second person — email body follows “Hey {name},”
  return destinationLabel
    ? `You've sent ${amountDisplay} to ${destinationLabel}`
    : `You've sent ${amountDisplay}`
}

type DescriptorDraft = Omit<
  TransactionNotificationDescriptor,
  "title" | "pushTitle" | "emailSubject" | "emailEnabled" | "pushBody"
> & { emailEnabled?: boolean; pushBody?: string }

function buildGlobalPayoutOutContext(input: {
  meta: Record<string, unknown> | null
  payload: Record<string, unknown> | null
  amountText: string
}): {
  transferMethod: string
  notificationActivityLabel: string
  recipientName?: string
  amountDisplay: string
  sentBody: string
} {
  const meta = input.meta
  const payoutReview = normalizePayoutReviewSnapshot(rawPayoutReviewFromMetadata(meta))
  const recipientSnapshot = meta?.recipient_snapshot as Record<string, unknown> | undefined
  const receiveAmount =
    (payoutReview ? displayPayoutReceiveAmount(payoutReview) : undefined) ??
    (typeof meta?.requested_receive_amount === "number"
      ? meta.requested_receive_amount
      : typeof meta?.receive_amount === "number"
        ? meta.receive_amount
        : null)
  const receiveCurrency = String(
    payoutReview?.receive_currency ?? meta?.receive_currency ?? meta?.fiat_currency ?? "",
  ).toUpperCase()
  const recipientRaw =
    (typeof (meta?.recipient_snapshot as Record<string, unknown> | undefined)?.full_name === "string"
      ? String((meta?.recipient_snapshot as Record<string, unknown>).full_name)
      : "") ||
    deriveOutboundCounterpartyName({ metadata: meta, payload: input.payload ?? null }) ||
    ""
  const recipientName = formatDisplayPersonName(recipientRaw) || recipientRaw || undefined
  const amountDisplay =
    receiveAmount != null && receiveCurrency
      ? formatMoneyDisplay(receiveAmount, receiveCurrency)
      : input.amountText
  const rawTransferMethod =
    payoutReview?.transfer_method ||
    (typeof meta?.transfer_method === "string" ? String(meta.transfer_method) : "Bank transfer")
  const transferMethod = normalizeTransferMethodLabel(rawTransferMethod)
  const notificationActivityLabel = resolvePayoutNotificationActivityLabel({
    transferMethod: rawTransferMethod,
    currency: receiveCurrency,
    countryCode: firstNonEmptyString([
      recipientSnapshot?.country_code,
      meta?.country_code,
      meta?.receive_country_code,
    ]),
    bankName: firstNonEmptyString([recipientSnapshot?.bank_name, meta?.bank_name]),
    mobileProvider: firstNonEmptyString([
      recipientSnapshot?.mobile_provider,
      meta?.mobile_provider,
    ]),
  })
  const sentBody = recipientName
    ? `You've sent ${amountDisplay} to ${recipientName}`
    : `You've sent ${amountDisplay}`
  return {
    transferMethod,
    notificationActivityLabel,
    recipientName,
    amountDisplay,
    sentBody,
  }
}

function finalizeDescriptor(
  draft: DescriptorDraft,
  activityLabel: string,
  headlineOptions?: { successUsesCompleteSuffix?: boolean },
): TransactionNotificationDescriptor {
  const headlines = buildTransactionNotificationHeadlines(
    activityLabel,
    draft.outcome,
    headlineOptions,
  )
  return {
    ...draft,
    ...headlines,
    pushBody: draft.body,
    emailEnabled: draft.emailEnabled ?? true,
  }
}

function inferFailedKind(input: {
  isCard: boolean
  direction: LedgerNotificationDirection | null
  outboundEasetag: string | null
  inboundEasetag: string | null
}): TransactionNotificationKind {
  if (input.isCard) {
    return input.direction === "in" ? "card_topup" : "card_payment"
  }
  if (input.outboundEasetag) return "easetag_send"
  if (input.inboundEasetag) return "easetag_receive"
  return "generic"
}

/**
 * Channel-agnostic transaction notification descriptor.
 * Push and email render from this object so copy stays in sync.
 */
export function deriveTransactionNotification(
  input: DeriveTransactionNotificationInput,
): TransactionNotificationDescriptor {
  const provider = String(input.provider || "").toLowerCase()
  const direction =
    input.direction === "in" || input.direction === "out" ? input.direction : null
  const amountText = formatMoneyDisplay(Math.abs(input.amount || 0), input.currency)
  const meta = input.metadata ?? null
  const outcome = input.outcome ?? "success"
  const failureReason = sanitizeCustomerFacingFailureReason(input.failureReason)
  const paymentRail = String(
    meta?.payment_rail ?? meta?.source_payment_rail ?? meta?.destination_payment_rail ?? "",
  )
    .trim()
    .toLowerCase()
  const isCard = paymentRail === "card"
  const { outbound: outboundEasetag, inbound: inboundEasetag } = parseEasetag(meta, direction)

  const base = {
    outcome,
    amountDisplay: amountText,
    direction,
    provider,
    paymentRail: paymentRail || undefined,
    transactionId: input.transactionId,
    easnerTransactionId: input.easnerTransactionId,
    failureReason,
  }

  if (
    String(meta?.product ?? "").trim().toLowerCase() === "payroll" &&
    direction === "in" &&
    outcome === "success"
  ) {
    const businessName = String(meta?.payroll_business_name ?? "").trim()
    const body = businessName
      ? `You received ${amountText} from ${businessName}.`
      : `You received a payroll payment of ${amountText}.`
    return {
      ...base,
      kind: "payroll_payment",
      title: "Payroll payment received",
      body,
      pushTitle: "Payroll payment received",
      pushBody: body,
      emailSubject: "Payroll payment received",
      category: "Payroll payment",
      counterpartyLabel: "Employer",
      counterpartyName: businessName || undefined,
      // Payroll sends its own settlement email with the authoritative PDF attached.
      emailEnabled: false,
    }
  }

  if (outcome === "failed") {
    if (isBalanceConvertMetadata(meta)) {
      const activityLabel = balanceConvertListProductLabel()
      const body = failureReason
        ? `Your move of ${amountText} could not be completed. ${failureReason}`
        : `Your move of ${amountText} could not be completed.`
      return finalizeDescriptor(
        {
          ...base,
          kind: "balance_convert",
          body,
          pushBody: body,
          category: activityLabel,
        },
        activityLabel,
      )
    }

    if (direction === "out" && isGlobalPayoutOffRampFlow(meta)) {
      const payout = buildGlobalPayoutOutContext({
        meta,
        payload: input.payload ?? null,
        amountText,
      })
      const body = withFailedOutboundBody(
        payout.recipientName
          ? failureReason
            ? `Could not send ${payout.amountDisplay} to ${payout.recipientName}. ${failureReason}`
            : `Could not send ${payout.amountDisplay} to ${payout.recipientName}.`
          : failureReason
            ? `Your ${payout.notificationActivityLabel.toLowerCase()} could not be completed. ${failureReason}`
            : `Your ${payout.notificationActivityLabel.toLowerCase()} could not be completed.`,
        direction,
        outcome,
      )
      return finalizeDescriptor(
        {
          ...base,
          kind: "bank_payout",
          body,
          amountDisplay: payout.amountDisplay,
          counterpartyLabel: "Recipient",
          counterpartyName: payout.recipientName,
          category: payout.transferMethod,
        },
        payout.notificationActivityLabel,
      )
    }

    if (direction === "in" && meta && isYcFundBalanceDepositMetadata(meta)) {
      const review = normalizeYcFundBalanceDepositReview(meta.deposit_review)
      const activityLabel = resolveYcFundBalanceNotificationActivityLabelFromMetadata(meta, review)
      const body = failureReason
        ? `Your ${activityLabel} could not be completed. ${failureReason}`
        : `Your ${activityLabel} could not be completed.`
      return finalizeDescriptor(
        {
          ...base,
          kind: "bank_deposit",
          body,
          pushBody: body,
          category: String(meta.deposit_display_title ?? activityLabel),
        },
        activityLabel,
      )
    }

    if (
      direction === "in" &&
      isVaFundingDeposit({
        provider: input.provider,
        direction: "in",
        metadata: meta,
      })
    ) {
      const currency = String(
        meta?.fiat_deposit_currency ?? meta?.settled_currency ?? input.currency ?? "USD",
      )
      const activityLabel = resolveVaFundingNotificationActivityLabel(currency)
      const body = failureReason
        ? `Your ${activityLabel} could not be completed. ${failureReason}`
        : `Your ${activityLabel} could not be completed.`
      return finalizeDescriptor(
        {
          ...base,
          kind: "bank_deposit",
          body,
          pushBody: body,
          category: resolveVaFundingDepositTitleFromMeta(meta ?? {}),
        },
        activityLabel,
      )
    }

    const category = toEasnerTransactionProductCategory({
      provider,
      direction: direction ?? "out",
      metadata: meta,
      payload: input.payload ?? null,
    })
    const kind = inferFailedKind({ isCard, direction, outboundEasetag, inboundEasetag })
    const body = withFailedOutboundBody(
      failureReason
        ? `Your ${category.toLowerCase()} could not be completed. ${failureReason}`
        : `Your ${category.toLowerCase()} could not be completed.`,
      direction,
      outcome,
    )
    return finalizeDescriptor(
      {
        ...base,
        kind,
        body,
        counterpartyLabel: direction === "in" ? "Sender" : "Recipient",
        counterpartyName: deriveOutboundCounterpartyName({ metadata: meta, payload: input.payload }),
        category,
      },
      activityLabelForNotification(kind, category),
    )
  }

  if (outcome === "reversed") {
    const kind =
      outboundEasetag || inboundEasetag
        ? outboundEasetag
          ? "easetag_send"
          : "easetag_receive"
        : "generic"
    const body = "A recent transaction was reversed and your balance has been updated."
    return finalizeDescriptor(
      {
        ...base,
        kind,
        body,
        category: "Reversal",
      },
      activityLabelForNotification(kind, "Reversal"),
    )
  }

  if (direction === "out" && outboundEasetag) {
    const body = `You've sent ${amountText} to @${outboundEasetag}`
    return finalizeDescriptor(
      {
        ...base,
        kind: "easetag_send",
        body,
        pushBody: body,
        counterpartyLabel: "Recipient",
        counterpartyName: `@${outboundEasetag}`,
        category: "Easetag Send",
      },
      activityLabelForNotification("easetag_send", "Easetag Send"),
    )
  }
  if (direction === "in" && inboundEasetag) {
    const body = `You've received ${amountText} from @${inboundEasetag}`
    return finalizeDescriptor(
      {
        ...base,
        kind: "easetag_receive",
        body,
        pushBody: body,
        counterpartyLabel: "Sender",
        counterpartyName: `@${inboundEasetag}`,
        category: "Easetag Received",
      },
      activityLabelForNotification("easetag_receive", "Easetag Received"),
    )
  }

  if (isCard) {
    if (direction === "in") {
      const body = `You've added ${amountText} from your card`
      return finalizeDescriptor(
        {
          ...base,
          kind: "card_topup",
          body,
          pushBody: body,
          category: "Card top up",
        },
        activityLabelForNotification("card_topup", "Card top up"),
      )
    }
    const merchant = deriveOutboundCounterpartyName({ metadata: meta, payload: input.payload ?? null })
    const body = merchant
      ? `You've paid ${amountText} to ${merchant}`
      : `You've paid ${amountText}`
    return finalizeDescriptor(
      {
        ...base,
        kind: "card_payment",
        body,
        pushBody: body,
        counterpartyLabel: "Merchant",
        counterpartyName: merchant,
        category: "Card payment",
      },
      activityLabelForNotification("card_payment", "Card payment"),
    )
  }

  if (isBalanceConvertMetadata(meta) && direction === "out") {
    const moveReview = normalizeBalanceMoveReviewSnapshot(meta?.move_review)
    const activityLabel = balanceConvertListProductLabel()
    const body = moveReview
      ? `You moved ${formatMoneyDisplay(moveReview.source_amount, moveReview.source_currency)} from your ${moveReview.debited_from_label} to your ${moveReview.credited_to_label}.`
      : `You moved ${amountText} between your accounts.`
    return finalizeDescriptor(
      {
        ...base,
        kind: "balance_convert",
        body,
        pushBody: body,
        category: activityLabel,
      },
      activityLabel,
    )
  }

  const category = toEasnerTransactionProductCategory({
    provider,
    direction: direction ?? "out",
    metadata: meta,
    payload: input.payload ?? null,
  })

  if (category === "Stablecoin Deposit") {
    const metaRecord = meta ?? {}
    const inboundSnapshot = resolveInboundReceiveDetail({
      provider: input.provider,
      direction: input.direction,
      metadata: metaRecord,
      payload: input.payload ?? null,
      currency: input.currency,
      amount: input.amount,
      chain: metaRecord.chain != null ? String(metaRecord.chain) : undefined,
      source_type: metaRecord.source_type != null ? String(metaRecord.source_type) : undefined,
      source_payment_rail:
        metaRecord.source_payment_rail != null ? String(metaRecord.source_payment_rail) : undefined,
      posted_amount: Number(metaRecord.posted_amount ?? metaRecord.settled_amount ?? input.amount),
      posted_currency: String(
        metaRecord.posted_currency ?? metaRecord.settled_currency ?? input.currency ?? "USD",
      ),
      fee_amount: Number(metaRecord.fee_amount ?? metaRecord.fee ?? 0) || null,
      sender_display_name:
        metaRecord.sender_display_name != null ? String(metaRecord.sender_display_name) : undefined,
    })
    if (inboundSnapshot?.kind === "stablecoin") {
      const notification = resolveInboundReceiveNotification(inboundSnapshot)
      const amountDisplay = resolveInboundDepositNotificationAmountDisplay(inboundSnapshot)
      return finalizeDescriptor(
        {
          ...base,
          kind: "stablecoin_deposit",
          amountDisplay,
          body: notification.successBody,
          pushBody: notification.successBody,
          category: notification.activityLabel,
          ...(inboundSnapshot.sender
            ? { counterpartyLabel: "Sender", counterpartyName: inboundSnapshot.sender }
            : {}),
        },
        notification.activityLabel,
      )
    }
    const body = `You've received ${amountText} via address`
    return finalizeDescriptor(
      {
        ...base,
        kind: "stablecoin_deposit",
        body,
        pushBody: body,
        category,
      },
      activityLabelForNotification("stablecoin_deposit", category),
    )
  }

  if (category === "Stablecoin Transfer") {
    const body =
      String(meta?.activity_type ?? "").trim().toLowerCase() === "wallet_send"
        ? buildWalletSendBody({
            metadata: meta,
            payload: input.payload ?? null,
            amount: input.amount,
            currency: input.currency,
            amountText,
          })
        : `You've sent ${amountText} to wallet address`
    return finalizeDescriptor(
      {
        ...base,
        kind: "stablecoin_transfer",
        body,
        pushBody: body,
        counterpartyLabel: "Destination",
        category,
      },
      activityLabelForNotification("stablecoin_transfer", category),
    )
  }

  if (category === "Easetag Received") {
    const inboundSnapshot = resolveInboundReceiveDetail({
      provider: input.provider,
      direction: input.direction,
      metadata: meta ?? {},
      currency: input.currency,
      amount: input.amount,
    })
    if (inboundSnapshot?.kind === "easetag_receive") {
      const notification = resolveInboundReceiveNotification(inboundSnapshot)
      return finalizeDescriptor(
        {
          ...base,
          kind: "easetag_receive",
          amountDisplay: resolveInboundDepositNotificationAmountDisplay(inboundSnapshot),
          body: notification.successBody,
          pushBody: notification.successBody,
          category: notification.activityLabel,
          ...(inboundEasetag
            ? { counterpartyLabel: "Sender", counterpartyName: `@${inboundEasetag}` }
            : {}),
        },
        notification.activityLabel,
      )
    }
    const body = inboundEasetag
      ? `You've received ${amountText} from @${inboundEasetag}`
      : `You've received ${amountText}`
    return finalizeDescriptor(
      {
        ...base,
        kind: "easetag_receive",
        body,
        pushBody: body,
        category,
      },
      activityLabelForNotification("easetag_receive", category),
    )
  }
  if (category === "Easetag Send") {
    const body = outboundEasetag
      ? `You've sent ${amountText} to @${outboundEasetag}`
      : `You've sent ${amountText}`
    return finalizeDescriptor(
      {
        ...base,
        kind: "easetag_send",
        body,
        pushBody: body,
        category,
      },
      activityLabelForNotification("easetag_send", category),
    )
  }

  if (direction === "out" && String(meta?.activity_type ?? "").trim().toLowerCase() === "wallet_send") {
    const body = buildWalletSendBody({
      metadata: meta,
      payload: input.payload ?? null,
      amount: input.amount,
      currency: input.currency,
      amountText,
    })
    return finalizeDescriptor(
      {
        ...base,
        kind: "stablecoin_transfer",
        body,
        pushBody: body,
        category: "Stablecoin Transfer",
      },
      activityLabelForNotification("stablecoin_transfer", "Stablecoin Transfer"),
    )
  }

  if (direction === "out" && isGlobalPayoutOffRampFlow(meta)) {
    const payout = buildGlobalPayoutOutContext({
      meta,
      payload: input.payload ?? null,
      amountText,
    })
    return finalizeDescriptor(
      {
        ...base,
        kind: "bank_payout",
        body: payout.sentBody,
        pushBody: payout.sentBody,
        amountDisplay: payout.amountDisplay,
        counterpartyLabel: "Recipient",
        counterpartyName: payout.recipientName,
        category: payout.transferMethod,
      },
      payout.notificationActivityLabel,
    )
  }

  if (direction === "in") {
    const metaRecord = meta ?? {}
    const inboundSnapshot = resolveInboundReceiveDetail({
      provider: input.provider,
      direction: input.direction,
      metadata: metaRecord,
      payload: input.payload ?? null,
      currency: input.currency,
      amount: input.amount,
      deposit_review: normalizeYcFundBalanceDepositReview(metaRecord.deposit_review),
      chain: metaRecord.chain != null ? String(metaRecord.chain) : undefined,
      source_type: metaRecord.source_type != null ? String(metaRecord.source_type) : undefined,
      source_payment_rail:
        metaRecord.source_payment_rail != null ? String(metaRecord.source_payment_rail) : undefined,
      reference: metaRecord.reference != null ? String(metaRecord.reference) : undefined,
      fee_amount: Number(metaRecord.fee_amount ?? metaRecord.fee ?? 0) || null,
      posted_amount: Number(metaRecord.posted_amount ?? metaRecord.settled_amount ?? 0) || null,
      posted_currency: String(
        metaRecord.posted_currency ?? metaRecord.settled_currency ?? input.currency ?? "USD",
      ),
      settled_amount: Number(metaRecord.settled_amount ?? 0) || null,
      settled_currency:
        metaRecord.settled_currency != null ? String(metaRecord.settled_currency) : undefined,
      sender_display_name:
        metaRecord.sender_display_name != null ? String(metaRecord.sender_display_name) : undefined,
      send_note: metaRecord.send_note != null ? String(metaRecord.send_note) : undefined,
    })
    if (inboundSnapshot && inboundSnapshot.kind !== "easetag_receive" && inboundSnapshot.kind !== "stablecoin") {
      const notification = resolveInboundReceiveNotification(inboundSnapshot)
      const kind =
        inboundSnapshot.kind === "bank_verification" ? "bank_verification_credit" : "bank_deposit"
      return finalizeDescriptor(
        {
          ...base,
          kind,
          amountDisplay: resolveInboundDepositNotificationAmountDisplay(inboundSnapshot),
          body: notification.successBody,
          pushBody: notification.successBody,
          category: notification.activityLabel,
          ...(inboundSnapshot.sender
            ? { counterpartyLabel: "Sender", counterpartyName: inboundSnapshot.sender }
            : {}),
        },
        notification.activityLabel,
        inboundSnapshot.kind === "bank_verification" ? { successUsesCompleteSuffix: false } : undefined,
      )
    }

    if (isVerificationDepositMetadata(meta)) {
      const bank = deriveVerificationBankName({ metadata: meta, payload: input.payload ?? null })
      const body = formatVerificationDepositPushBody({
        amount: input.amount,
        currency: input.currency,
        bankName: bank,
      })
      return finalizeDescriptor(
        {
          ...base,
          kind: "bank_verification_credit",
          body,
          pushBody: body,
          category: "Bank verification",
        },
      activityLabelForNotification("bank_verification_credit", "Bank verification"),
      { successUsesCompleteSuffix: false },
    )
    }
    if (
      meta &&
      (isYcFundBalanceDepositMetadata(meta) || normalizeYcFundBalanceDepositReview(meta.deposit_review))
    ) {
      const review = normalizeYcFundBalanceDepositReview(meta.deposit_review)
      const activityLabel = resolveYcFundBalanceNotificationActivityLabelFromMetadata(meta, review)
      const localAmount = review?.local_pay_in ?? Number(meta.local_pay_in ?? 0)
      const localCurrency = String(review?.local_currency ?? meta.local_currency ?? input.currency ?? "USD")
      const scheme = String(review?.transfer_method ?? meta.deposit_display_title ?? activityLabel)
      const pushBody =
        review && Number.isFinite(localAmount) && localAmount > 0
          ? `You've received ${formatMoneyDisplay(localAmount, localCurrency)} via ${scheme}`
          : `You've received ${amountText}`
      return finalizeDescriptor(
        {
          ...base,
          kind: "bank_deposit",
          amountDisplay:
            review && Number.isFinite(localAmount) && localAmount > 0
              ? formatMoneyDisplay(localAmount, localCurrency)
              : amountText,
          body: pushBody,
          pushBody,
          category: String(meta.deposit_display_title ?? activityLabel),
        },
        activityLabel,
      )
    }
    if (
      meta &&
      isVaFundingDeposit({
        provider: input.provider,
        direction: "in",
        metadata: meta,
      })
    ) {
      const currency = String(
        meta.fiat_deposit_currency ?? meta.settled_currency ?? input.currency ?? "USD",
      )
      const activityLabel = resolveVaFundingNotificationActivityLabel(currency)
      const fiatAmount = Number(meta.fiat_deposit_amount ?? input.amount ?? 0)
      const sender = deriveEasnerInboundRemitterDisplayName({
        metadata: meta,
        payload: input.payload ?? null,
      })
      const pushBody =
        Number.isFinite(fiatAmount) && fiatAmount > 0
          ? sender
            ? `You've received ${formatMoneyDisplay(fiatAmount, currency)} from ${sender}`
            : `You've received ${formatMoneyDisplay(fiatAmount, currency)}`
          : `You've received ${amountText}`
      return finalizeDescriptor(
        {
          ...base,
          kind: "bank_deposit",
          amountDisplay:
            Number.isFinite(fiatAmount) && fiatAmount > 0
              ? formatMoneyDisplay(fiatAmount, currency)
              : amountText,
          body: pushBody,
          pushBody,
          category: resolveVaFundingDepositTitleFromMeta(meta),
          ...(sender ? { counterpartyLabel: "Sender", counterpartyName: sender } : {}),
        },
        activityLabel,
      )
    }
    if (isBankOnrampDepositFlow(meta)) {
      const pushBody = `You've received ${amountText}`
      return finalizeDescriptor(
        {
          ...base,
          kind: "bank_deposit",
          body: pushBody,
          pushBody,
          category: "Bank Deposit",
        },
        activityLabelForNotification("bank_deposit", "Bank Deposit"),
      )
    }
    const from = deriveEasnerInboundRemitterDisplayName({
      metadata: meta,
      payload: input.payload ?? null,
    })
    const body = from
      ? `You've received ${amountText} from ${from}`
      : `You've received ${amountText}`
    return finalizeDescriptor(
      {
        ...base,
        kind: "bank_deposit",
        body,
        pushBody: body,
        counterpartyLabel: "Sender",
        counterpartyName: from || undefined,
        category: "Bank Deposit",
      },
      activityLabelForNotification("bank_deposit", "Bank Deposit"),
    )
  }

  const to = deriveOutboundCounterpartyName({ metadata: meta, payload: input.payload ?? null })
  const body = to ? `You've sent ${amountText} to ${to}` : `You've sent ${amountText}`
  return finalizeDescriptor(
    {
      ...base,
      kind: "bank_transfer",
      body,
      pushBody: body,
      counterpartyLabel: "Recipient",
      counterpartyName: to,
      category: "Bank Transfer",
    },
    activityLabelForNotification("bank_transfer", "Bank Transfer"),
  )
}

export function descriptorToPushContent(descriptor: TransactionNotificationDescriptor): {
  title: string
  body: string
} {
  return { title: descriptor.pushTitle, body: descriptor.pushBody }
}

export {
  activityLabelForNotification,
  buildTransactionNotificationHeadlines,
} from "./transaction-notification-headlines"
