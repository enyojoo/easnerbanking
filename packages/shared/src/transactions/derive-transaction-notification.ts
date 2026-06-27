import { formatDisplayPersonName } from "../format-display-name"
import { formatMoneyDisplay } from "../format-money-display"
import { truncateMiddle } from "../payout-recipient-subtitle"
import { isGlobalPayoutOffRampFlow } from "./global-payout-flow"
import type { GlobalPayoutReviewSnapshot } from "./global-payout-types"
import {
  getGlobalPayoutProcessingTime,
  getGlobalPayoutTransferMethod,
} from "./payout-transfer-method"
import {
  BANK_DEPOSIT_COMPLETED_DESCRIPTION,
  isBankOnrampDepositFlow,
} from "./bank-deposit-lifecycle"
import {
  deriveEasnerInboundRemitterDisplayName,
  toEasnerTransactionProductCategory,
} from "./product-label"
import {
  deriveVerificationBankName,
  formatVerificationDepositPushBody,
  isVerificationDepositMetadata,
} from "./verification-deposit"

export type LedgerNotificationDirection = "in" | "out"

export type NotificationOutcome = "success" | "failed" | "reversed"

export type TransactionNotificationKind =
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
  title: string
  body: string
  pushTitle: string
  pushBody: string
  amountDisplay: string
  counterpartyLabel?: string
  counterpartyName?: string
  category: string
  paymentRail?: string
  direction: LedgerNotificationDirection | null
  provider: string
  /** When false, email channel should skip (Easetag success, card) */
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

function buildWalletSendContent(input: {
  metadata?: Record<string, unknown> | null
  payload?: Record<string, unknown> | null
  amount: number
  currency: string
  amountText: string
}): { title: string; body: string } {
  const meta = input.metadata ?? null
  const payoutReview = normalizePayoutReviewSnapshot(meta?.payout_review)
  const receiveAmount =
    payoutReview?.receive_amount ??
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
  return {
    title: "Stablecoin Transfer",
    body: destinationLabel
      ? `Sent ${amountDisplay} to ${destinationLabel}`
      : `Sent ${amountDisplay}`,
  }
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
    failureReason: input.failureReason,
  }

  if (outcome === "failed") {
    const category = toEasnerTransactionProductCategory({
      provider,
      direction: direction ?? "out",
      metadata: meta,
      payload: input.payload ?? null,
    })
    const body = input.failureReason
      ? `Your ${category.toLowerCase()} could not be completed. ${input.failureReason}`
      : `Your ${category.toLowerCase()} could not be completed.`
    return {
      ...base,
      kind: "generic",
      title: `${category} — not completed`,
      body,
      pushTitle: category,
      pushBody: body,
      counterpartyLabel: direction === "in" ? "Sender" : "Recipient",
      counterpartyName: deriveOutboundCounterpartyName({ metadata: meta, payload: input.payload }),
      category,
      emailEnabled: !isCard && !(outboundEasetag || inboundEasetag),
    }
  }

  if (outcome === "reversed") {
    return {
      ...base,
      kind: outboundEasetag || inboundEasetag ? "easetag_send" : "generic",
      title: "Transaction reversed",
      body: "A recent transaction was reversed and your balance has been updated.",
      pushTitle: "Transaction reversed",
      pushBody: "Your balance has been updated after a reversal.",
      category: "Reversal",
      emailEnabled: Boolean(outboundEasetag || inboundEasetag),
    }
  }

  if (direction === "out" && outboundEasetag) {
    const body = `Sent ${amountText} to @${outboundEasetag}`
    return {
      ...base,
      kind: "easetag_send",
      title: "Easetag Transfer",
      body,
      pushTitle: "Easetag Transfer",
      pushBody: body,
      counterpartyLabel: "Recipient",
      counterpartyName: `@${outboundEasetag}`,
      category: "Easetag Send",
      emailEnabled: false,
    }
  }
  if (direction === "in" && inboundEasetag) {
    const body = `Received ${amountText} from @${inboundEasetag}`
    return {
      ...base,
      kind: "easetag_receive",
      title: "Easetag Deposit",
      body,
      pushTitle: "Easetag Deposit",
      pushBody: body,
      counterpartyLabel: "Sender",
      counterpartyName: `@${inboundEasetag}`,
      category: "Easetag Received",
      emailEnabled: false,
    }
  }

  if (isCard) {
    if (direction === "in") {
      const body = `Added ${amountText} from your card`
      return {
        ...base,
        kind: "card_topup",
        title: "Card top up complete",
        body,
        pushTitle: "Card top up complete",
        pushBody: body,
        category: "Card top up",
        emailEnabled: false,
      }
    }
    const merchant = deriveOutboundCounterpartyName({ metadata: meta, payload: input.payload ?? null })
    const body = merchant ? `Paid ${amountText} to ${merchant}` : `Paid ${amountText}`
    return {
      ...base,
      kind: "card_payment",
      title: "Card payment successful",
      body,
      pushTitle: "Card payment successful",
      pushBody: body,
      counterpartyLabel: "Merchant",
      counterpartyName: merchant,
      category: "Card payment",
      emailEnabled: false,
    }
  }

  const category = toEasnerTransactionProductCategory({
    provider,
    direction: direction ?? "out",
    metadata: meta,
    payload: input.payload ?? null,
  })

  if (category === "Stablecoin Deposit") {
    const body = `Received ${amountText} via address`
    return {
      ...base,
      kind: "stablecoin_deposit",
      title: "Stablecoin Deposit",
      body,
      pushTitle: "Stablecoin Deposit",
      pushBody: body,
      category,
      emailEnabled: true,
    }
  }

  if (category === "Stablecoin Transfer") {
    const walletSend =
      String(meta?.activity_type ?? "").trim().toLowerCase() === "wallet_send"
        ? buildWalletSendContent({
            metadata: meta,
            payload: input.payload ?? null,
            amount: input.amount,
            currency: input.currency,
            amountText,
          })
        : { title: "Stablecoin Transfer", body: `Sent ${amountText} to wallet address` }
    return {
      ...base,
      kind: "stablecoin_transfer",
      title: walletSend.title,
      body: walletSend.body,
      pushTitle: walletSend.title,
      pushBody: walletSend.body,
      counterpartyLabel: "Destination",
      category,
      emailEnabled: true,
    }
  }

  if (category === "Easetag Received") {
    const body = inboundEasetag
      ? `Received ${amountText} from @${inboundEasetag}`
      : `Received ${amountText}`
    return {
      ...base,
      kind: "easetag_receive",
      title: "Easetag Deposit",
      body,
      pushTitle: "Easetag Deposit",
      pushBody: body,
      category,
      emailEnabled: false,
    }
  }
  if (category === "Easetag Send") {
    const body = outboundEasetag ? `Sent ${amountText} to @${outboundEasetag}` : `Sent ${amountText}`
    return {
      ...base,
      kind: "easetag_send",
      title: "Easetag Transfer",
      body,
      pushTitle: "Easetag Transfer",
      pushBody: body,
      category,
      emailEnabled: false,
    }
  }

  if (direction === "out" && String(meta?.activity_type ?? "").trim().toLowerCase() === "wallet_send") {
    const walletSend = buildWalletSendContent({
      metadata: meta,
      payload: input.payload ?? null,
      amount: input.amount,
      currency: input.currency,
      amountText,
    })
    return {
      ...base,
      kind: "stablecoin_transfer",
      title: walletSend.title,
      body: walletSend.body,
      pushTitle: walletSend.title,
      pushBody: walletSend.body,
      category: "Stablecoin Transfer",
      emailEnabled: true,
    }
  }

  if (direction === "out" && isGlobalPayoutOffRampFlow(meta)) {
    const payoutReview = normalizePayoutReviewSnapshot(meta?.payout_review)
    const receiveAmount =
      payoutReview?.receive_amount ??
      (typeof meta?.receive_amount === "number" ? meta.receive_amount : null)
    const receiveCurrency = String(
      payoutReview?.receive_currency ?? meta?.receive_currency ?? meta?.fiat_currency ?? "",
    ).toUpperCase()
    const recipientRaw =
      (typeof (meta?.recipient_snapshot as Record<string, unknown> | undefined)?.full_name === "string"
        ? String((meta?.recipient_snapshot as Record<string, unknown>).full_name)
        : "") ||
      deriveOutboundCounterpartyName({ metadata: meta, payload: input.payload ?? null }) ||
      ""
    const recipientName = formatDisplayPersonName(recipientRaw) || recipientRaw
    const amountDisplay =
      receiveAmount != null && receiveCurrency
        ? formatMoneyDisplay(receiveAmount, receiveCurrency)
        : amountText
    const transferMethod =
      payoutReview?.transfer_method ||
      (typeof meta?.transfer_method === "string" ? String(meta.transfer_method) : "Bank transfer")
    const body = recipientName
      ? `Sent ${amountDisplay} to ${recipientName}`
      : `Sent ${amountDisplay}`
    return {
      ...base,
      kind: "bank_payout",
      title: transferMethod,
      body,
      pushTitle: transferMethod,
      pushBody: body,
      amountDisplay,
      counterpartyLabel: "Recipient",
      counterpartyName: recipientName || undefined,
      category: transferMethod,
      emailEnabled: true,
    }
  }

  if (direction === "in") {
    if (isVerificationDepositMetadata(meta)) {
      const bank = deriveVerificationBankName({ metadata: meta, payload: input.payload ?? null })
      const body = formatVerificationDepositPushBody({
        amount: input.amount,
        currency: input.currency,
        bankName: bank,
      })
      return {
        ...base,
        kind: "bank_verification_credit",
        title: "Bank verification credit",
        body,
        pushTitle: "Bank verification credit",
        pushBody: body,
        category: "Bank verification",
        emailEnabled: true,
      }
    }
    if (isBankOnrampDepositFlow(meta)) {
      return {
        ...base,
        kind: "bank_deposit",
        title: "Bank Deposit",
        body: BANK_DEPOSIT_COMPLETED_DESCRIPTION,
        pushTitle: "Bank Deposit",
        pushBody: BANK_DEPOSIT_COMPLETED_DESCRIPTION,
        category: "Bank Deposit",
        emailEnabled: true,
      }
    }
    const from = deriveEasnerInboundRemitterDisplayName({
      metadata: meta,
      payload: input.payload ?? null,
    })
    const body = from ? `Received ${amountText} from ${from}` : `Received ${amountText}`
    return {
      ...base,
      kind: "bank_deposit",
      title: "Bank Deposit",
      body,
      pushTitle: "Bank Deposit",
      pushBody: body,
      counterpartyLabel: "Sender",
      counterpartyName: from || undefined,
      category: "Bank Deposit",
      emailEnabled: true,
    }
  }

  const to = deriveOutboundCounterpartyName({ metadata: meta, payload: input.payload ?? null })
  const body = to ? `Sent ${amountText} to ${to}` : `Sent ${amountText}`
  return {
    ...base,
    kind: "bank_transfer",
    title: "Bank Transfer",
    body,
    pushTitle: "Bank Transfer",
    pushBody: body,
    counterpartyLabel: "Recipient",
    counterpartyName: to,
    category: "Bank Transfer",
    emailEnabled: true,
  }
}

export function descriptorToPushContent(descriptor: TransactionNotificationDescriptor): {
  title: string
  body: string
} {
  return { title: descriptor.pushTitle, body: descriptor.pushBody }
}
